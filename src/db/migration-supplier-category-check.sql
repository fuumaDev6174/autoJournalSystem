-- P3-4: suppliers.category カラムに CHECK 制約を追加
-- フロント側のハードコードカテゴリとDBの整合性を保証

ALTER TABLE suppliers
ADD CONSTRAINT suppliers_category_check
CHECK (category IN ('fuel','vehicle','ec_retail','streaming','telecom',
                    'real_estate','insurance','logistics','food','other')
       OR category IS NULL);

-- processing_rules.rule_type に「複合仕訳」を追加
-- 既存の rule_type_check 制約を差し替え

ALTER TABLE processing_rules DROP CONSTRAINT IF EXISTS rule_type_check;
ALTER TABLE processing_rules ADD CONSTRAINT rule_type_check
CHECK (rule_type IN ('支出', '収入', '複合仕訳'));
