// リクエスト処理ユーティリティ（UUID検証、Mass Assignment防止、パス検証、エラーメッセージ）

export const isValidUUID = (str: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const ALWAYS_BLOCKED_FIELDS = ['id', 'created_at', 'updated_at'];

/** Mass Assignment 防止: req.body から保護フィールドを除去する */
export function sanitizeBody(
  body: Record<string, any>,
  extraBlocked: string[] = [],
): Record<string, any> {
  const blocked = new Set([...ALWAYS_BLOCKED_FIELDS, ...extraBlocked]);
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (!blocked.has(key)) result[key] = value;
  }
  return result;
}

// パストラバーサル防止
export function isValidStoragePath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  if (filePath.includes('..')) return false;
  if (filePath.startsWith('/') || filePath.startsWith('\\')) return false;
  return /^[a-zA-Z0-9_\-./]+$/.test(filePath);
}

export function safeErrorMessage(error: any): string {
  if (process.env.NODE_ENV === 'production') return 'サーバーエラーが発生しました';
  return error?.message || 'サーバーエラーが発生しました';
}
