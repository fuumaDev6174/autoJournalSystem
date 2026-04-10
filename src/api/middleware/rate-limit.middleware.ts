/**
 * @module レート制限ミドルウェア
 * @description IP ベースのレート制限（JWT デコードによるバイパスを防止）。
 */

import rateLimit from 'express-rate-limit';

/** 一般 API 用レート制限 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'リクエスト数が制限を超えました。しばらく待ってから再試行してください。' },
});

/** AI 処理（OCR / 仕訳生成）用の厳しめレート制限 */
export const expensiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'AI処理のリクエスト数が制限を超えました。しばらく待ってから再試行してください。' },
});
