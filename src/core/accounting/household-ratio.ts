/**
 * 家事按分の金額分割計算。
 * 外部依存ゼロ。
 */
export interface HouseholdSplitResult {
  businessAmount: number;
  personalAmount: number;
  businessTax: number | null;
  personalTax: number | null;
}

export function splitByHouseholdRatio(
  totalAmount: number,
  taxAmount: number | null,
  businessRatio: number
): HouseholdSplitResult {
  const businessAmount = Math.round(totalAmount * businessRatio);
  const personalAmount = totalAmount - businessAmount;
  const businessTax = taxAmount != null ? Math.round(taxAmount * businessRatio) : null;
  const personalTax = taxAmount != null ? (taxAmount - (businessTax || 0)) : null;
  return { businessAmount, personalAmount, businessTax, personalTax };
}
