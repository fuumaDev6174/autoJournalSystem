/** YYYY-MM-DD 形式かどうかを検証 */
export function isValidDateString(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

/** 会計期間内かどうかを検証 */
export function isWithinFiscalYear(
  dateStr: string,
  fiscalYearStart: string,
  fiscalYearEnd: string
): boolean {
  const d = new Date(dateStr);
  return d >= new Date(fiscalYearStart) && d <= new Date(fiscalYearEnd);
}
