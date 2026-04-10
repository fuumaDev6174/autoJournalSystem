/**
 * @module ステータス定数
 * 仕訳ステータスの文字列定数、表示ラベル、バッジカラー。
 */

export const ENTRY_STATUS = {
  DRAFT: 'draft',
  REVIEWED: 'reviewed',
  APPROVED: 'approved',
  POSTED: 'posted',
  AMENDED: 'amended',
  REJECTED: 'rejected',
  PENDING: 'pending',
} as const;

export type EntryStatus = (typeof ENTRY_STATUS)[keyof typeof ENTRY_STATUS];

export const STATUS_LABELS: Record<string, string> = {
  [ENTRY_STATUS.DRAFT]: '未確認',
  [ENTRY_STATUS.REVIEWED]: '確認済',
  [ENTRY_STATUS.APPROVED]: '承認済',
  [ENTRY_STATUS.POSTED]: '出力済',
  [ENTRY_STATUS.AMENDED]: '修正中',
  [ENTRY_STATUS.REJECTED]: '差戻し',
  [ENTRY_STATUS.PENDING]: '保留',
};

export const STATUS_BADGE_COLORS: Record<string, string> = {
  [ENTRY_STATUS.DRAFT]: 'bg-gray-100 text-gray-600',
  [ENTRY_STATUS.REVIEWED]: 'bg-blue-100 text-blue-700',
  [ENTRY_STATUS.APPROVED]: 'bg-green-100 text-green-700',
  [ENTRY_STATUS.POSTED]: 'bg-purple-100 text-purple-700',
  [ENTRY_STATUS.AMENDED]: 'bg-yellow-100 text-yellow-700',
  [ENTRY_STATUS.REJECTED]: 'bg-red-100 text-red-700',
  [ENTRY_STATUS.PENDING]: 'bg-orange-100 text-orange-700',
};

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

export function getStatusBadgeClass(status: string): string {
  return STATUS_BADGE_COLORS[status] || 'bg-gray-100 text-gray-600';
}
