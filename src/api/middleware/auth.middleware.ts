import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../adapters/supabase/supabase-admin.client.js';

// ============================================
// 認証済みリクエストの型定義
// ============================================
export interface AuthUser {
  id: string;
  organization_id: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

// 認証不要なパス（/api からの相対パス）
const PUBLIC_PATHS = ['/health'];

// ============================================
// JWT検証 + ユーザー情報取得ミドルウェア
// ============================================
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // 公開パスはスキップ
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
    // Supabase Auth でトークンを検証（署名チェック含む）
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: '無効な認証トークンです' });
      return;
    }

    // users テーブルから organization_id と role を取得
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
