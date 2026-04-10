-- 全テーブルのカラム定義（型・デフォルト値・NULL可否）
SELECT
  c.table_name,
  c.column_name,
  c.ordinal_position,
  c.data_type,
  c.udt_name,
  c.character_maximum_length,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;
