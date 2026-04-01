import rateLimit from 'express-rate-limit';

// IP ベースのレート制限（JWT デコードによるバイパスを防止）
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'リクエスト数が制限を超えました。しばらく待ってから再試行してください。' },
});

export const expensiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'AI処理のリクエスト数が制限を超えました。しばらく待ってから再試行してください。' },
});
