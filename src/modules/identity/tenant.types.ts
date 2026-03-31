// マルチテナント関連型（将来拡張）
export interface TenantContext {
  organizationId: string;
  userId: string;
  role: string;
}
