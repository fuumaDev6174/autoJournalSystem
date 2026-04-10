/**
 * @module 消費税計算
 * @description 内税⇔外税の変換。丸めは rounding.ts の roundConsumptionTax を使用。
 */

import { roundConsumptionTax } from './rounding.js';

/** 税込金額 → 税額を逆算（内税の場合） */
export function calcTaxFromInclusive(inclusiveAmount: number, taxRate: number): number {
  return roundConsumptionTax(inclusiveAmount * taxRate / (1 + taxRate));
}

/** 税抜金額 → 税込金額に変換 */
export function calcInclusiveAmount(exclusiveAmount: number, taxRate: number): number {
  return roundConsumptionTax(exclusiveAmount * (1 + taxRate));
}

/** 税込金額 → 税抜金額に変換 */
export function calcExclusiveAmount(inclusiveAmount: number, taxRate: number): number {
  return inclusiveAmount - calcTaxFromInclusive(inclusiveAmount, taxRate);
}
