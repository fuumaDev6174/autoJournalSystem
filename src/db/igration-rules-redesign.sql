-- ============================================================
-- Tax Copilot マイグレーション: 仕訳ルール管理 大改修
-- 実行日: 2026-03-31
-- ============================================================
-- 変更内容:
--   1. industries テーブルの N階層廃止（parent_id, level 削除）
--   2. industry_closure テーブル削除
--   3. processing_rules に derived_from_rule_id カラム追加
--   4. テストデータ再投入（industries, client_industries）
-- ============================================================

-- ============================================================
-- STEP 1: industries テーブルの N階層カラム削除
-- ============================================================

-- 1-a. parent_id のFK制約とインデックスを削除
ALTER TABLE industries DROP CONSTRAINT IF EXISTS industries_parent_id_fkey;
DROP INDEX IF EXISTS idx_industries_parent;

-- 1-b. parent_id カラムを削除
ALTER TABLE industries DROP COLUMN IF EXISTS parent_id;

-- 1-c. level カラムを削除
ALTER TABLE industries DROP COLUMN IF EXISTS level;

-- 1-d. path カラムを削除（存在する場合）
ALTER TABLE industries DROP COLUMN IF EXISTS path;

-- 1-e. path_ids カラムを削除（存在する場合）
ALTER TABLE industries DROP COLUMN IF EXISTS path_ids;


-- ============================================================
-- STEP 2: industry_closure テーブル削除
-- ============================================================

DROP TABLE IF EXISTS industry_closure CASCADE;


-- ============================================================
-- STEP 3: processing_rules に derived_from_rule_id 追加
-- ============================================================

-- 3-a. カラム追加
ALTER TABLE processing_rules
  ADD COLUMN IF NOT EXISTS derived_from_rule_id uuid
  REFERENCES processing_rules(id) ON DELETE SET NULL;

-- 3-b. インデックス追加（派生元ルールの逆引き用）
CREATE INDEX IF NOT EXISTS idx_rules_derived_from
  ON processing_rules (derived_from_rule_id)
  WHERE derived_from_rule_id IS NOT NULL;

-- 3-c. コメント
COMMENT ON COLUMN processing_rules.derived_from_rule_id IS
  '派生元ルールID。業種ルールが汎用ルールから派生した場合、または顧客ルールが業種/汎用ルールから派生した場合に元ルールのIDを保持。NULLは独自ルール。';


-- ============================================================
-- STEP 4: 既存の industries データをクリーンアップ＆再投入
-- ============================================================

-- 4-a. client_industries の既存データを削除（FK制約のため先に）
DELETE FROM client_industries;

-- 4-b. processing_rules の industry_id を一旦NULLに
UPDATE processing_rules SET industry_id = NULL WHERE industry_id IS NOT NULL;

-- 4-c. account_items の industry_id を一旦NULLに（業種別勘定科目がある場合）
UPDATE account_items SET industry_id = NULL WHERE industry_id IS NOT NULL;

-- 4-d. clients の industry_id を一旦NULLに
UPDATE clients SET industry_id = NULL WHERE industry_id IS NOT NULL;

-- 4-e. 既存の industries データを全削除
DELETE FROM industries;

-- 4-f. フラットな業種マスタを再投入
INSERT INTO industries (id, code, name, description, sort_order, is_active) VALUES
  ('11111111-0001-0001-0001-000000000001', 'DELIVERY',      '配送ドライバー', '個人事業主の配送・運送業。軽貨物、宅配、フードデリバリー等を含む。車両関連経費、ガソリン代、高速代の計上が多い業種。', 10, true),
  ('11111111-0001-0001-0001-000000000002', 'RESTAURANT',    '飲食業',         'レストラン、カフェ、居酒屋等の飲食店経営。仕入（食材）、光熱費、人件費が主な経費。軽減税率8%の仕入が多い。', 20, true),
  ('11111111-0001-0001-0001-000000000003', 'IT_FREELANCE',  'ITフリーランス', 'ソフトウェア開発、Web制作、コンサルティング等のIT系個人事業主。通信費、クラウドサービス、外注費が主な経費。', 30, true),
  ('11111111-0001-0001-0001-000000000004', 'BEAUTY',        '美容業',         '美容室、ネイルサロン、エステサロン等。材料費、家賃、広告宣伝費が主な経費。', 40, true),
  ('11111111-0001-0001-0001-000000000005', 'CONSTRUCTION',  '建設業',         '内装工事、リフォーム、設備工事等。外注費、材料費、車両費が多い。', 50, true),
  ('11111111-0001-0001-0001-000000000006', 'RETAIL',        '小売業',         '実店舗・ECの物販。仕入高、荷造運賃、広告宣伝費が主な経費。', 60, true),
  ('11111111-0001-0001-0001-000000000007', 'REAL_ESTATE',   '不動産業',       '賃貸管理、不動産仲介、物件管理等。修繕費、管理費、減価償却費が主な経費。', 70, true),
  ('11111111-0001-0001-0001-000000000008', 'MEDICAL',       '医療・福祉',     'クリニック、薬局、介護施設等。医薬品費、人件費、設備費が主な経費。非課税売上の取扱いが重要。', 80, true),
  ('11111111-0001-0001-0001-000000000009', 'CONSULTING',    'コンサルティング', '経営コンサル、税務コンサル、マーケティング支援等。外注費、旅費交通費が主な経費。', 90, true),
  ('11111111-0001-0001-0001-000000000010', 'AGRICULTURE',   '農業',           '農産物の生産・販売。種苗費、肥料費、農機具費が主な経費。', 100, true);


-- ============================================================
-- STEP 5: テスト用 clients の industry_id を再設定
-- （既存のクライアントがある場合、最初の業種を仮割り当て）
-- ============================================================

-- 注意: 実際のクライアントIDはテスト環境に依存するため、
-- Claude Code で実行時に適宜調整してください。
-- 以下はサンプルです。

-- UPDATE clients SET industry_id = '11111111-0001-0001-0001-000000000001'
--   WHERE id IN ('cccccccc-0001-...', 'cccccccc-0002-...');


-- ============================================================
-- STEP 6: 確認クエリ
-- ============================================================

-- 業種テーブルの構造確認（parent_id, level が消えていること）
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'industries' ORDER BY ordinal_position;

-- industry_closure が存在しないこと
-- SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'industry_closure');

-- processing_rules に derived_from_rule_id が追加されていること
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'processing_rules' AND column_name = 'derived_from_rule_id';