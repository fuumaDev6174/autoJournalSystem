/**
 * freee取込CSV生成（21列形式）
 * フロントエンド依存を排除した純粋関数。
 */
export interface FreeeCsvRow {
  date: string;
  debitAccount: string;
  debitSubAccount: string;
  debitPartner: string;
  debitDepartment: string;
  debitTaxCategory: string;
  debitAmount: number;
  creditAccount: string;
  creditSubAccount: string;
  creditPartner: string;
  creditDepartment: string;
  creditTaxCategory: string;
  creditAmount: number;
  description: string;
  tag1: string;
  tag2: string;
  tag3: string;
  adjustment: string;
  entryType: string;
  closingType: string;
  segment: string;
}

export function buildFreeeCsv(rows: FreeeCsvRow[]): string {
  const header = '収支区分,取引日,決算整理仕訳,借方勘定科目,借方補助科目,借方取引先,借方部門,借方税区分,借方金額,貸方勘定科目,貸方補助科目,貸方取引先,貸方部門,貸方税区分,貸方金額,摘要,タグ1,タグ2,タグ3,調整,仕訳メモ';
  const lines = rows.map(r =>
    [
      r.entryType,
      r.date,
      r.closingType,
      r.debitAccount,
      r.debitSubAccount,
      r.debitPartner,
      r.debitDepartment,
      r.debitTaxCategory,
      r.debitAmount,
      r.creditAccount,
      r.creditSubAccount,
      r.creditPartner,
      r.creditDepartment,
      r.creditTaxCategory,
      r.creditAmount,
      `"${(r.description || '').replace(/"/g, '""')}"`,
      r.tag1,
      r.tag2,
      r.tag3,
      r.adjustment,
      r.segment,
    ].join(',')
  );
  return [header, ...lines].join('\n');
}
