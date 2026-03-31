import type { Request, Response, NextFunction } from 'express';

// 将来の認証チェックミドルウェアのプレースホルダ。
// 現状は Supabase Auth + RLS に依存しているのでパススルー。
export function authMiddleware(_req: Request, _res: Response, next: NextFunction) {
  next();
}
