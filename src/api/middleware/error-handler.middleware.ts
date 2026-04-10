/**
 * @module エラーハンドリングミドルウェア
 * @description AppError は statusCode + message をそのまま返す。それ以外は本番でメッセージを隠蔽。
 */

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors/app-errors.js';

export function errorHandler(err: Error | AppError, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  console.error('予期しないエラー:', err);
  const message = process.env.NODE_ENV === 'production'
    ? 'サーバーエラーが発生しました'
    : (err.message || 'サーバーエラーが発生しました');
  res.status(500).json({
    success: false,
    error: message,
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: 'エンドポイントが見つかりません',
  });
}
