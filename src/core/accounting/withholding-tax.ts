/**
 * @module 源泉徴収税計算
 * @description 所得税法204条1項に基づく報酬の源泉徴収税額を計算する。
 */

import { truncateWithholdingTax } from './rounding.js';

/**
 * 報酬額から源泉徴収税額を計算する。
 * 100万円以下は 10.21%、100万円超の部分は 20.42%（所得税法204条1項）。
 * 端数は切り捨て（所得税法基本通達181-1）。
 */
export function calcWithholdingTax(amount: number): number {
  if (amount <= 1_000_000) {
    return truncateWithholdingTax(amount * 0.1021);
  }
  return truncateWithholdingTax(1_000_000 * 0.1021) + truncateWithholdingTax((amount - 1_000_000) * 0.2042);
}
