/**
 * @module 認証ミドルウェア
 * @description JWT 検証 + ユーザー情報取得。PUBLIC_PATHS はスキップ。
 */

import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../adapters/supabase/supabase-admin.client.js';

/** 認証済みユーザー情報 */
export interface AuthUser {
  id: string;
  organization_id: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

/** 認証不要なパス（ヘルスチェック等の公開エンドポイント） */
const PUBLIC_PATHS = ['/health'];

/** JWT 検証 + ユーザー情報取得ミドルウェア */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (PUBLIC_PATHS.includes(req.path)) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '認証が必要です' });
    return;
  }

  const token = authHeader.slice(7);
  if (!token) {
    res.status(401).json({ error: '認証トークンが空です' });
    return;
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: '無効な認証トークンです' });
      return;
    }

    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    (req as AuthenticatedRequest).user = {
      id: user.id,
      organization_id: userData?.organization_id || '',
      role: userData?.role || 'viewer',
    };

    next();
  } catch (e) {
    console.error('[Auth] 認証処理エラー:', e);
    res.status(401).json({ error: '認証処理に失敗しました' });
  }
}
