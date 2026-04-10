// 消費税: 四捨五入（法的規定なし、実務慣行）
export function roundConsumptionTax(amount: number): number {
  return Math.round(amount);
}

// 源泉徴収税: 切り捨て（所得税法基本通達181-1）
export function truncateWithholdingTax(amount: number): number {
  return Math.floor(amount);
}
