/**
 * @module RBAC ミドルウェア
 * @description ロールベースの権限チェック。ROLE_PERMISSIONS に基づきエンドポイントへのアクセスを制御。
 */

import type { Request, Response, NextFunction } from 'express';
import { ROLE_PERMISSIONS, type UserRole } from '../../shared/types/role.types.js';
import type { AuthenticatedRequest } from './auth.middleware.js';

type Permission = keyof typeof ROLE_PERMISSIONS['admin'];

/**
 * 指定された権限を持つロールのみアクセスを許可するミドルウェアを返す。
 *
 * @example
 * router.delete('/users/:id', requirePermission('canManageUsers'), handler);
 */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      res.status(401).json({ error: '認証が必要です' });
      return;
    }

    const role = user.role as UserRole;
    const permissions = ROLE_PERMISSIONS[role];

    if (!permissions || !permissions[permission]) {
      res.status(403).json({ error: 'この操作を実行する権限がありません' });
      return;
    }

    next();
  };
}
