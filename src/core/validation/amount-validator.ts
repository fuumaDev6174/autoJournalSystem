/**
 * @module 金額バリデーション
 * @description 金額の妥当性検証と通貨丸め。
 */

/** 金額が有限かつ0以上であることを検証 */
export function isValidAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount >= 0;
}

/** 通貨金額の丸め（1円未満を四捨五入） */
export function roundCurrency(amount: number): number {
  return Math.round(amount);
}
