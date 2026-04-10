/**
 * @module UI 定数
 */

/** ズーム設定 */
export const ZOOM = {
  MIN: 25,
  MAX: 300,
  STEP: 25,
  DEFAULT: 100,
} as const;

/** 通知ベルのポーリング間隔 (ms) */
export const NOTIFICATION_POLL_INTERVAL = 30_000;

/** 仕訳 ID プレビュー文字数 */
export const ENTRY_ID_PREVIEW_LENGTH = 8;

/** ワークフローステップ番号 → slug マッピング */
export const WORKFLOW_STEPS: Record<number, string> = {
  1: 'upload',
  2: 'ocr',
  3: 'review',
  4: 'export',
};
