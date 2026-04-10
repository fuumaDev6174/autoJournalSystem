# DB Snapshots

Supabase SQL Editor で `queries/export-full-schema-json.sql` を実行し、結果をここに保存する。

## ファイル命名規則

```
YYYY-MM-DD_schema.json     — テーブル構造（カラム・FK）
YYYY-MM-DD_rls.json         — RLSポリシー
YYYY-MM-DD_row-counts.json  — テーブル別レコード数
```

## 使い方

1. Supabase Dashboard → SQL Editor
2. `queries/` 内の SQL をコピペして実行
3. 結果 JSON をこのフォルダに保存
4. git commit で変更差分を追跡
