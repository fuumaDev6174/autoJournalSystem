/**
 * @module 丸めポリシー
 * @description 税額計算の丸め方針を一元管理する。
 */

/**
 * 消費税の丸め（四捨五入）。
 * 消費税法では端数処理の規定はないが、実務上は四捨五入が一般的。
 */
export function roundConsumptionTax(amount: number): number {
  return Math.round(amount);
}

/**
 * 源泉徴収税の丸め（切り捨て）。
 * 所得税法基本通達181-1 に基づき、1円未満の端数は切り捨てる。
 */
export function truncateWithholdingTax(amount: number): number {
  return Math.floor(amount);
}
