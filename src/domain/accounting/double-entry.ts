export interface BalanceCheckResult {
  isBalanced: boolean;
  debitTotal: number;
  creditTotal: number;
  difference: number;
}

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
