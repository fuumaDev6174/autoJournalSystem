-- 全テーブル構造をJSON形式で出力（snapshots/ に保存する用）
-- Supabase SQL Editor で実行し、結果を snapshots/ にコピーする
SELECT json_agg(
  json_build_object(
    'table_name', t.table_name,
    'columns', (
      SELECT json_agg(
        json_build_object(
          'name', c.column_name,
          'type', c.udt_name,
          'nullable', c.is_nullable = 'YES',
          'default', c.column_default,
          'max_length', c.character_maximum_length
        ) ORDER BY c.ordinal_position
      )
      FROM information_schema.columns c
      WHERE c.table_name = t.table_name AND c.table_schema = 'public'
    ),
    'foreign_keys', (
      SELECT json_agg(
        json_build_object(
          'column', kcu.column_name,
          'references_table', ccu.table_name,
          'references_column', ccu.column_name
        )
      )
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = t.table_name AND tc.table_schema = 'public'
    )
  ) ORDER BY t.table_name
) AS full_schema
FROM information_schema.tables t
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE';
