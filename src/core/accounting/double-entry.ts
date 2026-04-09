/**
 * @module 貸借バランス検証
 * @description 仕訳明細行の借方合計と貸方合計が一致するか検証する。
 */

/** 貸借バランス検証の結果 */
export interface BalanceCheckResult {
  isBalanced: boolean;
  debitTotal: number;
  creditTotal: number;
  difference: number;
}

/** 借方合計と貸方合計を比較し、差額1円未満なら balanced と判定 */
export function checkDebitCreditBalance(
  lines: ReadonlyArray<{ debit_credit: string; amount: number }>
): BalanceCheckResult {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    if (line.debit_credit === 'debit') debitTotal += line.amount;
    else if (line.debit_credit === 'credit') creditTotal += line.amount;
  }
  const difference = Math.abs(debitTotal - creditTotal);
  return { isBalanced: difference < 1, debitTotal, creditTotal, difference };
}
