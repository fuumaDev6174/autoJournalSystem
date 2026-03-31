-- P3-4: suppliers.category カラムに CHECK 制約を追加
-- フロント側のハードコードカテゴリとDBの整合性を保証

ALTER TABLE suppliers
ADD CONSTRAINT suppliers_category_check
CHECK (category IN ('fuel','vehicle','ec_retail','streaming','telecom',
                    'real_estate','insurance','logistics','food','other')
       OR category IS NULL);
