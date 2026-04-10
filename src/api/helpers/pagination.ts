/**
 * @module ページネーションヘルパー
 * @description クエリパラメータからページネーション情報を解析する。
 */

/** ページネーション設定（デフォルト20件、最大100件） */
export function parsePagination(query: Record<string, any>): {
  page: number;
  perPage: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(query.per_page) || 20));
  return { page, perPage, offset: (page - 1) * perPage };
}
