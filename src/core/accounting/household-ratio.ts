/**
 * @module 家事按分計算
 * @description 総額を事業用と私用に按分する。端数は事業用側で丸め、私用側は差額で算出。
 */

/** 家事按分の分割結果 */
export interface HouseholdSplitResult {
  businessAmount: number;
  personalAmount: number;
  businessTax: number | null;
  personalTax: number | null;
}

/** 総額と税額を事業割合で按分する */
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
