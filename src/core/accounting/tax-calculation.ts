import { roundConsumptionTax } from './rounding.js';

export function calcTaxFromInclusive(inclusiveAmount: number, taxRate: number): number {
  return roundConsumptionTax(inclusiveAmount * taxRate / (1 + taxRate));
}

export function calcInclusiveAmount(exclusiveAmount: number, taxRate: number): number {
  return roundConsumptionTax(exclusiveAmount * (1 + taxRate));
}

export function calcExclusiveAmount(inclusiveAmount: number, taxRate: number): number {
  return inclusiveAmount - calcTaxFromInclusive(inclusiveAmount, taxRate);
}
