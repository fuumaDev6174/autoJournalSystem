/**
 * @module 独自 CSV 生成
 * @description マッピング済みデータから簡易仕訳 CSV を生成する純粋関数。
 */

import { escapeCsvField } from '../../shared/utils/csv-escape.js';

/** 簡易 CSV の1行 */
export interface SimpleCsvRow {
  date: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  taxAmount: number | null;
  description: string;
  supplierName: string | null;
}

/** SimpleCsvRow 配列からヘッダー付き CSV 文字列を生成する */
export function buildSimpleCsv(rows: SimpleCsvRow[]): string {
  const header = '日付,借方科目,貸方科目,金額,消費税額,摘要,取引先';
  const lines = rows.map(r =>
    [
      r.date, r.debitAccount, r.creditAccount, r.amount,
      r.taxAmount ?? '', r.description, r.supplierName ?? '',
    ].map(escapeCsvField).join(',')
  );
  return [header, ...lines].join('\n');
}
