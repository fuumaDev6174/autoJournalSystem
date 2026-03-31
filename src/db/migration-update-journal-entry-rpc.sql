-- P0-5: journal_entries + journal_entry_lines のアトミック更新用 RPC関数
-- ヘッダー更新 → 既存明細行DELETE → 新明細行INSERT をトランザクション内で実行

CREATE OR REPLACE FUNCTION update_journal_entry_with_lines(
  p_entry_id UUID,
  p_header JSONB,
  p_lines JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- ヘッダー更新
  UPDATE journal_entries
  SET
    entry_date = COALESCE((p_header->>'entry_date')::date, entry_date),
    description = COALESCE(p_header->>'description', description),
    status = COALESCE(p_header->>'status', status),
    notes = COALESCE(p_header->>'notes', notes),
    updated_at = NOW()
  WHERE id = p_entry_id;

  -- 既存明細行を削除
  DELETE FROM journal_entry_lines WHERE journal_entry_id = p_entry_id;

  -- 新明細行を挿入
  INSERT INTO journal_entry_lines (
    journal_entry_id, line_number, debit_credit, account_item_id,
    tax_category_id, amount, tax_rate, tax_amount, description,
    supplier_id, item_id
  )
  SELECT
    p_entry_id,
    (line->>'line_number')::int,
    line->>'debit_credit',
    (line->>'account_item_id')::uuid,
    (line->>'tax_category_id')::uuid,
    (line->>'amount')::numeric,
    (line->>'tax_rate')::numeric,
    (line->>'tax_amount')::numeric,
    line->>'description',
    CASE WHEN line->>'supplier_id' IS NOT NULL THEN (line->>'supplier_id')::uuid ELSE NULL END,
    CASE WHEN line->>'item_id' IS NOT NULL THEN (line->>'item_id')::uuid ELSE NULL END
  FROM jsonb_array_elements(p_lines) AS line;
END;
$$;

GRANT EXECUTE ON FUNCTION update_journal_entry_with_lines TO authenticated, service_role;
