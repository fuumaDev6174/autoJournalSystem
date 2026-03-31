export type UserRole = 'admin' | 'manager' | 'operator' | 'viewer';

export const ROLE_PERMISSIONS: Record<UserRole, {
  canManageUsers: boolean;
  canApproveEntries: boolean;
  canEditEntries: boolean;
  canViewOnly: boolean;
}> = {
  admin: { canManageUsers: true, canApproveEntries: true, canEditEntries: true, canViewOnly: false },
  manager: { canManageUsers: false, canApproveEntries: true, canEditEntries: true, canViewOnly: false },
  operator: { canManageUsers: false, canApproveEntries: false, canEditEntries: true, canViewOnly: false },
  viewer: { canManageUsers: false, canApproveEntries: false, canEditEntries: false, canViewOnly: true },
};
