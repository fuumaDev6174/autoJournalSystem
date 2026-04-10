/**
 * @module 非同期ハンドラーラッパー
 * @description Express の async ハンドラーで発生した例外を自動的に next(err) に渡す。
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * async ルートハンドラーをラップし、例外を Express のエラーハンドリングミドルウェアに委譲する。
 * これにより各ハンドラーで try-catch を書く必要がなくなる。
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
