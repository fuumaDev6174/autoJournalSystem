/**
 * @module CSV エスケープ
 * @description RFC 4180 準拠の CSV フィールドエスケープ。
 */

/**
 * CSV フィールドを RFC 4180 に従ってエスケープする。
 * カンマ・改行・ダブルクォートを含む場合はダブルクォートで囲み、内部の `"` は `""` にする。
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
