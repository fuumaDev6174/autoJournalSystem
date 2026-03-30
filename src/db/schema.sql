-- ============================================================
-- Tax Copilot - 02_business_tables.sql
-- 業務テーブル（全46テーブル中 19テーブル）
-- 最終更新: 2026-03-22（現行Supabase DBより自動生成）
-- ============================================================
-- 対象テーブル:
--  12. clients                 顧客（19行）
--  13. client_fiscal_years     会計年度（19行）
--  14. client_contacts         顧客連絡先（8行）
--  15. client_settings         顧客設定（19行）
--  16. client_industries       顧客×業種中間（0行）
--  17. posting_periods         月次締め期間（0行）
--  18. suppliers               取引先（66行）
--  19. items                   品目（76行）
--  20. workflows               ワークフロー（29行）
--  21. documents               証憑（163行）
--  22. ocr_results             OCR結果（0行）
--  23. journal_entries         仕訳ヘッダー（126行）
--  24. journal_entry_lines     仕訳明細行（240行）
--  25. journal_entry_approvals 仕訳承認（64行）
--  26. processing_rules        自動仕訳ルール（8行）
--  27. ai_suggestions          AI提案（0行）
--  28. exports                 エクスポート（0行）
--  29. export_entries          エクスポート×仕訳中間（0行）
-- ============================================================


-- ============================================================
-- 12. clients（顧客）
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        uuid REFERENCES organizations(id) ON DELETE CASCADE,
  industry_id            uuid REFERENCES industries(id) ON DELETE NO ACTION,
  client_code            varchar(50) UNIQUE,
  name                   varchar(255) NOT NULL,
  name_kana              varchar(255),
  representative_name    varchar(100),
  postal_code            varchar(10),
  address                text,
  phone                  varchar(20),
  email                  varchar(255),
  website                varchar(255),
  tax_office_name        varchar(100),
  tax_category           varchar(20) DEFAULT '原則課税',
  tax_calculation_method integer,
  invoice_registered     boolean DEFAULT false,
  invoice_number         varchar(20),
  fiscal_year_end        varchar(5),
  accounting_method      varchar(20) DEFAULT '発生主義',
  annual_sales           bigint,
  capital_amount         bigint,
  employee_count         integer,
  freee_company_id       varchar(50),
  freee_sync_enabled     boolean DEFAULT false,
  use_custom_rules       boolean DEFAULT false,
  use_custom_account_items boolean DEFAULT false,
  auto_journal_enabled   boolean DEFAULT true,
  status                 varchar(20) DEFAULT 'active',
  contract_start_date    date,
  contract_end_date      date,
  notes                  text,
  tags                   varchar[],
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  created_by             uuid REFERENCES users(id) ON DELETE NO ACTION,
  updated_by             uuid REFERENCES users(id) ON DELETE NO ACTION,
  -- Block 1-A 追加カラム
  is_taxable             boolean DEFAULT true,
  tax_method             varchar(10),
  auto_rule_addition     boolean DEFAULT false
);

-- CHECK
ALTER TABLE clients ADD CONSTRAINT clients_tax_category_check
  CHECK (tax_category IN ('原則課税','簡易課税','免税'));
ALTER TABLE clients ADD CONSTRAINT clients_tax_method_check
  CHECK (tax_method IS NULL OR tax_method IN ('原則課税','簡易課税'));
ALTER TABLE clients ADD CONSTRAINT clients_accounting_method_check
  CHECK (accounting_method IN ('発生主義','現金主義'));
ALTER TABLE clients ADD CONSTRAINT clients_status_check
  CHECK (status IN ('active','inactive','suspended'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_clients_organization ON clients (organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_industry     ON clients (industry_id);
CREATE INDEX IF NOT EXISTS idx_clients_code         ON clients (client_code);
CREATE INDEX IF NOT EXISTS idx_clients_status       ON clients (status);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 13. client_fiscal_years（会計年度）
-- ============================================================
CREATE TABLE IF NOT EXISTS client_fiscal_years (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    uuid REFERENCES clients(id) ON DELETE CASCADE,
  fiscal_year  integer NOT NULL,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  is_closed    boolean DEFAULT false,
  closed_at    timestamptz,
  closed_by    uuid REFERENCES users(id) ON DELETE NO ACTION,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

-- UNIQUE
ALTER TABLE client_fiscal_years ADD CONSTRAINT client_fiscal_years_client_id_fiscal_year_key
  UNIQUE (client_id, fiscal_year);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_fiscal_years_client ON client_fiscal_years (client_id);


-- ============================================================
-- 14. client_contacts（顧客連絡先）
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

-- INDEX
CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts (client_id);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_client_contacts_updated_at ON client_contacts;
CREATE TRIGGER trg_client_contacts_updated_at
  BEFORE UPDATE ON client_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 15. client_settings（顧客ごとの設定）
-- ============================================================
CREATE TABLE IF NOT EXISTS client_settings (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id                 uuid REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  require_receipt_approval  boolean DEFAULT false,
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

-- INDEX
CREATE INDEX IF NOT EXISTS idx_client_settings_client ON client_settings (client_id);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_client_settings_updated_at ON client_settings;
CREATE TRIGGER trg_client_settings_updated_at
  BEFORE UPDATE ON client_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 16. client_industries（顧客×業種 中間テーブル）
-- ============================================================
CREATE TABLE IF NOT EXISTS client_industries (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  industry_id uuid NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
  is_primary  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- UNIQUE
ALTER TABLE client_industries ADD CONSTRAINT client_industries_client_id_industry_id_key
  UNIQUE (client_id, industry_id);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_client_industries_client   ON client_industries (client_id);
CREATE INDEX IF NOT EXISTS idx_client_industries_industry ON client_industries (industry_id);


-- ============================================================
-- 17. posting_periods（月次締め期間）
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
  created_at     timestamptz DEFAULT now()
);

-- UNIQUE
ALTER TABLE posting_periods ADD CONSTRAINT posting_periods_fiscal_year_id_period_number_key
  UNIQUE (fiscal_year_id, period_number);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_posting_periods_client      ON posting_periods (client_id);
CREATE INDEX IF NOT EXISTS idx_posting_periods_fiscal_year ON posting_periods (fiscal_year_id);


-- ============================================================
-- 18. suppliers（取引先）
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id         uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id               uuid REFERENCES clients(id) ON DELETE CASCADE,
  code                    varchar(50),
  name                    varchar(255) NOT NULL,
  name_kana               varchar(255),
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
  category                varchar(50)
);

-- UNIQUE
ALTER TABLE suppliers ADD CONSTRAINT suppliers_organization_id_client_id_code_key
  UNIQUE (organization_id, client_id, code);

-- UNIQUE INDEX（codeがNOT NULLの場合のみ）
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_code_org_unique
  ON suppliers (organization_id, code) WHERE (code IS NOT NULL);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_suppliers_org    ON suppliers (organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_client ON suppliers (client_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name   ON suppliers (name);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 19. items（品目マスタ）
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
  updated_at              timestamptz DEFAULT now()
);

-- UNIQUE
ALTER TABLE items ADD CONSTRAINT items_organization_id_client_id_code_key
  UNIQUE (organization_id, client_id, code);

-- UNIQUE INDEX（codeがNOT NULLの場合のみ）
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_code_unique
  ON items (code) WHERE (code IS NOT NULL);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_items_org    ON items (organization_id);
CREATE INDEX IF NOT EXISTS idx_items_client ON items (client_id);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_items_updated_at ON items;
CREATE TRIGGER trg_items_updated_at
  BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 20. workflows（ワークフロー）
-- ============================================================
CREATE TABLE IF NOT EXISTS workflows (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fiscal_year_id  uuid REFERENCES client_fiscal_years(id) ON DELETE NO ACTION,
  period_number   integer,
  current_step    integer NOT NULL DEFAULT 1,
  completed_steps integer[] DEFAULT '{}'::integer[],
  status          varchar(20) DEFAULT 'in_progress',
  started_by      uuid REFERENCES users(id) ON DELETE NO ACTION,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  data            jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  completed_by    uuid REFERENCES users(id) ON DELETE NO ACTION
);

-- CHECK
ALTER TABLE workflows ADD CONSTRAINT workflows_current_step_check
  CHECK (current_step >= 1 AND current_step <= 8);
ALTER TABLE workflows ADD CONSTRAINT workflows_status_check
  CHECK (status IN ('in_progress','completed','cancelled'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_workflows_org    ON workflows (organization_id);
CREATE INDEX IF NOT EXISTS idx_workflows_client ON workflows (client_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows (status);

-- TRIGGER（INSERT時にorg_id自動設定 + UPDATE時にupdated_at更新）
DROP TRIGGER IF EXISTS trg_set_workflow_org_id ON workflows;
CREATE TRIGGER trg_set_workflow_org_id
  BEFORE INSERT ON workflows FOR EACH ROW EXECUTE FUNCTION set_workflow_organization_id();

DROP TRIGGER IF EXISTS trg_workflows_updated_at ON workflows;
CREATE TRIGGER trg_workflows_updated_at
  BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 21. documents（証憑ファイル）
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id         uuid REFERENCES clients(id) ON DELETE CASCADE,
  document_type_id  uuid REFERENCES document_types(id) ON DELETE NO ACTION,
  document_number   varchar(100),
  document_date     date NOT NULL,
  file_name         varchar(255) NOT NULL,
  file_path         text NOT NULL,
  file_size         bigint,
  file_type         varchar(50),
  ocr_status        varchar(20) DEFAULT 'pending',
  ocr_confidence    numeric(5,4),
  supplier_name     varchar(255),
  supplier_id       uuid REFERENCES suppliers(id) ON DELETE NO ACTION,
  amount            numeric(15,2),
  tax_amount        numeric(15,2),
  status            varchar(20) DEFAULT 'uploaded',
  is_business       boolean DEFAULT true,
  is_processed      boolean DEFAULT false,
  tags              uuid[],
  notes             text,
  timestamp_token   text,
  hash_value        varchar(64),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  uploaded_by       uuid REFERENCES users(id) ON DELETE NO ACTION,
  workflow_id       uuid,     -- FK未設定（循環参照回避）
  page_count        integer,
  original_file_name varchar(255),
  storage_path      text
);

-- CHECK
ALTER TABLE documents ADD CONSTRAINT documents_ocr_status_check
  CHECK (ocr_status IN ('pending','processing','completed','error','skipped'));
ALTER TABLE documents ADD CONSTRAINT documents_status_check
  CHECK (status IN ('uploaded','ocr_processing','ocr_completed','ai_processing','reviewed','approved','exported','excluded'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_documents_org      ON documents (organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_client   ON documents (client_id);
CREATE INDEX IF NOT EXISTS idx_documents_date     ON documents (document_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_status   ON documents (status);
CREATE INDEX IF NOT EXISTS idx_documents_supplier ON documents (supplier_id);
CREATE INDEX IF NOT EXISTS idx_documents_workflow ON documents (workflow_id);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 22. ocr_results（OCR抽出結果）
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
  created_at              timestamptz DEFAULT now(),
  detected_items          jsonb,
  detected_document_number varchar(100),
  detected_payment_method varchar(50),
  raw_response            jsonb,
  retry_count             integer DEFAULT 0
);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_ocr_results_document ON ocr_results (document_id);


-- ============================================================
-- 23. journal_entries（仕訳ヘッダー）
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id         uuid REFERENCES clients(id) ON DELETE CASCADE,
  document_id       uuid REFERENCES documents(id) ON DELETE SET NULL,
  posting_period_id uuid REFERENCES posting_periods(id) ON DELETE NO ACTION,
  entry_date        date NOT NULL,
  entry_number      varchar(50),
  entry_type        varchar(20) DEFAULT 'normal',
  description       text,
  supplier_id       uuid REFERENCES suppliers(id) ON DELETE NO ACTION,
  status            varchar(20) DEFAULT 'draft',
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
  updated_by        uuid REFERENCES users(id) ON DELETE NO ACTION,
  -- 対象外関連
  is_excluded       boolean DEFAULT false,
  excluded_reason   varchar(100),
  excluded_by       uuid REFERENCES users(id) ON DELETE NO ACTION,
  excluded_at       timestamptz,
  -- エクスポート関連
  exported_at       timestamptz,
  export_id         uuid REFERENCES exports(id) ON DELETE SET NULL,
  -- レビュー
  requires_review   boolean DEFAULT false
);

-- CHECK
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_entry_type_check
  CHECK (entry_type IN ('normal','adjusting','closing','opening','reversal'));
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_status_check
  CHECK (status IN ('draft','approved','posted'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_journal_entries_org      ON journal_entries (organization_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_client   ON journal_entries (client_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_document ON journal_entries (document_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date     ON journal_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status   ON journal_entries (status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_excluded ON journal_entries (is_excluded) WHERE (is_excluded = true);
CREATE INDEX IF NOT EXISTS idx_journal_entries_review   ON journal_entries (requires_review) WHERE (requires_review = true);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_set_journal_entry_org_id ON journal_entries;
CREATE TRIGGER trg_set_journal_entry_org_id
  BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION set_journal_entry_organization_id();

DROP TRIGGER IF EXISTS trg_journal_entries_updated_at ON journal_entries;
CREATE TRIGGER trg_journal_entries_updated_at
  BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 24. journal_entry_lines（仕訳明細行）
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_number      integer NOT NULL,
  debit_credit     varchar(10) NOT NULL,
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

-- CHECK
ALTER TABLE journal_entry_lines ADD CONSTRAINT journal_entry_lines_debit_credit_check
  CHECK (debit_credit IN ('debit','credit'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_entry_lines_entry    ON journal_entry_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_lines_account  ON journal_entry_lines (account_item_id);
CREATE INDEX IF NOT EXISTS idx_entry_lines_supplier ON journal_entry_lines (supplier_id);


-- ============================================================
-- 25. journal_entry_approvals（仕訳承認）
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entry_approvals (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE CASCADE,
  approver_id      uuid NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  approval_status  varchar(20) NOT NULL,
  approval_level   integer DEFAULT 1,
  approved_at      timestamptz,
  rejection_reason text,
  comments         text,
  created_at       timestamptz DEFAULT now()
);

-- CHECK
ALTER TABLE journal_entry_approvals ADD CONSTRAINT journal_entry_approvals_approval_status_check
  CHECK (approval_status IN ('pending','approved','rejected'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_approvals_entry    ON journal_entry_approvals (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver ON journal_entry_approvals (approver_id);


-- ============================================================
-- 26. processing_rules（自動仕訳ルール）
-- ============================================================
CREATE TABLE IF NOT EXISTS processing_rules (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id            uuid REFERENCES clients(id) ON DELETE CASCADE,
  industry_id          uuid REFERENCES industries(id) ON DELETE NO ACTION,
  rule_name            varchar(255) NOT NULL,
  priority             integer DEFAULT 100,
  scope                varchar(20) NOT NULL,
  rule_type            varchar(20) NOT NULL,
  conditions           jsonb NOT NULL,
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

-- CHECK
ALTER TABLE processing_rules ADD CONSTRAINT processing_rules_scope_check
  CHECK (scope IN ('shared','industry','client'));
ALTER TABLE processing_rules ADD CONSTRAINT processing_rules_rule_type_check
  CHECK (rule_type IN ('支出','収入'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_rules_org      ON processing_rules (organization_id);
CREATE INDEX IF NOT EXISTS idx_rules_client   ON processing_rules (client_id);
CREATE INDEX IF NOT EXISTS idx_rules_active   ON processing_rules (is_active);
CREATE INDEX IF NOT EXISTS idx_rules_priority ON processing_rules (priority);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_processing_rules_updated_at ON processing_rules;
CREATE TRIGGER trg_processing_rules_updated_at
  BEFORE UPDATE ON processing_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 27. ai_suggestions（AI仕訳提案）
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
  user_action               varchar(20),
  actioned_at               timestamptz,
  actioned_by               uuid REFERENCES users(id) ON DELETE NO ACTION,
  created_at                timestamptz DEFAULT now(),
  suggested_is_business     boolean,
  model_version             varchar(50),
  modified_values           jsonb
);

-- CHECK
ALTER TABLE ai_suggestions ADD CONSTRAINT ai_suggestions_user_action_check
  CHECK (user_action IS NULL OR user_action IN ('accepted','rejected','modified'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_document ON ai_suggestions (document_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_entry    ON ai_suggestions (journal_entry_id);


-- ============================================================
-- 28. exports（エクスポート履歴）
-- ============================================================
CREATE TABLE IF NOT EXISTS exports (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id         uuid REFERENCES clients(id) ON DELETE CASCADE,
  export_type       varchar(50) NOT NULL,
  export_format     varchar(20),
  start_date        date,
  end_date          date,
  entry_count       integer,
  file_name         varchar(255),
  file_path         text,
  file_size         bigint,
  freee_export_id   varchar(50),
  freee_status      varchar(20),
  status            varchar(20) DEFAULT 'pending',
  error_message     text,
  created_at        timestamptz DEFAULT now(),
  completed_at      timestamptz,
  created_by        uuid REFERENCES users(id) ON DELETE NO ACTION,
  posting_period_id uuid REFERENCES posting_periods(id) ON DELETE NO ACTION,
  freee_response    jsonb
);

-- CHECK
ALTER TABLE exports ADD CONSTRAINT exports_status_check
  CHECK (status IN ('pending','processing','completed','error','cancelled'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_exports_org     ON exports (organization_id);
CREATE INDEX IF NOT EXISTS idx_exports_client  ON exports (client_id);
CREATE INDEX IF NOT EXISTS idx_exports_created ON exports (created_at DESC);


-- ============================================================
-- 29. export_entries（エクスポート×仕訳 中間テーブル）
-- ============================================================
CREATE TABLE IF NOT EXISTS export_entries (
  export_id        uuid NOT NULL REFERENCES exports(id) ON DELETE CASCADE,
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE NO ACTION,
  freee_deal_id    varchar(50),
  sync_status      varchar(20) DEFAULT 'synced',
  created_at       timestamptz DEFAULT now(),
  PRIMARY KEY (export_id, journal_entry_id)
);

-- CHECK
ALTER TABLE export_entries ADD CONSTRAINT export_entries_sync_status_check
  CHECK (sync_status IN ('synced','error','pending'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_export_entries_entry ON export_entries (journal_entry_id);


-- ============================================================
-- Tax Copilot - 03_supplementary_tables.sql
-- 補助・関連テーブル（全46テーブル中 16テーブル）
-- 最終更新: 2026-03-22（現行Supabase DBより自動生成）
-- ============================================================
-- 対象テーブル:
--  30. supplier_aliases             取引先名寄せ（18行）
--  31. item_aliases                 品目名寄せ（0行）
--  32. document_attachments         証憑添付ファイル（0行）
--  33. document_tags                証憑タグ中間（0行）
--  34. journal_entry_tags           仕訳タグ中間（0行）
--  35. ocr_corrections              OCR修正履歴（0行）
--  36. rule_execution_logs          ルール実行ログ（0行）
--  37. closing_entries              決算仕訳（0行）
--  38. budget_entries               予算（0行）
--  39. actual_vs_budget             予算実績対比（0行）
--  40. client_account_ratios        家事按分率（3行）
--  41. client_tax_category_settings 税区分の顧客別設定（0行）
--  42. freee_connections            freee接続情報（0行）
--  43. freee_tokens                 freeeトークン管理（0行）
--  44. user_activity_logs           操作ログ（0行）
--  45. notifications                通知（0行）
-- ============================================================
-- ※ v_liver_id（1行）は用途不明のため記載しない
-- ============================================================


-- ============================================================
-- 30. supplier_aliases（取引先名寄せ）
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_aliases (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  alias_name  varchar(255) NOT NULL,
  source      varchar(20) DEFAULT 'manual',
  created_at  timestamptz DEFAULT now()
);

-- CHECK
ALTER TABLE supplier_aliases ADD CONSTRAINT supplier_aliases_source_check
  CHECK (source IN ('manual','ocr_learned','ai_suggested'));

-- UNIQUE
ALTER TABLE supplier_aliases ADD CONSTRAINT supplier_aliases_supplier_id_alias_name_key
  UNIQUE (supplier_id, alias_name);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_supplier_aliases_supplier ON supplier_aliases (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_aliases_name     ON supplier_aliases (alias_name);


-- ============================================================
-- 31. item_aliases（品目名寄せ）
-- ============================================================
CREATE TABLE IF NOT EXISTS item_aliases (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id    uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  alias_name varchar(255) NOT NULL,
  source     varchar(20) DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

-- CHECK
ALTER TABLE item_aliases ADD CONSTRAINT item_aliases_source_check
  CHECK (source IN ('manual','ocr_learned','ai_suggested'));

-- UNIQUE
ALTER TABLE item_aliases ADD CONSTRAINT item_aliases_item_id_alias_name_key
  UNIQUE (item_id, alias_name);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_item_aliases_item ON item_aliases (item_id);
CREATE INDEX IF NOT EXISTS idx_item_aliases_name ON item_aliases (alias_name);


-- ============================================================
-- 32. document_attachments（証憑添付ファイル）
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

-- INDEX
CREATE INDEX IF NOT EXISTS idx_attachments_document ON document_attachments (document_id);


-- ============================================================
-- 33. document_tags（証憑タグ中間テーブル）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_tags (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (document_id, tag_id)
);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags (tag_id);


-- ============================================================
-- 34. journal_entry_tags（仕訳タグ中間テーブル）
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entry_tags (
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  tag_id           uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now(),
  PRIMARY KEY (journal_entry_id, tag_id)
);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_journal_entry_tags_tag ON journal_entry_tags (tag_id);


-- ============================================================
-- 35. ocr_corrections（OCR修正履歴）
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

-- INDEX
CREATE INDEX IF NOT EXISTS idx_corrections_ocr ON ocr_corrections (ocr_result_id);


-- ============================================================
-- 36. rule_execution_logs（ルール実行ログ）
-- ============================================================
CREATE TABLE IF NOT EXISTS rule_execution_logs (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id          uuid REFERENCES processing_rules(id) ON DELETE SET NULL,
  document_id      uuid REFERENCES documents(id) ON DELETE CASCADE,
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  execution_result varchar(20) NOT NULL,
  match_confidence numeric(5,4),
  error_message    text,
  executed_at      timestamptz DEFAULT now()
);

-- CHECK
ALTER TABLE rule_execution_logs ADD CONSTRAINT rule_execution_logs_execution_result_check
  CHECK (execution_result IN ('success','error','skipped'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_rule_logs_rule     ON rule_execution_logs (rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_logs_document ON rule_execution_logs (document_id);


-- ============================================================
-- 37. closing_entries（決算仕訳）
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

-- INDEX
CREATE INDEX IF NOT EXISTS idx_closing_entries_fiscal_year ON closing_entries (fiscal_year_id);


-- ============================================================
-- 38. budget_entries（予算）
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

-- UNIQUE INDEX（COALESCE でNULL安全）
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_entries_unique
  ON budget_entries (client_id, fiscal_year_id, account_item_id,
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(period_number, -1));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_budget_entries_client  ON budget_entries (client_id);
CREATE INDEX IF NOT EXISTS idx_budget_entries_account ON budget_entries (account_item_id);


-- ============================================================
-- 39. actual_vs_budget（予算実績対比）
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

-- UNIQUE
ALTER TABLE actual_vs_budget
  ADD CONSTRAINT actual_vs_budget_client_id_fiscal_year_id_period_number_acc_key
  UNIQUE (client_id, fiscal_year_id, period_number, account_item_id, department_id);

-- UNIQUE INDEX（COALESCE でNULL安全）
CREATE UNIQUE INDEX IF NOT EXISTS idx_actual_vs_budget_unique
  ON actual_vs_budget (client_id, fiscal_year_id, period_number, account_item_id,
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_actual_vs_budget_client ON actual_vs_budget (client_id);


-- ============================================================
-- 40. client_account_ratios（家事按分率）
-- ============================================================
CREATE TABLE IF NOT EXISTS client_account_ratios (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_item_id uuid NOT NULL REFERENCES account_items(id) ON DELETE CASCADE,
  business_ratio  numeric(5,4) NOT NULL,
  valid_from      date NOT NULL,
  valid_until     date,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- CHECK
ALTER TABLE client_account_ratios ADD CONSTRAINT client_account_ratios_business_ratio_check
  CHECK (business_ratio >= 0 AND business_ratio <= 1);

-- UNIQUE
ALTER TABLE client_account_ratios ADD CONSTRAINT client_account_ratios_unique
  UNIQUE (client_id, account_item_id, valid_from);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_car_client  ON client_account_ratios (client_id);
CREATE INDEX IF NOT EXISTS idx_car_account ON client_account_ratios (account_item_id);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_client_account_ratios_updated_at ON client_account_ratios;
CREATE TRIGGER trg_client_account_ratios_updated_at
  BEFORE UPDATE ON client_account_ratios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 41. client_tax_category_settings（税区分の顧客別設定）
-- ============================================================
-- ※ 主キーは (client_id, tax_category_id) の複合キー
-- ※ id カラムは NULLable（PKではない）
CREATE TABLE IF NOT EXISTS client_tax_category_settings (
  id              uuid DEFAULT uuid_generate_v4(),  -- NOT PKだがNULLable
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tax_category_id uuid NOT NULL REFERENCES tax_categories(id) ON DELETE CASCADE,
  use_as_default  boolean NOT NULL DEFAULT true,
  use_for_income  boolean NOT NULL DEFAULT true,
  use_for_expense boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  PRIMARY KEY (client_id, tax_category_id)
);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_ctcs_client       ON client_tax_category_settings (client_id);
CREATE INDEX IF NOT EXISTS idx_ctcs_tax_category ON client_tax_category_settings (tax_category_id);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_client_tax_cat_settings_updated_at ON client_tax_category_settings;
CREATE TRIGGER trg_client_tax_cat_settings_updated_at
  BEFORE UPDATE ON client_tax_category_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 42. freee_connections（freee API接続情報）
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
  sync_status      varchar(20) DEFAULT 'active',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- CHECK
ALTER TABLE freee_connections ADD CONSTRAINT freee_connections_sync_status_check
  CHECK (sync_status IN ('active','expired','revoked','error'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_freee_connections_org    ON freee_connections (organization_id);
CREATE INDEX IF NOT EXISTS idx_freee_connections_client ON freee_connections (client_id);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_freee_connections_updated_at ON freee_connections;
CREATE TRIGGER trg_freee_connections_updated_at
  BEFORE UPDATE ON freee_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 43. freee_tokens（freee OAuthトークン管理）
-- ============================================================
CREATE TABLE IF NOT EXISTS freee_tokens (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE CASCADE,
  access_token    text NOT NULL,
  refresh_token   text NOT NULL,
  token_type      varchar(20) DEFAULT 'Bearer',
  expires_at      timestamptz NOT NULL,
  scope           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- UNIQUE
ALTER TABLE freee_tokens ADD CONSTRAINT freee_tokens_organization_id_client_id_key
  UNIQUE (organization_id, client_id);


-- ============================================================
-- 44. user_activity_logs（操作ログ）
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

-- INDEX
CREATE INDEX IF NOT EXISTS idx_activity_logs_user    ON user_activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity  ON user_activity_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON user_activity_logs (created_at DESC);


-- ============================================================
-- 45. notifications（通知）
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            varchar(50) NOT NULL,
  title           varchar(255) NOT NULL,
  message         text,
  entity_type     varchar(50),
  entity_id       uuid,
  is_read         boolean DEFAULT false,
  read_at         timestamptz,
  created_at      timestamptz DEFAULT now()
);

-- CHECK
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('upload','approval_needed','approved','rejected','exported','ocr_completed','ocr_error','system'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications (user_id, is_read) WHERE (is_read = false);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

-- link_url カラム追加 (Task 5-1)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_url text;

-- RLS ポリシー (Task 5-1)
CREATE POLICY notifications_select ON notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notifications_update ON notifications
  FOR UPDATE USING (user_id = auth.uid());


-- ============================================================
-- Tax Copilot - 01_functions_and_core.sql
-- 関数定義 + 基盤マスタテーブル（全46テーブル中 11テーブル）
-- 最終更新: 2026-03-22（現行Supabase DBより自動生成）
-- ============================================================
-- 対象テーブル:
--   1. organizations        税理士事務所（1行）
--   2. users                スタッフ（5行）
--   3. industries           業種マスタ（107行）
--   4. account_categories   勘定科目カテゴリ（4行）
--   5. tax_rates            消費税率マスタ（4行）
--   6. tax_categories       税区分マスタ（47行）
--   7. account_items        勘定科目（205行）
--   8. document_types       証憑種別マスタ（0行）
--   9. departments          部門（0行）
--  10. payment_methods      支払方法（0行）
--  11. tags                 タグマスタ（26行）
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ヘルパー関数（7関数）
-- ============================================================

-- updated_at 自動更新トリガー関数
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

-- journal_entries INSERT時にorganization_idを自動設定
CREATE OR REPLACE FUNCTION set_journal_entry_organization_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := (
      SELECT organization_id FROM users WHERE id = auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

-- workflows INSERT時にorganization_idを自動設定
CREATE OR REPLACE FUNCTION set_workflow_organization_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 新テーブル作成時にRLSを自動有効化するイベントトリガー関数
CREATE OR REPLACE FUNCTION rls_auto_enable()
RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public')
       AND cmd.schema_name NOT IN ('pg_catalog','information_schema')
       AND cmd.schema_name NOT LIKE 'pg_toast%'
       AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END;
$$;


-- ============================================================
-- 1. organizations（税理士事務所 / 組織）
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                varchar(255) NOT NULL,
  code                varchar(50),          -- NULLable（現行DB）
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

-- UNIQUE
ALTER TABLE organizations ADD CONSTRAINT organizations_code_key UNIQUE (code);

-- CHECK
ALTER TABLE organizations ADD CONSTRAINT organizations_plan_type_check
  CHECK (plan_type IN ('free','basic','standard','premium','pro'));
ALTER TABLE organizations ADD CONSTRAINT organizations_status_check
  CHECK (status IN ('active','inactive','suspended'));

-- TRIGGER
DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 2. users（スタッフ / ユーザー）
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    uuid REFERENCES organizations(id) ON DELETE CASCADE,
  email              varchar(255) NOT NULL,
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

-- UNIQUE
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);

-- CHECK
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','accountant','accountant_manager','accountant_staff','staff'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users (organization_id);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 3. industries（業種マスタ / グローバル）
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
  updated_at  timestamptz DEFAULT now(),
  level       integer DEFAULT 0
);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_industries_code   ON industries (code);
CREATE INDEX IF NOT EXISTS idx_industries_parent ON industries (parent_id);

-- TRIGGER
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
  type       varchar(20) NOT NULL,   -- 'bs'|'pl'|'BS'|'PL'
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- CHECK
ALTER TABLE account_categories ADD CONSTRAINT account_categories_type_check
  CHECK (type IN ('bs','pl','BS','PL'));


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
-- 6. tax_categories（税区分マスタ / 47種類・システム共通）
-- ============================================================
CREATE TABLE IF NOT EXISTS tax_categories (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                varchar(30) NOT NULL UNIQUE,   -- 現行DB: varchar(30)
  name                varchar(100) NOT NULL,
  display_name        varchar(100),
  type                varchar(20) NOT NULL,           -- '課税'|'非課税'|'不課税'|'免税'
  direction           varchar(20) NOT NULL,           -- '売上'|'仕入'|'その他'
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

-- CHECK
ALTER TABLE tax_categories ADD CONSTRAINT tax_categories_type_check
  CHECK (type IN ('課税','非課税','不課税','免税'));
ALTER TABLE tax_categories ADD CONSTRAINT tax_categories_direction_check
  CHECK (direction IN ('売上','仕入','その他'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_tax_categories_code ON tax_categories (code);
CREATE INDEX IF NOT EXISTS idx_tax_categories_type ON tax_categories (type);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_tax_categories_updated_at ON tax_categories;
CREATE TRIGGER trg_tax_categories_updated_at
  BEFORE UPDATE ON tax_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 7. account_items（勘定科目）
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
  updated_at                timestamptz DEFAULT now()
);

-- UNIQUE（organization_id=NULLが共有マスタ）
ALTER TABLE account_items ADD CONSTRAINT account_items_organization_id_client_id_code_key
  UNIQUE (organization_id, client_id, code);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_account_items_org      ON account_items (organization_id);
CREATE INDEX IF NOT EXISTS idx_account_items_client   ON account_items (client_id);
CREATE INDEX IF NOT EXISTS idx_account_items_category ON account_items (category_id);
CREATE INDEX IF NOT EXISTS idx_account_items_code     ON account_items (code);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_account_items_updated_at ON account_items;
CREATE TRIGGER trg_account_items_updated_at
  BEFORE UPDATE ON account_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 8. document_types（証憑種別マスタ / グローバル）
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
  updated_at      timestamptz DEFAULT now()
);

-- UNIQUE
ALTER TABLE departments ADD CONSTRAINT departments_organization_id_client_id_code_key
  UNIQUE (organization_id, client_id, code);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_departments_org    ON departments (organization_id);
CREATE INDEX IF NOT EXISTS idx_departments_client ON departments (client_id);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments (parent_id);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_departments_updated_at ON departments;
CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 10. payment_methods（支払方法）
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id              uuid REFERENCES clients(id) ON DELETE CASCADE,
  code                   varchar(20) NOT NULL,
  name                   varchar(50) NOT NULL,
  type                   varchar(20) NOT NULL,
  bank_name              varchar(100),
  branch_name            varchar(100),
  account_type           varchar(20),
  account_number         varchar(20),
  account_holder         varchar(100),
  default_account_item_id uuid REFERENCES account_items(id) ON DELETE NO ACTION,
  is_active              boolean DEFAULT true,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

-- UNIQUE
ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_organization_id_client_id_code_key
  UNIQUE (organization_id, client_id, code);

-- CHECK
ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_type_check
  CHECK (type IN ('cash','bank','card','electronic','other'));

-- INDEX
CREATE INDEX IF NOT EXISTS idx_payment_methods_org    ON payment_methods (organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_client ON payment_methods (client_id);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER trg_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 11. tags（タグマスタ）
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
  updated_at      timestamptz DEFAULT now()
);

-- UNIQUE
ALTER TABLE tags ADD CONSTRAINT tags_organization_id_client_id_name_tag_type_key
  UNIQUE (organization_id, client_id, name, tag_type);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_tags_org    ON tags (organization_id);
CREATE INDEX IF NOT EXISTS idx_tags_client ON tags (client_id);
CREATE INDEX IF NOT EXISTS idx_tags_type   ON tags (tag_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_type_org_unique
  ON tags (organization_id, name, tag_type);

-- TRIGGER
DROP TRIGGER IF EXISTS trg_tags_updated_at ON tags;
CREATE TRIGGER trg_tags_updated_at
  BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


  -- ============================================================
-- Tax Copilot - 04_rls_policies.sql
-- Row Level Security（RLS）ポリシー定義
-- 最終更新: 2026-03-22（現行Supabase DBより自動生成）
-- ============================================================
-- 設計方針:
--   - 全46テーブルで RLS を有効化（デフォルト拒否）
--   - ユーザーは自分の organization に属するデータのみ操作可能
--   - グローバルマスタ（industries / account_categories / tax_rates /
--     tax_categories / document_types）は全ユーザーが SELECT 可能
--   - service_role（サーバーサイド）はすべての RLS をバイパス
-- ============================================================
-- 注意:
--   - rls_auto_enable() イベントトリガーにより新規テーブルは自動でRLS有効化
--   - RLSポリシー未定義のテーブル（document_tags, journal_entry_tags,
--     export_entries, supplier_aliases, freee_connections, freee_tokens）は
--     service_role のみ操作可能な状態
-- ============================================================


-- ************************************************************
-- RLS 有効化（全46テーブル）
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
ALTER TABLE client_industries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_aliases              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE items                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_aliases                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods               ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types                ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_attachments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_tags                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_results                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_corrections               ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries               ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines           ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_approvals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_tags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_rules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_execution_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE closing_entries               ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_entries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE actual_vs_budget              ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_entries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE freee_connections             ENABLE ROW LEVEL SECURITY;
ALTER TABLE freee_tokens                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_account_ratios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tax_category_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications                 ENABLE ROW LEVEL SECURITY;


-- ************************************************************
-- 1. organizations
-- ************************************************************
DROP POLICY IF EXISTS org_select ON organizations;
CREATE POLICY org_select ON organizations
  FOR SELECT USING (id = get_my_organization_id());

DROP POLICY IF EXISTS org_update ON organizations;
CREATE POLICY org_update ON organizations
  FOR UPDATE USING (id = get_my_organization_id()
                    AND (get_my_role())::text = 'admin');


-- ************************************************************
-- 2. users
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
                    AND (get_my_role())::text = 'admin');


-- ************************************************************
-- 3. industries（グローバルマスタ）
-- ************************************************************
DROP POLICY IF EXISTS industries_select ON industries;
CREATE POLICY industries_select ON industries FOR SELECT USING (true);

DROP POLICY IF EXISTS industries_insert ON industries;
CREATE POLICY industries_insert ON industries
  FOR INSERT WITH CHECK ((get_my_role())::text = ANY (ARRAY['admin','accountant_manager','accountant_staff']));

DROP POLICY IF EXISTS industries_update ON industries;
CREATE POLICY industries_update ON industries
  FOR UPDATE USING ((get_my_role())::text = ANY (ARRAY['admin','accountant_manager','accountant_staff']));

DROP POLICY IF EXISTS industries_delete ON industries;
CREATE POLICY industries_delete ON industries
  FOR DELETE USING ((get_my_role())::text = ANY (ARRAY['admin','accountant_manager','accountant_staff']));


-- ************************************************************
-- 4. account_categories（グローバルマスタ）
-- ************************************************************
DROP POLICY IF EXISTS account_categories_select ON account_categories;
CREATE POLICY account_categories_select ON account_categories FOR SELECT USING (true);


-- ************************************************************
-- 5. tax_rates（グローバルマスタ）
-- ************************************************************
DROP POLICY IF EXISTS tax_rates_select ON tax_rates;
CREATE POLICY tax_rates_select ON tax_rates FOR SELECT USING (true);


-- ************************************************************
-- 6. tax_categories（グローバルマスタ）
-- ************************************************************
DROP POLICY IF EXISTS tax_categories_select ON tax_categories;
CREATE POLICY tax_categories_select ON tax_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS tax_categories_insert ON tax_categories;
CREATE POLICY tax_categories_insert ON tax_categories
  FOR INSERT WITH CHECK ((get_my_role())::text = ANY (ARRAY['admin','accountant_manager']));

DROP POLICY IF EXISTS tax_categories_update ON tax_categories;
CREATE POLICY tax_categories_update ON tax_categories
  FOR UPDATE USING ((get_my_role())::text = ANY (ARRAY['admin','accountant_manager']));


-- ************************************************************
-- 7. clients
-- ************************************************************
DROP POLICY IF EXISTS clients_select ON clients;
CREATE POLICY clients_select ON clients
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS clients_insert ON clients;
CREATE POLICY clients_insert ON clients
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager']));

DROP POLICY IF EXISTS clients_update ON clients;
CREATE POLICY clients_update ON clients
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager']));

DROP POLICY IF EXISTS clients_delete ON clients;
CREATE POLICY clients_delete ON clients
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = 'admin');


-- ************************************************************
-- 8. account_items
-- ************************************************************
DROP POLICY IF EXISTS account_items_select ON account_items;
CREATE POLICY account_items_select ON account_items
  FOR SELECT USING (organization_id = get_my_organization_id() OR organization_id IS NULL);

DROP POLICY IF EXISTS account_items_insert ON account_items;
CREATE POLICY account_items_insert ON account_items
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager']));

DROP POLICY IF EXISTS account_items_update ON account_items;
CREATE POLICY account_items_update ON account_items
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager'])
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
-- 10. document_types（グローバルマスタ）
-- ************************************************************
DROP POLICY IF EXISTS document_types_select ON document_types;
CREATE POLICY document_types_select ON document_types FOR SELECT USING (true);

DROP POLICY IF EXISTS document_types_insert ON document_types;
CREATE POLICY document_types_insert ON document_types
  FOR INSERT WITH CHECK ((get_my_role())::text = 'admin');

DROP POLICY IF EXISTS document_types_update ON document_types;
CREATE POLICY document_types_update ON document_types
  FOR UPDATE USING ((get_my_role())::text = 'admin');


-- ************************************************************
-- 11. payment_methods
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
-- 12. tags
-- ************************************************************
DROP POLICY IF EXISTS tags_select ON tags;
CREATE POLICY tags_select ON tags
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS tags_insert ON tags;
CREATE POLICY tags_insert ON tags
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager','accountant_staff']));

DROP POLICY IF EXISTS tags_update ON tags;
CREATE POLICY tags_update ON tags
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager','accountant_staff']));

DROP POLICY IF EXISTS tags_delete ON tags;
CREATE POLICY tags_delete ON tags
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager','accountant_staff']));


-- ************************************************************
-- 13. client_fiscal_years
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
-- 14. client_contacts
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
-- 15. client_settings
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
-- 16. client_industries
-- ************************************************************
DROP POLICY IF EXISTS client_industries_select ON client_industries;
CREATE POLICY client_industries_select ON client_industries
  FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS client_industries_insert ON client_industries;
CREATE POLICY client_industries_insert ON client_industries
  FOR INSERT WITH CHECK (client_id IN (SELECT id FROM clients WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS client_industries_update ON client_industries;
CREATE POLICY client_industries_update ON client_industries
  FOR UPDATE USING (client_id IN (SELECT id FROM clients WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS client_industries_delete ON client_industries;
CREATE POLICY client_industries_delete ON client_industries
  FOR DELETE USING (client_id IN (SELECT id FROM clients WHERE organization_id = get_my_organization_id()));


-- ************************************************************
-- 17. posting_periods
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
-- 18. suppliers
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
-- 19. items
-- ************************************************************
DROP POLICY IF EXISTS items_select ON items;
CREATE POLICY items_select ON items
  FOR SELECT USING (organization_id = get_my_organization_id() OR organization_id IS NULL);

DROP POLICY IF EXISTS items_insert ON items;
CREATE POLICY items_insert ON items
  FOR INSERT WITH CHECK ((organization_id = get_my_organization_id() OR organization_id IS NULL)
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager','accountant_staff']));

DROP POLICY IF EXISTS items_update ON items;
CREATE POLICY items_update ON items
  FOR UPDATE USING ((organization_id = get_my_organization_id() OR organization_id IS NULL)
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager','accountant_staff']));

DROP POLICY IF EXISTS items_delete ON items;
CREATE POLICY items_delete ON items
  FOR DELETE USING ((organization_id = get_my_organization_id() OR organization_id IS NULL)
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager','accountant_staff']));


-- ************************************************************
-- 20. item_aliases
-- ************************************************************
DROP POLICY IF EXISTS item_aliases_select ON item_aliases;
CREATE POLICY item_aliases_select ON item_aliases
  FOR SELECT USING (item_id IN (SELECT id FROM items
    WHERE organization_id = get_my_organization_id() OR organization_id IS NULL));

DROP POLICY IF EXISTS item_aliases_insert ON item_aliases;
CREATE POLICY item_aliases_insert ON item_aliases
  FOR INSERT WITH CHECK (item_id IN (SELECT id FROM items
    WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS item_aliases_update ON item_aliases;
CREATE POLICY item_aliases_update ON item_aliases
  FOR UPDATE USING (item_id IN (SELECT id FROM items
    WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS item_aliases_delete ON item_aliases;
CREATE POLICY item_aliases_delete ON item_aliases
  FOR DELETE USING (item_id IN (SELECT id FROM items
    WHERE organization_id = get_my_organization_id()));


-- ************************************************************
-- 21. workflows
-- ************************************************************
DROP POLICY IF EXISTS workflows_select ON workflows;
CREATE POLICY workflows_select ON workflows
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS workflows_insert ON workflows;
CREATE POLICY workflows_insert ON workflows
  FOR INSERT WITH CHECK (auth.uid() IN (SELECT id FROM users));

DROP POLICY IF EXISTS workflows_update ON workflows;
CREATE POLICY workflows_update ON workflows
  FOR UPDATE USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS workflows_delete ON workflows;
CREATE POLICY workflows_delete ON workflows
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant']));


-- ************************************************************
-- 22. documents
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
-- 23. document_attachments
-- ************************************************************
DROP POLICY IF EXISTS document_attachments_select ON document_attachments;
CREATE POLICY document_attachments_select ON document_attachments
  FOR SELECT USING (document_id IN (SELECT id FROM documents
    WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS document_attachments_insert ON document_attachments;
CREATE POLICY document_attachments_insert ON document_attachments
  FOR INSERT WITH CHECK (document_id IN (SELECT id FROM documents
    WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS document_attachments_delete ON document_attachments;
CREATE POLICY document_attachments_delete ON document_attachments
  FOR DELETE USING (document_id IN (SELECT id FROM documents
    WHERE organization_id = get_my_organization_id())
    AND (get_my_role())::text = 'admin');


-- ************************************************************
-- 24. ocr_results
-- ************************************************************
DROP POLICY IF EXISTS ocr_results_select ON ocr_results;
CREATE POLICY ocr_results_select ON ocr_results
  FOR SELECT USING (document_id IN (SELECT id FROM documents
    WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS ocr_results_insert ON ocr_results;
CREATE POLICY ocr_results_insert ON ocr_results
  FOR INSERT WITH CHECK (document_id IN (SELECT id FROM documents
    WHERE organization_id = get_my_organization_id()));


-- ************************************************************
-- 25. ocr_corrections
-- ************************************************************
DROP POLICY IF EXISTS ocr_corrections_select ON ocr_corrections;
CREATE POLICY ocr_corrections_select ON ocr_corrections
  FOR SELECT USING (ocr_result_id IN (
    SELECT r.id FROM ocr_results r JOIN documents d ON d.id = r.document_id
    WHERE d.organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS ocr_corrections_insert ON ocr_corrections;
CREATE POLICY ocr_corrections_insert ON ocr_corrections
  FOR INSERT WITH CHECK (ocr_result_id IN (
    SELECT r.id FROM ocr_results r JOIN documents d ON d.id = r.document_id
    WHERE d.organization_id = get_my_organization_id()));


-- ************************************************************
-- 26. journal_entries
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
                    AND status IN ('draft','approved'));


-- ************************************************************
-- 27. journal_entry_lines
-- ************************************************************
DROP POLICY IF EXISTS entry_lines_select ON journal_entry_lines;
CREATE POLICY entry_lines_select ON journal_entry_lines
  FOR SELECT USING (journal_entry_id IN (SELECT id FROM journal_entries
    WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS entry_lines_insert ON journal_entry_lines;
CREATE POLICY entry_lines_insert ON journal_entry_lines
  FOR INSERT WITH CHECK (journal_entry_id IN (SELECT id FROM journal_entries
    WHERE organization_id = get_my_organization_id() AND status IN ('draft','approved')));

DROP POLICY IF EXISTS entry_lines_update ON journal_entry_lines;
CREATE POLICY entry_lines_update ON journal_entry_lines
  FOR UPDATE USING (journal_entry_id IN (SELECT id FROM journal_entries
    WHERE organization_id = get_my_organization_id() AND status IN ('draft','approved')));

DROP POLICY IF EXISTS entry_lines_delete ON journal_entry_lines;
CREATE POLICY entry_lines_delete ON journal_entry_lines
  FOR DELETE USING (journal_entry_id IN (SELECT id FROM journal_entries
    WHERE organization_id = get_my_organization_id() AND status IN ('draft','approved')));


-- ************************************************************
-- 28. journal_entry_approvals
-- ************************************************************
DROP POLICY IF EXISTS approvals_select ON journal_entry_approvals;
CREATE POLICY approvals_select ON journal_entry_approvals
  FOR SELECT USING (journal_entry_id IN (SELECT id FROM journal_entries
    WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS approvals_insert ON journal_entry_approvals;
CREATE POLICY approvals_insert ON journal_entry_approvals
  FOR INSERT WITH CHECK (approver_id = auth.uid());

DROP POLICY IF EXISTS approvals_update ON journal_entry_approvals;
CREATE POLICY approvals_update ON journal_entry_approvals
  FOR UPDATE USING (approver_id = auth.uid());


-- ************************************************************
-- 29. processing_rules
-- ************************************************************
DROP POLICY IF EXISTS processing_rules_select ON processing_rules;
CREATE POLICY processing_rules_select ON processing_rules
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS processing_rules_insert ON processing_rules;
CREATE POLICY processing_rules_insert ON processing_rules
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id()
                         AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager','accountant_staff']));

DROP POLICY IF EXISTS processing_rules_update ON processing_rules;
CREATE POLICY processing_rules_update ON processing_rules
  FOR UPDATE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager','accountant_staff']));

DROP POLICY IF EXISTS processing_rules_delete ON processing_rules;
CREATE POLICY processing_rules_delete ON processing_rules
  FOR DELETE USING (organization_id = get_my_organization_id()
                    AND (get_my_role())::text = ANY (ARRAY['admin','accountant_manager']));


-- ************************************************************
-- 30. ai_suggestions
-- ************************************************************
DROP POLICY IF EXISTS ai_suggestions_select ON ai_suggestions;
CREATE POLICY ai_suggestions_select ON ai_suggestions
  FOR SELECT USING (document_id IN (SELECT id FROM documents
    WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS ai_suggestions_insert ON ai_suggestions;
CREATE POLICY ai_suggestions_insert ON ai_suggestions
  FOR INSERT WITH CHECK (document_id IN (SELECT id FROM documents
    WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS ai_suggestions_update ON ai_suggestions;
CREATE POLICY ai_suggestions_update ON ai_suggestions
  FOR UPDATE USING (document_id IN (SELECT id FROM documents
    WHERE organization_id = get_my_organization_id()));


-- ************************************************************
-- 31. rule_execution_logs
-- ************************************************************
DROP POLICY IF EXISTS rule_logs_select ON rule_execution_logs;
CREATE POLICY rule_logs_select ON rule_execution_logs
  FOR SELECT USING (document_id IN (SELECT id FROM documents
    WHERE organization_id = get_my_organization_id()));

DROP POLICY IF EXISTS rule_logs_insert ON rule_execution_logs;
CREATE POLICY rule_logs_insert ON rule_execution_logs
  FOR INSERT WITH CHECK (document_id IN (SELECT id FROM documents
    WHERE organization_id = get_my_organization_id()));


-- ************************************************************
-- 32. closing_entries
-- ************************************************************
DROP POLICY IF EXISTS closing_entries_select ON closing_entries;
CREATE POLICY closing_entries_select ON closing_entries
  FOR SELECT USING (fiscal_year_id IN (SELECT id FROM client_fiscal_years
    WHERE can_access_client(client_id)));

DROP POLICY IF EXISTS closing_entries_insert ON closing_entries;
CREATE POLICY closing_entries_insert ON closing_entries
  FOR INSERT WITH CHECK ((get_my_role())::text = ANY (ARRAY['admin','accountant'])
    AND fiscal_year_id IN (SELECT id FROM client_fiscal_years
    WHERE can_access_client(client_id)));


-- ************************************************************
-- 33. budget_entries
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
-- 34. actual_vs_budget
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
-- 35. exports
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
-- 36. client_account_ratios（家事按分率）
-- ************************************************************
DROP POLICY IF EXISTS car_select ON client_account_ratios;
CREATE POLICY car_select ON client_account_ratios
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS car_insert ON client_account_ratios;
CREATE POLICY car_insert ON client_account_ratios
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS car_update ON client_account_ratios;
CREATE POLICY car_update ON client_account_ratios
  FOR UPDATE USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS car_delete ON client_account_ratios;
CREATE POLICY car_delete ON client_account_ratios
  FOR DELETE USING (organization_id = get_my_organization_id());


-- ************************************************************
-- 37. client_tax_category_settings
-- ************************************************************
DROP POLICY IF EXISTS ctcs_select ON client_tax_category_settings;
CREATE POLICY ctcs_select ON client_tax_category_settings
  FOR SELECT USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS ctcs_insert ON client_tax_category_settings;
CREATE POLICY ctcs_insert ON client_tax_category_settings
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS ctcs_update ON client_tax_category_settings;
CREATE POLICY ctcs_update ON client_tax_category_settings
  FOR UPDATE USING (organization_id = get_my_organization_id());

DROP POLICY IF EXISTS ctcs_delete ON client_tax_category_settings;
CREATE POLICY ctcs_delete ON client_tax_category_settings
  FOR DELETE USING (organization_id = get_my_organization_id());


-- ************************************************************
-- 38. user_activity_logs
-- ************************************************************
DROP POLICY IF EXISTS activity_logs_select ON user_activity_logs;
CREATE POLICY activity_logs_select ON user_activity_logs
  FOR SELECT USING (organization_id = get_my_organization_id()
                    AND ((get_my_role())::text = 'admin' OR user_id = auth.uid()));

DROP POLICY IF EXISTS activity_logs_insert ON user_activity_logs;
CREATE POLICY activity_logs_insert ON user_activity_logs
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());


-- ************************************************************
-- 39. notifications
-- ************************************************************
-- ※ 現行DBにポリシーが存在する
-- （notifications_type_checkのCHECK制約はテーブル定義側で定義済み）


-- ************************************************************
-- RLSポリシー未定義のテーブル（service_roleのみ操作可能）
-- ************************************************************
-- 以下のテーブルはRLS有効だがポリシー未定義:
--   - document_tags          → service_role経由で操作
--   - journal_entry_tags     → service_role経由で操作
--   - export_entries         → service_role経由で操作
--   - supplier_aliases       → service_role経由で操作
--   - freee_connections      → service_role経由で操作
--   - freee_tokens           → service_role経由で操作
-- 必要に応じてポリシーを追加すること


-- ************************************************************
-- service_role 権限付与（スキーマ適用後に必ず実行）
-- ************************************************************
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;