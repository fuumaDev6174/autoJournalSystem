/**
 * @module バリデーションサービス
 * @description 貸借バランスチェック。重複チェック・取引先名寄せは各モジュールから re-export。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// 各モジュールの型・関数を re-export（重複定義を排除）
export type { DuplicateCheckResult, ReceiptDuplicateResult } from '../../modules/document/duplicate-checker.js';
export { checkDocumentDuplicate, checkReceiptDuplicate } from '../../modules/document/duplicate-checker.js';
export type { SupplierMatchResult } from '../../modules/document/supplier-matcher.js';
export { findSupplierAliasMatch } from '../../modules/document/supplier-matcher.js';

/** 貸借バランスチェック結果 */
export interface BalanceCheckResult {
  isBalanced: boolean;
  debitTotal: number;
  creditTotal: number;
  difference: number;
}

/** 仕訳明細行の貸借バランスを検証する（純粋関数） */
export function validateDebitCreditBalance(
  lines: Array<{ debit_credit: string; amount: number }>,
): BalanceCheckResult {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    if (line.debit_credit === 'debit') debitTotal += line.amount;
    else if (line.debit_credit === 'credit') creditTotal += line.amount;
  }
  // 1円以内の差は小数点丸め誤差として許容
  const difference = Math.abs(debitTotal - creditTotal);
  return { isBalanced: difference < 1, debitTotal, creditTotal, difference };
}

/** 仕訳エントリの貸借バランスチェック（DB 参照あり） */
export async function validateJournalBalance(
  supabaseAdmin: SupabaseClient,
  journalEntryId: string,
): Promise<BalanceCheckResult> {
  const { data: lines } = await supabaseAdmin.from('journal_entry_lines')
    .select('debit_credit, amount')
    .eq('journal_entry_id', journalEntryId);
  if (!lines || lines.length === 0) return { isBalanced: true, debitTotal: 0, creditTotal: 0, difference: 0 };
  return validateDebitCreditBalance(lines);
}
