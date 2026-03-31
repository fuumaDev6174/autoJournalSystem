/**
 * Tax Copilot 独自CSV生成
 * フロントエンド依存を排除し、マッピング済みデータを受け取る純粋関数。
 */
export interface SimpleCsvRow {
  date: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  taxAmount: number | null;
  description: string;
  supplierName: string | null;
}

export function buildSimpleCsv(rows: SimpleCsvRow[]): string {
  const header = '日付,借方科目,貸方科目,金額,消費税額,摘要,取引先';
  const lines = rows.map(r =>
    [
      r.date,
      r.debitAccount,
      r.creditAccount,
      r.amount,
      r.taxAmount ?? '',
      `"${(r.description || '').replace(/"/g, '""')}"`,
      r.supplierName ?? '',
    ].join(',')
  );
  return [header, ...lines].join('\n');
}
