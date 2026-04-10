-- 全テーブル一覧（カラム数・行数付き）
SELECT
  t.table_name,
  (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS column_count,
  pg_stat_user_tables.n_live_tup AS row_count
FROM information_schema.tables t
LEFT JOIN pg_stat_user_tables ON pg_stat_user_tables.relname = t.table_name
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;
