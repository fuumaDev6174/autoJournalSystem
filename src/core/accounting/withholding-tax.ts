import { truncateWithholdingTax } from './rounding.js';

// 100万以下: 10.21%, 100万超の部分: 20.42%（所得税法204条1項）
// 端数切り捨て（通達181-1）
export function calcWithholdingTax(amount: number): number {
  if (amount <= 1_000_000) {
    return truncateWithholdingTax(amount * 0.1021);
  }
  return truncateWithholdingTax(1_000_000 * 0.1021) + truncateWithholdingTax((amount - 1_000_000) * 0.2042);
}
