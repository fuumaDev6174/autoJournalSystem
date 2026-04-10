/**
 * @module テナント型定義
 * @description マルチテナントのコンテキスト型。
 */

/** リクエストに紐づくテナント情報 */
export interface TenantContext {
  organizationId: string;
  userId: string;
  role: string;
}
