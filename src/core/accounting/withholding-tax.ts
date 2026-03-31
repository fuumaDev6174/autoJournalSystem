/**
 * 源泉徴収税額の計算。
 * 所得税法204条1項に基づく。
 */

/** 報酬に対する源泉徴収税額を計算 */
export function calcWithholdingTax(amount: number): number {
  if (amount <= 1_000_000) {
    return Math.floor(amount * 0.1021);
  }
  // 100万円超の部分は20.42%
  return Math.floor(1_000_000 * 0.1021) + Math.floor((amount - 1_000_000) * 0.2042);
}
