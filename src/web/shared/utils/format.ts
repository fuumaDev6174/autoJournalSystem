export function formatDate(d: string | null): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('ja-JP');
}

export function formatDateTime(d: string | null): string {
  if (!d) return '-';
  return new Date(d).toLocaleString('ja-JP');
}

export function formatCurrency(n: number): string {
  return n.toLocaleString('ja-JP');
}

export function formatSalesLabel(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}億円`;
  if (num >= 10000) return `${(num / 10000).toFixed(0)}万円`;
  return `${num.toLocaleString()}円`;
}
