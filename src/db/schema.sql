-- ============================================================
-- Tax Copilot - 01_schema.sql
-- テーブル定義 & インデックス（全42テーブル → 削除2 + 追加2 = 42テーブル）
-- 実行順序：このファイルを最初に実行してください
-- ============================================================
-- ※ 既存 DB への適用を想定し、すべてべき等（何度実行しても安全）
--    - CREATE TABLE IF NOT EXISTS
--    - DROP TRIGGER IF EXISTS → CREATE TRIGGER
--    - CREATE INDEX IF NOT EXISTS
--    - ALTER TABLE ADD COLUMN IF NOT EXISTS（既存テーブルへの列追加）
--    - DO $$ IF NOT EXISTS ... 制約追加
-- ============================================================
-- 変更点（前バージョンからの差分）
--   削除：33. user_roles / 34. user_sessions（Supabase Auth に一本化）
--   追加：33. client_account_ratios（家事按分率）
--   追加：34. client_tax_category_settings（税区分の顧客別設定）
--   修正：7. clients に is_taxable / tax_method / invoice_number /
--           auto_rule_addition を追加
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ヘルパー関数
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ログインユーザーの organization_id を返す
CREATE OR REPLACE FUNCTION get_my_organization_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid() LIMIT 1
$$;

-- ログインユーザーのロールを返す
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS varchar LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1
$$;

-- 指定顧客が自組織に属するか確認
CREATE OR REPLACE FUNCTION can_access_client(target_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = target_client_id
      AND c.organization_id = get_my_organization_id()
  )
$$;


-- ============================================================
-- 1. organizations（税理士事務所 / 組織）
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                varchar(255) NOT NULL,
  code                varchar(50),
  tax_office_number   varchar(20),
  representative_name varchar(100),
  postal_code         varchar(10),
  address             text,
  phone               varchar(20),
  email               varchar(255),
  plan_type           varchar(50) DEFAULT 'free',
  max_clients         integer DEFAULT 5,
  max_users           integer DEFAULT 3,
  contract_start_date date,
  contract_end_date   date,
  status              varchar(20) DEFAULT 'active',
  settings            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='organizations' AND indexname='organizations_code_key') THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_code_key UNIQUE (code);
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='organizations_plan_type_check') THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_plan_type_check CHECK (plan_type IN ('free','basic','standard','premium','pro'));
  END IF;
END; $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='organizations_status_check') THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_status_check CHECK (status IN ('active','inactive','suspended'));
  END IF;
END; $$;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 2. users（ユーザー）
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    uuid REFERENCES organizations(id) ON DELETE CASCADE,
  email              varchar(255) NOT NULL UNIQUE,
  password_hash      varchar(255),
  name               varchar(100) NOT NULL,
  role               varchar(20) NOT NULL,
  phone              varchar(20),
  avatar_url         text,
  is_active          boolean DEFAULT true,
  last_login_at      timestamptz,
  email_verified     boolean DEFAULT false,
  two_factor_enabled boolean DEFAULT false,
  preferences        jsonb DEFAULT '{}'::jsonb,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','accountant','staff'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_users_email        ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users (organization_id);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 3. industries（業種マスタ）
-- ============================================================
CREATE TABLE IF NOT EXISTS industries (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        varchar(50) NOT NULL UNIQUE,
  name        varchar(100) NOT NULL,
  description text,
  parent_id   uuid REFERENCES industries(id) ON DELETE NO ACTION,
  sort_order  integer DEFAULT 0,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_industries_code   ON industries (code);
CREATE INDEX IF NOT EXISTS idx_industries_parent ON industries (parent_id);

DROP TRIGGER IF EXISTS trg_industries_updated_at ON industries;
CREATE TRIGGER trg_industries_updated_at
  BEFORE UPDATE ON industries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 4. account_categories（勘定科目カテゴリ）
-- ============================================================
CREATE TABLE IF NOT EXISTS account_categories (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code       varchar(10) NOT NULL UNIQUE,
  name       varchar(50) NOT NULL,
  type       varchar(20) NOT NULL,   -- 'bs' | 'pl' (大文字 'BS','PL' も許容)
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='account_categories_type_check') THEN
    ALTER TABLE account_categories ADD CONSTRAINT account_categories_type_check CHECK (type IN ('bs','pl','BS','PL'));
  END IF;
END; $$;


-- ============================================================
-- 5. tax_rates（消費税率マスタ）
-- ============================================================
CREATE TABLE IF NOT EXISTS tax_rates (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  rate           numeric(5,4) NOT NULL,
  name           varchar(50) NOT NULL,
  effective_from date NOT NULL,
  effective_to   date,
  is_current     boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);


-- ============================================================
-- 6. tax_categories（税区分マスタ / 47種類・システム共通・変更不可）
-- ============================================================
CREATE TABLE IF NOT EXISTS tax_categories (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                varchar(20) NOT NULL UNIQUE,
  name                varchar(100) NOT NULL,
  display_name        varchar(100),
  type                varchar(20) NOT NULL,      -- '課税'|'非課税'|'不課税'|'免税'
  direction           varchar(20) NOT NULL,      -- '売上'|'仕入'|'その他'
  current_tax_rate_id uuid REFERENCES tax_rates(id) ON DELETE NO ACTION,
  is_reduced_rate     boolean DEFAULT false,
  require_invoice     boolean DEFAULT false,
  is_default          boolean DEFAULT false,
  is_active           boolean DEFAULT true,
  sort_order          integer DEFAULT 0,
  freee_tax_code      integer,
  description         text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='tax_categories_type_check') THEN
    ALTER TABLE tax_categories ADD CONSTRAINT tax_categories_type_check CHECK (type IN ('課税','非課税','不課税','免税'));
  END IF;
END; $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='tax_categories_direction_check') THEN
    ALTER TABLE tax_categories ADD CONSTRAINT tax_categories_direction_check CHECK (direction IN ('売上','仕入','その他'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_tax_categories_code ON tax_categories (code);
CREATE INDEX IF NOT EXISTS idx_tax_categories_type ON tax_categories (type);

DROP TRIGGER IF EXISTS trg_tax_categories_updated_at ON tax_categories;
CREATE TRIGGER trg_tax_categories_updated_at
  BEFORE UPDATE ON tax_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 7. clients（顧客 / 顧問先）
-- [修正] is_taxable / tax_method / invoice_number / auto_rule_addition 追加
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,
  industry_id              uuid REFERENCES industries(id) ON DELETE NO ACTION,
  client_code              varchar(50) UNIQUE,
  name                     varchar(255) NOT NULL,
  name_kana                varchar(255),
  representative_name      varchar(100),
  postal_code              varchar(10),
  address                  text,
  phone                    varchar(20),
  email                    varchar(255),
  website                  varchar(255),
  tax_office_name          varchar(100),
  tax_category             varchar(20) DEFAULT '原則課税',
  tax_calculation_method   integer,
  invoice_registered       boolean DEFAULT false,
  invoice_number           varchar(20),
  fiscal_year_end          varchar(5),
  accounting_method        varchar(20) DEFAULT '発生主義',
  annual_sales             bigint,
  capital_amount           bigint,
  employee_count           integer,
  freee_company_id         varchar(50),
  freee_sync_enabled       boolean DEFAULT false,
  use_custom_rules         boolean DEFAULT false,
  use_custom_account_items boolean DEFAULT false,
  auto_journal_enabled     boolean DEFAULT true,
  status                   varchar(20) DEFAULT 'active',
  contract_start_date      date,
  contract_end_date        date,
  notes                    text,
  tags                     varchar[],
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  created_by               uuid REFERENCES users(id) ON DELETE NO ACTION,
  updated_by               uuid REFERENCES users(id) ON DELETE NO ACTION
);

-- [追加列]
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_taxable         boolean DEFAULT true;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_method         varchar(10);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS auto_rule_addition boolean DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='clients_tax_method_check') THEN
    ALTER TABLE clients ADD CONSTRAINT clients_tax_method_check CHECK (tax_method IS NULL OR tax_method IN ('原則課税','簡易課税'));
  END IF;
END; $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='clients_tax_category_check') THEN
    ALTER TABLE clients ADD CONSTRAINT clients_tax_category_check CHECK (tax_category IN ('原則課税','簡易課税','免税'));
  END IF;
END; $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='clients_accounting_method_check') THEN
    ALTER TABLE clients ADD CONSTRAINT clients_accounting_method_check CHECK (accounting_method IN ('発生主義','現金主義'));
  END IF;
END; $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='clients_status_check') THEN
    ALTER TABLE clients ADD CONSTRAINT clients_status_check CHECK (status IN ('active','inactive','suspended'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_clients_organization ON clients (organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_code         ON clients (client_code);
CREATE INDEX IF NOT EXISTS idx_clients_industry     ON clients (industry_id);
CREATE INDEX IF NOT EXISTS idx_clients_status       ON clients (status);
CREATE INDEX IF NOT EXISTS idx_clients_name         ON clients (name);

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 8. account_items（勘定科目マスタ）
-- ============================================================
CREATE TABLE IF NOT EXISTS account_items (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id           uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id                 uuid REFERENCES clients(id) ON DELETE CASCADE,
  category_id               uuid NOT NULL REFERENCES account_categories(id) ON DELETE NO ACTION,
  industry_id               uuid REFERENCES industries(id) ON DELETE NO ACTION,
  code                      varchar(50) NOT NULL,
  name                      varchar(100) NOT NULL,
  name_kana                 varchar(100),
  short_name                varchar(50),
  sub_category              varchar(50),
  tax_category_id           uuid REFERENCES tax_categories(id) ON DELETE NO ACTION,
  subject_to_depreciation   boolean DEFAULT false,
  fs_category               varchar(50),
  display_order             integer DEFAULT 0,
  default_contra_account_id uuid REFERENCES account_items(id) ON DELETE NO ACTION,
  is_default                boolean DEFAULT false,
  is_system                 boolean DEFAULT false,
  is_active                 boolean DEFAULT true,
  allow_department          boolean DEFAULT true,
  allow_tag                 boolean DEFAULT true,
  freee_account_item_id     varchar(50),
  description               text,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now(),
  UNIQUE (organization_id, client_id, code)
);

CREATE INDEX IF NOT EXISTS idx_account_items_org      ON account_items (organization_id);
CREATE INDEX IF NOT EXISTS idx_account_items_client   ON account_items (client_id);
CREATE INDEX IF NOT EXISTS idx_account_items_category ON account_items (category_id);
CREATE INDEX IF NOT EXISTS idx_account_items_code     ON account_items (code);

DROP TRIGGER IF EXISTS trg_account_items_updated_at ON account_items;
CREATE TRIGGER trg_account_items_updated_at
  BEFORE UPDATE ON account_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 9. departments（部門）
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE CASCADE,
  code            varchar(50) NOT NULL,
  name            varchar(100) NOT NULL,
  parent_id       uuid REFERENCES departments(id) ON DELETE NO ACTION,
  sort_order      integer DEFAULT 0,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (organization_id, client_id, code)
);

CREATE INDEX IF NOT EXISTS idx_departments_org    ON departments (organization_id);
CREATE INDEX IF NOT EXISTS idx_departments_client ON departments (client_id);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments (parent_id);

DROP TRIGGER IF EXISTS trg_departments_updated_at ON departments;
CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 10. client_fiscal_years（顧客の会計年度）
-- ============================================================
CREATE TABLE IF NOT EXISTS client_fiscal_years (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   uuid REFERENCES clients(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  is_closed   boolean DEFAULT false,
  closed_at   timestamptz,
  closed_by   uuid REFERENCES users(id) ON DELETE NO ACTION,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (client_id, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_years_client ON client_fiscal_years (client_id);


-- ============================================================
-- 11. posting_periods（記帳期間）
-- ============================================================
CREATE TABLE IF NOT EXISTS posting_periods (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id      uuid REFERENCES clients(id) ON DELETE CASCADE,
  fiscal_year_id uuid REFERENCES client_fiscal_years(id) ON DELETE CASCADE,
  period_number  integer NOT NULL,
  period_name    varchar(20),
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  is_closed      boolean DEFAULT false,
  closed_at      timestamptz,
  closed_by      uuid REFERENCES users(id) ON DELETE NO ACTION,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (fiscal_year_id, period_number)
);

CREATE INDEX IF NOT EXISTS idx_posting_periods_client      ON posting_periods (client_id);
CREATE INDEX IF NOT EXISTS idx_posting_periods_fiscal_year ON posting_periods (fiscal_year_id);


-- ============================================================
-- 12. client_contacts（顧客の連絡先）
-- ============================================================
CREATE TABLE IF NOT EXISTS client_contacts (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id  uuid REFERENCES clients(id) ON DELETE CASCADE,
  name       varchar(100) NOT NULL,
  department varchar(100),
  position   varchar(100),
  email      varchar(255),
  phone      varchar(20),
  mobile     varchar(20),
  is_primary boolean DEFAULT false,
  notes      text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts (client_id);

DROP TRIGGER IF EXISTS trg_client_contacts_updated_at ON client_contacts;
CREATE TRIGGER trg_client_contacts_updated_at
  BEFORE UPDATE ON client_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 13. client_settings（顧客ごとの設定）
-- ============================================================
CREATE TABLE IF NOT EXISTS client_settings (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id                 uuid REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  require_receipt_approval   boolean DEFAULT false,
  auto_ocr_enabled          boolean DEFAULT true,
  ocr_confidence_threshold  numeric(3,2) DEFAULT 0.80,
  require_journal_approval  boolean DEFAULT true,
  auto_post_enabled         boolean DEFAULT false,
  default_department_id     uuid REFERENCES departments(id) ON DELETE NO ACTION,
  notification_email        varchar(255),
  notify_on_upload          boolean DEFAULT true,
  notify_on_approval_needed boolean DEFAULT true,
  notify_on_export          boolean DEFAULT true,
  settings                  jsonb DEFAULT '{}'::jsonb,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_settings_client ON client_settings (client_id);

DROP TRIGGER IF EXISTS trg_client_settings_updated_at ON client_settings;
CREATE TRIGGER trg_client_settings_updated_at
  BEFORE UPDATE ON client_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 14. suppliers（取引先マスタ / 全顧客共通・organization_id で管理）
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id         uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id               uuid REFERENCES clients(id) ON DELETE CASCADE,  -- NULL = 全顧客共通
  code                    varchar(50),
  name                    varchar(255) NOT NULL,
  name_kana               varchar(255),
  short_name              varchar(50),
  postal_code             varchar(10),
  address                 text,
  phone                   varchar(20),
  email                   varchar(255),
  invoice_number          varchar(20),
  is_invoice_registered   boolean DEFAULT false,
  supplier_type           varchar(20),
  tags                    uuid[],
  default_account_item_id uuid REFERENCES account_items(id) ON DELETE NO ACTION,
  default_tax_category_id uuid REFERENCES tax_categories(id) ON DELETE NO ACTION,
  is_active               boolean DEFAULT true,
  notes                   text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  UNIQUE (organization_id, client_id, code)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_org    ON suppliers (organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_client ON suppliers (client_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name   ON suppliers (name);

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 14b. supplier_aliases（取引先名寄せ）
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_aliases (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  alias_name  varchar(255) NOT NULL,
  source      varchar(20) DEFAULT 'manual'
              CHECK (source IN ('manual','ocr_learned','ai_suggested')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (supplier_id, alias_name)
);

CREATE INDEX IF NOT EXISTS idx_supplier_aliases_supplier ON supplier_aliases (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_aliases_name     ON supplier_aliases (alias_name);


-- ============================================================
-- 15. tags（タグマスタ）
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE CASCADE,
  name            varchar(100) NOT NULL,
  tag_type        varchar(20) NOT NULL,
  color           varchar(7),
  icon            varchar(50),
  description     text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (organization_id, client_id, name, tag_type)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='tags_tag_type_check') THEN
    ALTER TABLE tags ADD CONSTRAINT tags_tag_type_check CHECK (tag_type IN ('supplier','item','document','journal_entry','general'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_tags_org    ON tags (organization_id);
CREATE INDEX IF NOT EXISTS idx_tags_client ON tags (client_id);
CREATE INDEX IF NOT EXISTS idx_tags_type   ON tags (tag_type);

DROP TRIGGER IF EXISTS trg_tags_updated_at ON tags;
CREATE TRIGGER trg_tags_updated_at
  BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 16. items（品目マスタ）
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id         uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id               uuid REFERENCES clients(id) ON DELETE CASCADE,
  code                    varchar(50),
  name                    varchar(255) NOT NULL,
  unit                    varchar(20),
  unit_price              numeric(15,2),
  category                varchar(50),
  tags                    uuid[],
  default_account_item_id uuid REFERENCES account_items(id) ON DELETE NO ACTION,
  default_tax_category_id uuid REFERENCES tax_categories(id) ON DELETE NO ACTION,
  is_active               boolean DEFAULT true,
  description             text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  UNIQUE (organization_id, client_id, code)
);

CREATE INDEX IF NOT EXISTS idx_items_org    ON items (organization_id);
CREATE INDEX IF NOT EXISTS idx_items_client ON items (client_id);

DROP TRIGGER IF EXISTS trg_items_updated_at ON items;
CREATE TRIGGER trg_items_updated_at
  BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 17. payment_methods（支払方法マスタ）
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id         uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id               uuid REFERENCES clients(id) ON DELETE CASCADE,
  code                    varchar(20) NOT NULL,
  name                    varchar(50) NOT NULL,
  type                    varchar(20) NOT NULL,
  bank_name               varchar(100),
  branch_name             varchar(100),
  account_type            varchar(20),
  account_number          varchar(20),
  account_holder          varchar(100),
  default_account_item_id uuid REFERENCES account_items(id) ON DELETE NO ACTION,
  is_active               boolean DEFAULT true,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- グローバル UNIQUE → 組織スコープ UNIQUE に変更
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='payment_methods' AND indexname='payment_methods_code_key') THEN
    ALTER TABLE payment_methods DROP CONSTRAINT payment_methods_code_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='payment_methods' AND indexname='payment_methods_organization_id_client_id_code_key') THEN
    ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_organization_id_client_id_code_key UNIQUE (organization_id, client_id, code);
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='payment_methods_type_check') THEN
    ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_type_check CHECK (type IN ('cash','bank','card','electronic','other'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_payment_methods_org    ON payment_methods (organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_client ON payment_methods (client_id);

DROP TRIGGER IF EXISTS trg_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER trg_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 18. document_types（証憑種別マスタ / グローバル）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_types (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code              varchar(20) NOT NULL UNIQUE,
  name              varchar(50) NOT NULL,
  category          varchar(20) NOT NULL,
  icon              varchar(50),
  color             varchar(7),
  requires_approval boolean DEFAULT false,
  retention_years   integer DEFAULT 7,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now()
);


-- ============================================================
-- 18b. workflows（ワークフロー状態管理）
-- ============================================================
CREATE TABLE IF NOT EXISTS workflows (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fiscal_year_id  uuid REFERENCES client_fiscal_years(id) ON DELETE NO ACTION,
  period_number   integer,
  current_step    integer NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 8),
  completed_steps integer[] DEFAULT '{}',
  status          varchar(20) DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress','completed','cancelled')),
  started_by      uuid REFERENCES users(id) ON DELETE NO ACTION,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  -- data jsonb 構造:
  --   uploaded_document_ids: string[]   アップロード済みドキュメントID
  --   ocr_completed_ids:     string[]   OCR完了済みID
  --   ocr_pending_ids:       string[]   OCR未処理ID
  --   aicheck_status:        string     'pending'|'completed'
  --   review_completed_at:   string|null
  data            jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflows_org    ON workflows (organization_id);
CREATE INDEX IF NOT EXISTS idx_workflows_client ON workflows (client_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows (status);

DROP TRIGGER IF EXISTS trg_workflows_updated_at ON workflows;
CREATE TRIGGER trg_workflows_updated_at
  BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 19. documents（証憑 / アップロードファイル）
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id        uuid REFERENCES clients(id) ON DELETE CASCADE,
  document_type_id uuid REFERENCES document_types(id) ON DELETE NO ACTION,
  document_number  varchar(100),
  document_date    date NOT NULL,
  file_name        varchar(255) NOT NULL,
  file_path        text NOT NULL,
  file_size        bigint,
  file_type        varchar(50),
  ocr_status       varchar(20) DEFAULT 'pending',
  ocr_confidence   numeric(5,4),
  supplier_name    varchar(255),
  supplier_id      uuid REFERENCES suppliers(id) ON DELETE NO ACTION,
  amount           numeric(15,2),
  tax_amount       numeric(15,2),
  status           varchar(20) DEFAULT 'uploaded',
  is_business      boolean DEFAULT true,
  is_processed     boolean DEFAULT false,
  tags             uuid[],
  notes            text,
  timestamp_token  text,
  hash_value       varchar(64),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  uploaded_by      uuid REFERENCES users(id) ON DELETE NO ACTION
);

-- [追加列]
ALTER TABLE documents ADD COLUMN IF NOT EXISTS workflow_id        uuid;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS page_count        integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_file_name varchar(255);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path      text;

-- workflow_id FK（workflowsテーブルが存在する場合のみ）
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workflows')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='fk_documents_workflow' AND table_name='documents') THEN
    ALTER TABLE documents ADD CONSTRAINT fk_documents_workflow FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL;
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='documents_ocr_status_check') THEN
    ALTER TABLE documents ADD CONSTRAINT documents_ocr_status_check CHECK (ocr_status IN ('pending','processing','completed','error','skipped'));
  END IF;
END; $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='documents_status_check') THEN
    ALTER TABLE documents ADD CONSTRAINT documents_status_check CHECK (status IN ('uploaded','ocr_processing','ocr_completed','ai_processing','reviewed','approved','exported','excluded'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_documents_org      ON documents (organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_client   ON documents (client_id);
CREATE INDEX IF NOT EXISTS idx_documents_workflow ON documents (workflow_id);
CREATE INDEX IF NOT EXISTS idx_documents_date     ON documents (document_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_status   ON documents (status);
CREATE INDEX IF NOT EXISTS idx_documents_supplier ON documents (supplier_id);

DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 20. document_attachments（証憑の追加添付ファイル）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_attachments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  file_name   varchar(255) NOT NULL,
  file_path   text NOT NULL,
  file_size   bigint,
  file_type   varchar(50),
  description text,
  created_at  timestamptz DEFAULT now(),
  uploaded_by uuid REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_attachments_document ON document_attachments (document_id);


-- ============================================================
-- 20b. document_tags（証憑タグ中間テーブル）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_tags (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (document_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags (tag_id);


-- ============================================================
-- 21. processing_rules（自動仕訳ルール）
-- ============================================================
CREATE TABLE IF NOT EXISTS processing_rules (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id            uuid REFERENCES clients(id) ON DELETE CASCADE,
  industry_id          uuid REFERENCES industries(id) ON DELETE NO ACTION,
  rule_name            varchar(255) NOT NULL,
  priority             integer DEFAULT 100,
  scope                varchar(20) NOT NULL,   -- 'shared'|'industry'|'client'
  rule_type            varchar(20) NOT NULL,   -- '支出'|'収入'
  -- conditions jsonb 構造:
  --   supplier_pattern?:    string   取引先パターン（部分一致）
  --   transaction_pattern?: string   摘要パターン（部分一致）
  --   amount_min?:          number
  --   amount_max?:          number
  conditions           jsonb NOT NULL,
  -- actions jsonb 構造:
  --   account_item_id?:       uuid
  --   tax_category_id?:       uuid
  --   description_template?:  string
  actions              jsonb NOT NULL,
  is_active            boolean DEFAULT true,
  auto_apply           boolean DEFAULT true,
  require_confirmation boolean DEFAULT false,
  match_count          integer DEFAULT 0,
  last_matched_at      timestamptz,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  created_by           uuid REFERENCES users(id) ON DELETE NO ACTION,
  updated_by           uuid REFERENCES users(id) ON DELETE NO ACTION
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='processing_rules_scope_check') THEN
    ALTER TABLE processing_rules ADD CONSTRAINT processing_rules_scope_check CHECK (scope IN ('shared','industry','client'));
  END IF;
END; $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='processing_rules_rule_type_check') THEN
    ALTER TABLE processing_rules ADD CONSTRAINT processing_rules_rule_type_check CHECK (rule_type IN ('支出','収入'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_rules_org      ON processing_rules (organization_id);
CREATE INDEX IF NOT EXISTS idx_rules_client   ON processing_rules (client_id);
CREATE INDEX IF NOT EXISTS idx_rules_active   ON processing_rules (is_active);
CREATE INDEX IF NOT EXISTS idx_rules_priority ON processing_rules (priority);

DROP TRIGGER IF EXISTS trg_processing_rules_updated_at ON processing_rules;
CREATE TRIGGER trg_processing_rules_updated_at
  BEFORE UPDATE ON processing_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 22. journal_entries（仕訳ヘッダー）
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id         uuid REFERENCES clients(id) ON DELETE CASCADE,
  document_id       uuid REFERENCES documents(id) ON DELETE SET NULL,
  posting_period_id uuid REFERENCES posting_periods(id) ON DELETE NO ACTION,
  entry_date        date NOT NULL,
  entry_number      varchar(50),
  entry_type        varchar(20) DEFAULT 'normal',   -- 'normal'|'adjusting'|'closing'|'opening'|'reversal'
  description       text,
  supplier_id       uuid REFERENCES suppliers(id) ON DELETE NO ACTION,
  status            varchar(20) DEFAULT 'draft',    -- 'draft'|'pending'|'approved'|'posted'|'rejected'
  requires_review   boolean DEFAULT false,          -- AIチェックで要レビューフラグ
  requires_approval boolean DEFAULT false,
  ai_generated      boolean DEFAULT false,
  ai_confidence     numeric(5,4),
  rule_id           uuid REFERENCES processing_rules(id) ON DELETE NO ACTION,
  posted_at         timestamptz,
  posted_by         uuid REFERENCES users(id) ON DELETE NO ACTION,
  tags              uuid[],
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  created_by        uuid REFERENCES users(id) ON DELETE NO ACTION,
  updated_by        uuid REFERENCES users(id) ON DELETE NO ACTION
);

-- [追加列]
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_excluded     boolean DEFAULT false;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS excluded_reason varchar(100);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS excluded_by     uuid;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS excluded_at     timestamptz;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exported_at     timestamptz;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS export_id       uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='fk_journal_entries_excluded_by' AND table_name='journal_entries') THEN
    ALTER TABLE journal_entries ADD CONSTRAINT fk_journal_entries_excluded_by FOREIGN KEY (excluded_by) REFERENCES users(id) ON DELETE NO ACTION;
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='journal_entries_entry_type_check') THEN
    ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_entry_type_check CHECK (entry_type IN ('normal','adjusting','closing','opening','reversal'));
  END IF;
END; $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='journal_entries_status_check') THEN
    ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_status_check CHECK (status IN ('draft','pending','approved','posted','rejected'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_journal_entries_org      ON journal_entries (organization_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_client   ON journal_entries (client_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date     ON journal_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_document ON journal_entries (document_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status   ON journal_entries (status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_excluded ON journal_entries (is_excluded) WHERE is_excluded = true;
CREATE INDEX IF NOT EXISTS idx_journal_entries_review   ON journal_entries (requires_review) WHERE requires_review = true;

DROP TRIGGER IF EXISTS trg_journal_entries_updated_at ON journal_entries;
CREATE TRIGGER trg_journal_entries_updated_at
  BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 23. journal_entry_lines（仕訳明細行）
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_number      integer NOT NULL,
  debit_credit     varchar(10) NOT NULL,   -- 'debit'|'credit'
  account_item_id  uuid NOT NULL REFERENCES account_items(id) ON DELETE NO ACTION,
  supplier_id      uuid REFERENCES suppliers(id) ON DELETE NO ACTION,
  item_id          uuid REFERENCES items(id) ON DELETE NO ACTION,
  department_id    uuid REFERENCES departments(id) ON DELETE NO ACTION,
  amount           numeric(15,2) NOT NULL,
  tax_category_id  uuid REFERENCES tax_categories(id) ON DELETE NO ACTION,
  tax_rate         numeric(5,4),
  tax_amount       numeric(15,2),
  description      text,
  tags             uuid[],
  created_at       timestamptz DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='journal_entry_lines_debit_credit_check') THEN
    ALTER TABLE journal_entry_lines ADD CONSTRAINT journal_entry_lines_debit_credit_check CHECK (debit_credit IN ('debit','credit'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_entry_lines_entry    ON journal_entry_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_lines_account  ON journal_entry_lines (account_item_id);
CREATE INDEX IF NOT EXISTS idx_entry_lines_supplier ON journal_entry_lines (supplier_id);


-- ============================================================
-- 23b. journal_entry_tags（仕訳タグ中間テーブル）
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entry_tags (
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  tag_id           uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now(),
  PRIMARY KEY (journal_entry_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_tags_tag ON journal_entry_tags (tag_id);


-- ============================================================
-- 24. journal_entry_approvals（仕訳承認）
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entry_approvals (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE CASCADE,
  approver_id      uuid NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  approval_status  varchar(20) NOT NULL,   -- 'pending'|'approved'|'rejected'
  approval_level   integer DEFAULT 1,
  approved_at      timestamptz,
  rejection_reason text,
  comments         text,
  created_at       timestamptz DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='journal_entry_approvals_approval_status_check') THEN
    ALTER TABLE journal_entry_approvals ADD CONSTRAINT journal_entry_approvals_approval_status_check CHECK (approval_status IN ('pending','approved','rejected'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_approvals_entry    ON journal_entry_approvals (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver ON journal_entry_approvals (approver_id);


-- ============================================================
-- 25. ocr_results（OCR 読取結果）
-- ============================================================
CREATE TABLE IF NOT EXISTS ocr_results (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id             uuid REFERENCES documents(id) ON DELETE CASCADE,
  extracted_text          text,
  structured_data         jsonb,
  detected_date           date,
  detected_supplier       varchar(255),
  detected_amount         numeric(15,2),
  detected_tax_amount     numeric(15,2),
  detected_tax_rate       numeric(5,4),
  overall_confidence      numeric(5,4),
  field_confidences       jsonb,
  ocr_engine              varchar(50) DEFAULT 'gemini',
  processing_time_ms      integer,
  detected_items          jsonb,            -- 品目の配列
  detected_document_number varchar(100),
  detected_payment_method varchar(50),
  raw_response            jsonb,            -- Gemini からの生レスポンス
  retry_count             integer DEFAULT 0,
  created_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_results_document ON ocr_results (document_id);


-- ============================================================
-- 26. ocr_corrections（OCR 修正履歴）
-- ============================================================
CREATE TABLE IF NOT EXISTS ocr_corrections (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ocr_result_id   uuid REFERENCES ocr_results(id) ON DELETE CASCADE,
  field_name      varchar(50) NOT NULL,
  original_value  text,
  corrected_value text,
  corrected_at    timestamptz DEFAULT now(),
  corrected_by    uuid REFERENCES users(id) ON DELETE NO ACTION,
  reason          text
);

CREATE INDEX IF NOT EXISTS idx_corrections_ocr ON ocr_corrections (ocr_result_id);


-- ============================================================
-- 27. ai_suggestions（AI 提案）
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id               uuid REFERENCES documents(id) ON DELETE CASCADE,
  journal_entry_id          uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  suggested_account_item_id uuid REFERENCES account_items(id) ON DELETE NO ACTION,
  suggested_tax_category_id uuid REFERENCES tax_categories(id) ON DELETE NO ACTION,
  suggested_supplier_id     uuid REFERENCES suppliers(id) ON DELETE NO ACTION,
  suggested_description     text,
  suggested_amount          numeric(15,2),
  confidence                numeric(5,4),
  reasoning                 text,
  suggested_is_business     boolean,
  model_version             varchar(50),   -- 例: 'gemini-2.0-flash'
  modified_values           jsonb,         -- 税理士が修正した値の記録
  user_action               varchar(20),   -- 'accepted'|'rejected'|'modified'
  actioned_at               timestamptz,
  actioned_by               uuid REFERENCES users(id) ON DELETE NO ACTION,
  created_at                timestamptz DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='ai_suggestions_user_action_check') THEN
    ALTER TABLE ai_suggestions ADD CONSTRAINT ai_suggestions_user_action_check CHECK (user_action IS NULL OR user_action IN ('accepted','rejected','modified'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_document ON ai_suggestions (document_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_entry    ON ai_suggestions (journal_entry_id);


-- ============================================================
-- 28. rule_execution_logs（ルール実行ログ）
-- ============================================================
CREATE TABLE IF NOT EXISTS rule_execution_logs (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id          uuid REFERENCES processing_rules(id) ON DELETE SET NULL,
  document_id      uuid REFERENCES documents(id) ON DELETE CASCADE,
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  execution_result varchar(20) NOT NULL,   -- 'success'|'error'|'skipped'
  match_confidence numeric(5,4),
  error_message    text,
  executed_at      timestamptz DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='rule_execution_logs_execution_result_check') THEN
    ALTER TABLE rule_execution_logs ADD CONSTRAINT rule_execution_logs_execution_result_check CHECK (execution_result IN ('success','error','skipped'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_rule_logs_rule     ON rule_execution_logs (rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_logs_document ON rule_execution_logs (document_id);


-- ============================================================
-- 29. closing_entries（決算仕訳）
-- ============================================================
CREATE TABLE IF NOT EXISTS closing_entries (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  fiscal_year_id   uuid REFERENCES client_fiscal_years(id) ON DELETE CASCADE,
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE CASCADE,
  closing_type     varchar(50) NOT NULL,
  description      text,
  created_at       timestamptz DEFAULT now(),
  created_by       uuid REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_closing_entries_fiscal_year ON closing_entries (fiscal_year_id);


-- ============================================================
-- 30. budget_entries（予算）
-- ============================================================
CREATE TABLE IF NOT EXISTS budget_entries (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       uuid REFERENCES clients(id) ON DELETE CASCADE,
  fiscal_year_id  uuid REFERENCES client_fiscal_years(id) ON DELETE CASCADE,
  account_item_id uuid NOT NULL REFERENCES account_items(id) ON DELETE NO ACTION,
  department_id   uuid REFERENCES departments(id) ON DELETE NO ACTION,
  period_number   integer,
  budget_amount   numeric(15,2) NOT NULL,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  created_by      uuid REFERENCES users(id) ON DELETE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_entries_unique
  ON budget_entries (client_id, fiscal_year_id, account_item_id,
                     COALESCE(department_id, '00000000-0000-0000-0000-000000000000'),
                     COALESCE(period_number, -1));

CREATE INDEX IF NOT EXISTS idx_budget_entries_client  ON budget_entries (client_id);
CREATE INDEX IF NOT EXISTS idx_budget_entries_account ON budget_entries (account_item_id);


-- ============================================================
-- 31. actual_vs_budget（予算実績対比）
-- ============================================================
CREATE TABLE IF NOT EXISTS actual_vs_budget (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id        uuid REFERENCES clients(id) ON DELETE CASCADE,
  fiscal_year_id   uuid REFERENCES client_fiscal_years(id) ON DELETE CASCADE,
  period_number    integer NOT NULL,
  account_item_id  uuid NOT NULL REFERENCES account_items(id) ON DELETE NO ACTION,
  department_id    uuid REFERENCES departments(id) ON DELETE NO ACTION,
  budget_amount    numeric(15,2),
  actual_amount    numeric(15,2),
  variance_amount  numeric(15,2),
  variance_percent numeric(5,2),
  calculated_at    timestamptz DEFAULT now()
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='actual_vs_budget' AND indexname='actual_vs_budget_client_id_fiscal_year_id_period_number_acc_key') THEN
    ALTER TABLE actual_vs_budget DROP CONSTRAINT actual_vs_budget_client_id_fiscal_year_id_period_number_acc_key;
  END IF;
END; $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_actual_vs_budget_unique
  ON actual_vs_budget (client_id, fiscal_year_id, period_number, account_item_id,
                       COALESCE(department_id, '00000000-0000-0000-0000-000000000000'));

CREATE INDEX IF NOT EXISTS idx_actual_vs_budget_client ON actual_vs_budget (client_id);


-- ============================================================
-- 32. exports（エクスポート履歴）
-- ============================================================
CREATE TABLE IF NOT EXISTS exports (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE CASCADE,
  export_type     varchar(50) NOT NULL,   -- 'csv'|'freee'
  export_format   varchar(20),
  start_date      date,
  end_date        date,
  entry_count     integer,
  file_name       varchar(255),
  file_path       text,
  file_size       bigint,
  freee_export_id varchar(50),
  freee_status    varchar(20),
  freee_response  jsonb,
  status          varchar(20) DEFAULT 'pending',
  error_message   text,
  posting_period_id uuid,
  created_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  created_by      uuid REFERENCES users(id) ON DELETE NO ACTION
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='fk_exports_posting_period' AND table_name='exports') THEN
    ALTER TABLE exports ADD CONSTRAINT fk_exports_posting_period FOREIGN KEY (posting_period_id) REFERENCES posting_periods(id) ON DELETE NO ACTION;
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='exports_status_check') THEN
    ALTER TABLE exports ADD CONSTRAINT exports_status_check CHECK (status IN ('pending','processing','completed','error','cancelled'));
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_exports_org     ON exports (organization_id);
CREATE INDEX IF NOT EXISTS idx_exports_client  ON exports (client_id);
CREATE INDEX IF NOT EXISTS idx_exports_created ON exports (created_at DESC);

-- journal_entries.export_id FK（循環参照回避のため後から追加）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='fk_journal_entries_export' AND table_name='journal_entries') THEN
    ALTER TABLE journal_entries ADD CONSTRAINT fk_journal_entries_export FOREIGN KEY (export_id) REFERENCES exports(id) ON DELETE SET NULL;
  END IF;
END; $$;


-- ============================================================
-- 32b. export_entries（エクスポートと仕訳の紐付け）
-- ============================================================
CREATE TABLE IF NOT EXISTS export_entries (
  export_id        uuid NOT NULL REFERENCES exports(id) ON DELETE CASCADE,
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE NO ACTION,
  freee_deal_id    varchar(50),
  sync_status      varchar(20) DEFAULT 'synced'
                   CHECK (sync_status IN ('synced','error','pending')),
  created_at       timestamptz DEFAULT now(),
  PRIMARY KEY (export_id, journal_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_export_entries_entry ON export_entries (journal_entry_id);


-- ============================================================
-- 32c. freee_connections（freee OAuth 連携管理）
-- ============================================================
CREATE TABLE IF NOT EXISTS freee_connections (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id        uuid REFERENCES clients(id) ON DELETE CASCADE,
  freee_company_id varchar(50) NOT NULL,
  access_token     text NOT NULL,
  refresh_token    text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scope            text,
  connected_at     timestamptz DEFAULT now(),
  connected_by     uuid REFERENCES users(id) ON DELETE NO ACTION,
  last_sync_at     timestamptz,
  sync_status      varchar(20) DEFAULT 'active'
                   CHECK (sync_status IN ('active','expired','revoked','error')),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freee_connections_org    ON freee_connections (organization_id);
CREATE INDEX IF NOT EXISTS idx_freee_connections_client ON freee_connections (client_id);

DROP TRIGGER IF EXISTS trg_freee_connections_updated_at ON freee_connections;
CREATE TRIGGER trg_freee_connections_updated_at
  BEFORE UPDATE ON freee_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 33. client_account_ratios（家事按分率）  ← 旧 user_roles に替わる新規テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS client_account_ratios (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_item_id uuid NOT NULL REFERENCES account_items(id) ON DELETE CASCADE,
  -- 事業用割合（0.00〜1.00）。例: 0.70 = 70% 事業用
  business_ratio  numeric(5,4) NOT NULL CHECK (business_ratio BETWEEN 0 AND 1),
  valid_from      date NOT NULL,
  valid_until     date,   -- NULL = 無期限
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 同一顧客・同一科目・同一開始日の重複を防ぐ
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='client_account_ratios' AND indexname='client_account_ratios_unique') THEN
    ALTER TABLE client_account_ratios
      ADD CONSTRAINT client_account_ratios_unique UNIQUE (client_id, account_item_id, valid_from);
  END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_client_ratios_client  ON client_account_ratios (client_id);
CREATE INDEX IF NOT EXISTS idx_client_ratios_account ON client_account_ratios (account_item_id);

DROP TRIGGER IF EXISTS trg_client_account_ratios_updated_at ON client_account_ratios;
CREATE TRIGGER trg_client_account_ratios_updated_at
  BEFORE UPDATE ON client_account_ratios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 34. client_tax_category_settings（税区分の顧客別設定）  ← 旧 user_sessions に替わる新規テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS client_tax_category_settings (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tax_category_id uuid NOT NULL REFERENCES tax_categories(id) ON DELETE CASCADE,
  -- 税区分のデフォルト使用・収入/支出それぞれの利用可否
  use_as_default  boolean NOT NULL DEFAULT true,
  use_for_income  boolean NOT NULL DEFAULT true,
  use_for_expense boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (client_id, tax_category_id)
);

CREATE INDEX IF NOT EXISTS idx_tax_cat_settings_client   ON client_tax_category_settings (client_id);
CREATE INDEX IF NOT EXISTS idx_tax_cat_settings_tax_cat  ON client_tax_category_settings (tax_category_id);

DROP TRIGGER IF EXISTS trg_client_tax_cat_settings_updated_at ON client_tax_category_settings;
CREATE TRIGGER trg_client_tax_cat_settings_updated_at
  BEFORE UPDATE ON client_tax_category_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 35. user_activity_logs（操作ログ）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  action          varchar(100) NOT NULL,
  entity_type     varchar(50),
  entity_id       uuid,
  ip_address      inet,
  user_agent      text,
  changes         jsonb,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user    ON user_activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity  ON user_activity_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON user_activity_logs (created_at DESC);


-- ============================================================
-- 36. notifications（通知）
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            varchar(50) NOT NULL
                  CHECK (type IN ('upload','approval_needed','approved','rejected',
                                  'exported','ocr_completed','ocr_error','system')),
  title           varchar(255) NOT NULL,
  message         text,
  entity_type     varchar(50),
  entity_id       uuid,
  is_read         boolean DEFAULT false,
  read_at         timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications (user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);


-- ============================================================
-- 完了 - 全36テーブル（user_roles・user_sessions 削除、client_account_ratios・client_tax_category_settings 追加）
-- 次に 02_rls.sql を実行してください
-- ============================================================



--RLS設定
-- ============================================================
-- Tax Copilot - 02_rls.sql
-- Row Level Security（RLS）ポリシー定義
-- 実行順序：01_schema.sql の後に実行してください
-- ============================================================
-- 設計方針:
--   - 全テーブルで RLS を有効化し、デフォルトを「拒否」にする
--   - ユーザーは自分の organization に属するデータのみ操作可能
--   - グローバルマスタ（industries / account_categories / tax_rates /
--     tax_categories / document_types）は全ユーザーが SELECT 可能
--   - ログ・OCR 結果などの書き込み専用テーブルは INSERT のみ許可
--   - admin ロールは組織内の全データを操作可能
--   - service_role（サーバーサイド）はすべての RLS をバイパス可能
-- ============================================================
-- 変更点（前バージョンからの差分）
--   削除：33. user_roles / 34. user_sessions のポリシー
--   追加：33. client_account_ratios のポリシー
--   追加：34. client_tax_category_settings のポリシー
-- ============================================================
-- ※ べき等: DROP POLICY IF EXISTS → CREATE POLICY で何度でも実行可能
-- ============================================================


-- ************************************************************
-- RLS 有効化（全36テーブル）
-- ************************************************************
ALTER TABLE organizations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE industries                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_categories                ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_fiscal_years           ENABLE ROW LEVEL SECURITY;
ALTER TABLE posting_periods               ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_settings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_aliases              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE items                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods               ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types                ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_attachments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_tags                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_rules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries               ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines           ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_tags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_approvals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_results                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_corrections               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_execution_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE closing_entries               ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_entries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE actual_vs_budget              ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_entries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE freee_connections             ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_account_ratios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tax_category_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications                 ENABLE ROW LEVEL SECURITY;


-- ************************************************************
-- 1. organizations
-- 自組織のみ参照・adminのみ更新
-- ************************************************************
DROP POLICY IF EXISTS org_select ON organizations;
CREATE POLICY org_select ON organizations
  FOR SELECT USING (id = get_my_organization_id());

DROP POLICY IF EXISTS org_update ON organizations;
CREATE POLICY org_update ON organizations
  FOR UPDATE USING (id = get_my_organization_id() AND (get_my_role())::text = 'admin');


-- ************************************************************
-- 2. users
-- 同組織のユーザーを参照可能 / INSERT・DELETE は admin のみ / 自分自身は UPDATE 可能
-- ************************************************************
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = 'admin');

DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND ((get_my_role())::text = 'admin' OR id = auth.uid()));

DROP POLICY IF EXISTS users_delete ON users;
CREATE POLICY users_delete ON users
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = 'admin'
                    AND id <> auth.uid());


-- ************************************************************
-- 3. industries（グローバルマスタ）
-- 全ユーザーが読み取り可能 / admin のみ変更可能
-- ************************************************************
DROP POLICY IF EXISTS industries_select ON industries;
CREATE POLICY industries_select ON industries
  FOR SELECT USING (true);

DROP POLICY IF EXISTS industries_insert ON industries;
CREATE POLICY industries_insert ON industries
  FOR INSERT WITH CHECK ((get_my_role())::text = 'admin');

DROP POLICY IF EXISTS industries_update ON industries;
CREATE POLICY industries_update ON industries
  FOR UPDATE USING ((get_my_role())::text = 'admin');

DROP POLICY IF EXISTS industries_delete ON industries;
CREATE POLICY industries_delete ON industries
  FOR DELETE USING ((get_my_role())::text = 'admin');


-- ************************************************************
-- 4. account_categories（グローバルマスタ / 参照のみ）
-- ************************************************************
DROP POLICY IF EXISTS account_categories_select ON account_categories;
CREATE POLICY account_categories_select ON account_categories
  FOR SELECT USING (true);


-- ************************************************************
-- 5. tax_rates（グローバルマスタ / 参照のみ）
-- ************************************************************
DROP POLICY IF EXISTS tax_rates_select ON tax_rates;
CREATE POLICY tax_rates_select ON tax_rates
  FOR SELECT USING (true);


-- ************************************************************
-- 6. tax_categories（グローバルマスタ / 47種類・システム共通）
-- 全ユーザーが読み取り可能 / admin のみ変更可能（通常は変更しない）
-- ************************************************************
DROP POLICY IF EXISTS tax_categories_select ON tax_categories;
CREATE POLICY tax_categories_select ON tax_categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS tax_categories_insert ON tax_categories;
CREATE POLICY tax_categories_insert ON tax_categories
  FOR INSERT WITH CHECK ((get_my_role())::text = 'admin');

DROP POLICY IF EXISTS tax_categories_update ON tax_categories;
CREATE POLICY tax_categories_update ON tax_categories
  FOR UPDATE USING ((get_my_role())::text = 'admin');


-- ************************************************************
-- 7. clients
-- 同組織のデータのみ参照・変更 / DELETE は admin のみ
-- ************************************************************
DROP POLICY IF EXISTS clients_select ON clients;
CREATE POLICY clients_select ON clients
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS clients_insert ON clients;
CREATE POLICY clients_insert ON clients
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS clients_update ON clients;
CREATE POLICY clients_update ON clients
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS clients_delete ON clients;
CREATE POLICY clients_delete ON clients
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = 'admin');


-- ************************************************************
-- 8. account_items
-- organization_id IS NULL（デフォルト科目）も参照可能
-- is_system = true の科目は削除・更新不可
-- ************************************************************
DROP POLICY IF EXISTS account_items_select ON account_items;
CREATE POLICY account_items_select ON account_items
  FOR SELECT USING (organization_id = get_my_organization_id()
                    OR organization_id IS NULL);

DROP POLICY IF EXISTS account_items_insert ON account_items;
CREATE POLICY account_items_insert ON account_items
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS account_items_update ON account_items;
CREATE POLICY account_items_update ON account_items
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant'])
                    AND is_system = false);

DROP POLICY IF EXISTS account_items_delete ON account_items;
CREATE POLICY account_items_delete ON account_items
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = 'admin'
                    AND is_system = false);


-- ************************************************************
-- 9. departments
-- ************************************************************
DROP POLICY IF EXISTS departments_select ON departments;
CREATE POLICY departments_select ON departments
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS departments_insert ON departments;
CREATE POLICY departments_insert ON departments
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS departments_update ON departments;
CREATE POLICY departments_update ON departments
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS departments_delete ON departments;
CREATE POLICY departments_delete ON departments
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = 'admin');


-- ************************************************************
-- 10. client_fiscal_years
-- can_access_client で間接的に組織チェック
-- ************************************************************
DROP POLICY IF EXISTS fiscal_years_select ON client_fiscal_years;
CREATE POLICY fiscal_years_select ON client_fiscal_years
  FOR SELECT USING (can_access_client(client_id));

DROP POLICY IF EXISTS fiscal_years_insert ON client_fiscal_years;
CREATE POLICY fiscal_years_insert ON client_fiscal_years
  FOR INSERT WITH CHECK (can_access_client(client_id)
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS fiscal_years_update ON client_fiscal_years;
CREATE POLICY fiscal_years_update ON client_fiscal_years
  FOR UPDATE USING (can_access_client(client_id)
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 11. posting_periods
-- ************************************************************
DROP POLICY IF EXISTS posting_periods_select ON posting_periods;
CREATE POLICY posting_periods_select ON posting_periods
  FOR SELECT USING (can_access_client(client_id));

DROP POLICY IF EXISTS posting_periods_insert ON posting_periods;
CREATE POLICY posting_periods_insert ON posting_periods
  FOR INSERT WITH CHECK (can_access_client(client_id)
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS posting_periods_update ON posting_periods;
CREATE POLICY posting_periods_update ON posting_periods
  FOR UPDATE USING (can_access_client(client_id)
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 12. client_contacts
-- ************************************************************
DROP POLICY IF EXISTS client_contacts_select ON client_contacts;
CREATE POLICY client_contacts_select ON client_contacts
  FOR SELECT USING (can_access_client(client_id));

DROP POLICY IF EXISTS client_contacts_insert ON client_contacts;
CREATE POLICY client_contacts_insert ON client_contacts
  FOR INSERT WITH CHECK (can_access_client(client_id));

DROP POLICY IF EXISTS client_contacts_update ON client_contacts;
CREATE POLICY client_contacts_update ON client_contacts
  FOR UPDATE USING (can_access_client(client_id));

DROP POLICY IF EXISTS client_contacts_delete ON client_contacts;
CREATE POLICY client_contacts_delete ON client_contacts
  FOR DELETE USING (can_access_client(client_id)
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 13. client_settings
-- ************************************************************
DROP POLICY IF EXISTS client_settings_select ON client_settings;
CREATE POLICY client_settings_select ON client_settings
  FOR SELECT USING (can_access_client(client_id));

DROP POLICY IF EXISTS client_settings_insert ON client_settings;
CREATE POLICY client_settings_insert ON client_settings
  FOR INSERT WITH CHECK (can_access_client(client_id)
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS client_settings_update ON client_settings;
CREATE POLICY client_settings_update ON client_settings
  FOR UPDATE USING (can_access_client(client_id)
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 14. suppliers
-- 全顧客共通管理（organization_id で制御）
-- DELETE は admin / accountant のみ
-- ************************************************************
DROP POLICY IF EXISTS suppliers_select ON suppliers;
CREATE POLICY suppliers_select ON suppliers
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS suppliers_insert ON suppliers;
CREATE POLICY suppliers_insert ON suppliers
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS suppliers_update ON suppliers;
CREATE POLICY suppliers_update ON suppliers
  FOR UPDATE USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS suppliers_delete ON suppliers;
CREATE POLICY suppliers_delete ON suppliers
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 14b. supplier_aliases
-- 親 supplier が自組織に属する場合のみ操作可能
-- DELETE は admin / accountant のみ
-- ************************************************************
DROP POLICY IF EXISTS supplier_aliases_select ON supplier_aliases;
CREATE POLICY supplier_aliases_select ON supplier_aliases
  FOR SELECT USING (supplier_id IN (
    SELECT id FROM suppliers WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS supplier_aliases_insert ON supplier_aliases;
CREATE POLICY supplier_aliases_insert ON supplier_aliases
  FOR INSERT WITH CHECK (supplier_id IN (
    SELECT id FROM suppliers WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS supplier_aliases_update ON supplier_aliases;
CREATE POLICY supplier_aliases_update ON supplier_aliases
  FOR UPDATE USING (supplier_id IN (
    SELECT id FROM suppliers WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS supplier_aliases_delete ON supplier_aliases;
CREATE POLICY supplier_aliases_delete ON supplier_aliases
  FOR DELETE USING (supplier_id IN (
      SELECT id FROM suppliers WHERE organization_id = get_my_organization_id()
    )
    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 15. tags
-- ************************************************************
DROP POLICY IF EXISTS tags_select ON tags;
CREATE POLICY tags_select ON tags
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS tags_insert ON tags;
CREATE POLICY tags_insert ON tags
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS tags_update ON tags;
CREATE POLICY tags_update ON tags
  FOR UPDATE USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS tags_delete ON tags;
CREATE POLICY tags_delete ON tags
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 16. items
-- ************************************************************
DROP POLICY IF EXISTS items_select ON items;
CREATE POLICY items_select ON items
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS items_insert ON items;
CREATE POLICY items_insert ON items
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS items_update ON items;
CREATE POLICY items_update ON items
  FOR UPDATE USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS items_delete ON items;
CREATE POLICY items_delete ON items
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 17. payment_methods
-- ************************************************************
DROP POLICY IF EXISTS payment_methods_select ON payment_methods;
CREATE POLICY payment_methods_select ON payment_methods
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS payment_methods_insert ON payment_methods;
CREATE POLICY payment_methods_insert ON payment_methods
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS payment_methods_update ON payment_methods;
CREATE POLICY payment_methods_update ON payment_methods
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS payment_methods_delete ON payment_methods;
CREATE POLICY payment_methods_delete ON payment_methods
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = 'admin');


-- ************************************************************
-- 18. document_types（グローバルマスタ）
-- 全ユーザーが読み取り可能 / admin のみ変更可能
-- ************************************************************
DROP POLICY IF EXISTS document_types_select ON document_types;
CREATE POLICY document_types_select ON document_types
  FOR SELECT USING (true);

DROP POLICY IF EXISTS document_types_insert ON document_types;
CREATE POLICY document_types_insert ON document_types
  FOR INSERT WITH CHECK ((get_my_role())::text = 'admin');

DROP POLICY IF EXISTS document_types_update ON document_types;
CREATE POLICY document_types_update ON document_types
  FOR UPDATE USING ((get_my_role())::text = 'admin');


-- ************************************************************
-- 18b. workflows
-- ************************************************************
DROP POLICY IF EXISTS workflows_select ON workflows;
CREATE POLICY workflows_select ON workflows
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS workflows_insert ON workflows;
CREATE POLICY workflows_insert ON workflows
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS workflows_update ON workflows;
CREATE POLICY workflows_update ON workflows
  FOR UPDATE USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS workflows_delete ON workflows;
CREATE POLICY workflows_delete ON workflows
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 19. documents
-- DELETE は admin のみ（証憑の完全削除は管理者権限）
-- ************************************************************
DROP POLICY IF EXISTS documents_select ON documents;
CREATE POLICY documents_select ON documents
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS documents_insert ON documents;
CREATE POLICY documents_insert ON documents
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS documents_update ON documents;
CREATE POLICY documents_update ON documents
  FOR UPDATE USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS documents_delete ON documents;
CREATE POLICY documents_delete ON documents
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = 'admin');


-- ************************************************************
-- 20. document_attachments
-- 親 document が自組織に属する場合のみ操作可能
-- ************************************************************
DROP POLICY IF EXISTS document_attachments_select ON document_attachments;
CREATE POLICY document_attachments_select ON document_attachments
  FOR SELECT USING (document_id IN (
    SELECT id FROM documents WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS document_attachments_insert ON document_attachments;
CREATE POLICY document_attachments_insert ON document_attachments
  FOR INSERT WITH CHECK (document_id IN (
    SELECT id FROM documents WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS document_attachments_delete ON document_attachments;
CREATE POLICY document_attachments_delete ON document_attachments
  FOR DELETE USING (document_id IN (
      SELECT id FROM documents WHERE organization_id = get_my_organization_id()
    )
    AND (get_my_role())::text = 'admin');


-- ************************************************************
-- 20b. document_tags
-- ************************************************************
DROP POLICY IF EXISTS document_tags_select ON document_tags;
CREATE POLICY document_tags_select ON document_tags
  FOR SELECT USING (document_id IN (
    SELECT id FROM documents WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS document_tags_insert ON document_tags;
CREATE POLICY document_tags_insert ON document_tags
  FOR INSERT WITH CHECK (document_id IN (
    SELECT id FROM documents WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS document_tags_delete ON document_tags;
CREATE POLICY document_tags_delete ON document_tags
  FOR DELETE USING (document_id IN (
    SELECT id FROM documents WHERE organization_id = get_my_organization_id()
  ));


-- ************************************************************
-- 21. processing_rules
-- ************************************************************
DROP POLICY IF EXISTS processing_rules_select ON processing_rules;
CREATE POLICY processing_rules_select ON processing_rules
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS processing_rules_insert ON processing_rules;
CREATE POLICY processing_rules_insert ON processing_rules
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS processing_rules_update ON processing_rules;
CREATE POLICY processing_rules_update ON processing_rules
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS processing_rules_delete ON processing_rules;
CREATE POLICY processing_rules_delete ON processing_rules
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 22. journal_entries
-- status = 'posted' の仕訳は更新不可（確定済み）
-- DELETE は admin / accountant かつ status = 'draft' のみ
-- ************************************************************
DROP POLICY IF EXISTS journal_entries_select ON journal_entries;
CREATE POLICY journal_entries_select ON journal_entries
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS journal_entries_insert ON journal_entries;
CREATE POLICY journal_entries_insert ON journal_entries
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS journal_entries_update ON journal_entries;
CREATE POLICY journal_entries_update ON journal_entries
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND status <> 'posted');

DROP POLICY IF EXISTS journal_entries_delete ON journal_entries;
CREATE POLICY journal_entries_delete ON journal_entries
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant'])
                    AND status = 'draft');


-- ************************************************************
-- 23. journal_entry_lines
-- 親 journal_entry が自組織かつ status = 'draft' の場合のみ書き込み可能
-- ************************************************************
DROP POLICY IF EXISTS entry_lines_select ON journal_entry_lines;
CREATE POLICY entry_lines_select ON journal_entry_lines
  FOR SELECT USING (journal_entry_id IN (
    SELECT id FROM journal_entries WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS entry_lines_insert ON journal_entry_lines;
CREATE POLICY entry_lines_insert ON journal_entry_lines
  FOR INSERT WITH CHECK (journal_entry_id IN (
    SELECT id FROM journal_entries
    WHERE organization_id = get_my_organization_id() AND status = 'draft'
  ));

DROP POLICY IF EXISTS entry_lines_update ON journal_entry_lines;
CREATE POLICY entry_lines_update ON journal_entry_lines
  FOR UPDATE USING (journal_entry_id IN (
    SELECT id FROM journal_entries
    WHERE organization_id = get_my_organization_id() AND status = 'draft'
  ));

DROP POLICY IF EXISTS entry_lines_delete ON journal_entry_lines;
CREATE POLICY entry_lines_delete ON journal_entry_lines
  FOR DELETE USING (journal_entry_id IN (
    SELECT id FROM journal_entries
    WHERE organization_id = get_my_organization_id() AND status = 'draft'
  ));


-- ************************************************************
-- 23b. journal_entry_tags
-- ************************************************************
DROP POLICY IF EXISTS journal_entry_tags_select ON journal_entry_tags;
CREATE POLICY journal_entry_tags_select ON journal_entry_tags
  FOR SELECT USING (journal_entry_id IN (
    SELECT id FROM journal_entries WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS journal_entry_tags_insert ON journal_entry_tags;
CREATE POLICY journal_entry_tags_insert ON journal_entry_tags
  FOR INSERT WITH CHECK (journal_entry_id IN (
    SELECT id FROM journal_entries WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS journal_entry_tags_delete ON journal_entry_tags;
CREATE POLICY journal_entry_tags_delete ON journal_entry_tags
  FOR DELETE USING (journal_entry_id IN (
    SELECT id FROM journal_entries WHERE organization_id = get_my_organization_id()
  ));


-- ************************************************************
-- 24. journal_entry_approvals
-- 承認者本人のみ INSERT / UPDATE 可能
-- ************************************************************
DROP POLICY IF EXISTS approvals_select ON journal_entry_approvals;
CREATE POLICY approvals_select ON journal_entry_approvals
  FOR SELECT USING (journal_entry_id IN (
    SELECT id FROM journal_entries WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS approvals_insert ON journal_entry_approvals;
CREATE POLICY approvals_insert ON journal_entry_approvals
  FOR INSERT WITH CHECK (approver_id = auth.uid());

DROP POLICY IF EXISTS approvals_update ON journal_entry_approvals;
CREATE POLICY approvals_update ON journal_entry_approvals
  FOR UPDATE USING (approver_id = auth.uid());


-- ************************************************************
-- 25. ocr_results
-- 親 document が自組織に属する場合のみ参照・書き込み可能
-- INSERT のみ許可（OCR 結果は書き込み専用）
-- ************************************************************
DROP POLICY IF EXISTS ocr_results_select ON ocr_results;
CREATE POLICY ocr_results_select ON ocr_results
  FOR SELECT USING (document_id IN (
    SELECT id FROM documents WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS ocr_results_insert ON ocr_results;
CREATE POLICY ocr_results_insert ON ocr_results
  FOR INSERT WITH CHECK (document_id IN (
    SELECT id FROM documents WHERE organization_id = get_my_organization_id()
  ));


-- ************************************************************
-- 26. ocr_corrections
-- ************************************************************
DROP POLICY IF EXISTS ocr_corrections_select ON ocr_corrections;
CREATE POLICY ocr_corrections_select ON ocr_corrections
  FOR SELECT USING (ocr_result_id IN (
    SELECT r.id FROM ocr_results r
    JOIN documents d ON d.id = r.document_id
    WHERE d.organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS ocr_corrections_insert ON ocr_corrections;
CREATE POLICY ocr_corrections_insert ON ocr_corrections
  FOR INSERT WITH CHECK (ocr_result_id IN (
    SELECT r.id FROM ocr_results r
    JOIN documents d ON d.id = r.document_id
    WHERE d.organization_id = get_my_organization_id()
  ));


-- ************************************************************
-- 27. ai_suggestions
-- INSERT のみ許可（AI 提案は書き込み専用）
-- ************************************************************
DROP POLICY IF EXISTS ai_suggestions_select ON ai_suggestions;
CREATE POLICY ai_suggestions_select ON ai_suggestions
  FOR SELECT USING (document_id IN (
    SELECT id FROM documents WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS ai_suggestions_insert ON ai_suggestions;
CREATE POLICY ai_suggestions_insert ON ai_suggestions
  FOR INSERT WITH CHECK (document_id IN (
    SELECT id FROM documents WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS ai_suggestions_update ON ai_suggestions;
CREATE POLICY ai_suggestions_update ON ai_suggestions
  FOR UPDATE USING (document_id IN (
    SELECT id FROM documents WHERE organization_id = get_my_organization_id()
  ));


-- ************************************************************
-- 28. rule_execution_logs
-- INSERT のみ許可（実行ログは書き込み専用）
-- ************************************************************
DROP POLICY IF EXISTS rule_logs_select ON rule_execution_logs;
CREATE POLICY rule_logs_select ON rule_execution_logs
  FOR SELECT USING (document_id IN (
    SELECT id FROM documents WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS rule_logs_insert ON rule_execution_logs;
CREATE POLICY rule_logs_insert ON rule_execution_logs
  FOR INSERT WITH CHECK (document_id IN (
    SELECT id FROM documents WHERE organization_id = get_my_organization_id()
  ));


-- ************************************************************
-- 29. closing_entries
-- INSERT は admin / accountant のみ
-- ************************************************************
DROP POLICY IF EXISTS closing_entries_select ON closing_entries;
CREATE POLICY closing_entries_select ON closing_entries
  FOR SELECT USING (fiscal_year_id IN (
    SELECT id FROM client_fiscal_years WHERE can_access_client(client_id)
  ));

DROP POLICY IF EXISTS closing_entries_insert ON closing_entries;
CREATE POLICY closing_entries_insert ON closing_entries
  FOR INSERT WITH CHECK ((get_my_role())::text = ANY (ARRAY['admin','accountant'])
                         AND fiscal_year_id IN (
                           SELECT id FROM client_fiscal_years WHERE can_access_client(client_id)
                         ));


-- ************************************************************
-- 30. budget_entries
-- DELETE は admin のみ
-- ************************************************************
DROP POLICY IF EXISTS budget_entries_select ON budget_entries;
CREATE POLICY budget_entries_select ON budget_entries
  FOR SELECT USING (can_access_client(client_id));

DROP POLICY IF EXISTS budget_entries_insert ON budget_entries;
CREATE POLICY budget_entries_insert ON budget_entries
  FOR INSERT WITH CHECK (can_access_client(client_id)
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS budget_entries_update ON budget_entries;
CREATE POLICY budget_entries_update ON budget_entries
  FOR UPDATE USING (can_access_client(client_id)
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS budget_entries_delete ON budget_entries;
CREATE POLICY budget_entries_delete ON budget_entries
  FOR DELETE USING (can_access_client(client_id)
                    AND (get_my_role())::text = 'admin');


-- ************************************************************
-- 31. actual_vs_budget（予算実績対比）
-- ************************************************************
DROP POLICY IF EXISTS actual_vs_budget_select ON actual_vs_budget;
CREATE POLICY actual_vs_budget_select ON actual_vs_budget
  FOR SELECT USING (can_access_client(client_id));

DROP POLICY IF EXISTS actual_vs_budget_insert ON actual_vs_budget;
CREATE POLICY actual_vs_budget_insert ON actual_vs_budget
  FOR INSERT WITH CHECK (can_access_client(client_id));

DROP POLICY IF EXISTS actual_vs_budget_update ON actual_vs_budget;
CREATE POLICY actual_vs_budget_update ON actual_vs_budget
  FOR UPDATE USING (can_access_client(client_id));


-- ************************************************************
-- 32. exports
-- ************************************************************
DROP POLICY IF EXISTS exports_select ON exports;
CREATE POLICY exports_select ON exports
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS exports_insert ON exports;
CREATE POLICY exports_insert ON exports
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS exports_update ON exports;
CREATE POLICY exports_update ON exports
  FOR UPDATE USING (organization_id = get_my_organization_id());


-- ************************************************************
-- 32b. export_entries
-- ************************************************************
DROP POLICY IF EXISTS export_entries_select ON export_entries;
CREATE POLICY export_entries_select ON export_entries
  FOR SELECT USING (export_id IN (
    SELECT id FROM exports WHERE organization_id = get_my_organization_id()
  ));

DROP POLICY IF EXISTS export_entries_insert ON export_entries;
CREATE POLICY export_entries_insert ON export_entries
  FOR INSERT WITH CHECK (export_id IN (
    SELECT id FROM exports WHERE organization_id = get_my_organization_id()
  ));


-- ************************************************************
-- 32c. freee_connections
-- DELETE は admin のみ
-- ************************************************************
DROP POLICY IF EXISTS freee_connections_select ON freee_connections;
CREATE POLICY freee_connections_select ON freee_connections
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS freee_connections_insert ON freee_connections;
CREATE POLICY freee_connections_insert ON freee_connections
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS freee_connections_update ON freee_connections;
CREATE POLICY freee_connections_update ON freee_connections
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS freee_connections_delete ON freee_connections;
CREATE POLICY freee_connections_delete ON freee_connections
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = 'admin');


-- ************************************************************
-- 33. client_account_ratios（家事按分率）
-- DELETE は admin / accountant のみ
-- ************************************************************
DROP POLICY IF EXISTS client_account_ratios_select ON client_account_ratios;
CREATE POLICY client_account_ratios_select ON client_account_ratios
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS client_account_ratios_insert ON client_account_ratios;
CREATE POLICY client_account_ratios_insert ON client_account_ratios
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS client_account_ratios_update ON client_account_ratios;
CREATE POLICY client_account_ratios_update ON client_account_ratios
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS client_account_ratios_delete ON client_account_ratios;
CREATE POLICY client_account_ratios_delete ON client_account_ratios
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 34. client_tax_category_settings（税区分の顧客別設定）
-- 顧客の設定なのでアクセス制御は can_access_client ベースが自然だが
-- organization_id カラムを持つため organization_id ベースで統一
-- DELETE は admin / accountant のみ
-- ************************************************************
DROP POLICY IF EXISTS client_tax_cat_settings_select ON client_tax_category_settings;
CREATE POLICY client_tax_cat_settings_select ON client_tax_category_settings
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS client_tax_cat_settings_insert ON client_tax_category_settings;
CREATE POLICY client_tax_cat_settings_insert ON client_tax_category_settings
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS client_tax_cat_settings_update ON client_tax_category_settings;
CREATE POLICY client_tax_cat_settings_update ON client_tax_category_settings
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));

DROP POLICY IF EXISTS client_tax_cat_settings_delete ON client_tax_category_settings;
CREATE POLICY client_tax_cat_settings_delete ON client_tax_category_settings
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 35. user_activity_logs
-- 操作ログは INSERT のみ許可 / SELECT は admin または本人のみ
-- ************************************************************
DROP POLICY IF EXISTS activity_logs_select ON user_activity_logs;
CREATE POLICY activity_logs_select ON user_activity_logs
  FOR SELECT USING (organization_id = get_my_organization_id()
                    AND ((get_my_role())::text = 'admin' OR user_id = auth.uid()));

DROP POLICY IF EXISTS activity_logs_insert ON user_activity_logs;
CREATE POLICY activity_logs_insert ON user_activity_logs
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());


-- ************************************************************
-- 36. notifications
-- 本人宛の通知のみ参照・更新・削除可能
-- INSERT は組織内から可能（サーバーサイドが生成）
-- ************************************************************
DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete ON notifications;
CREATE POLICY notifications_delete ON notifications
  FOR DELETE USING (user_id = auth.uid());


-- ============================================================
-- 完了 - 全36テーブルの RLS ポリシー定義
-- service_role は Supabase のデフォルトで RLS をバイパスします
-- ============================================================