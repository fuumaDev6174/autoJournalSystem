import rateLimit from 'express-rate-limit';

const extractUserId = (req: any): string => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return payload.sub || req.ip || 'unknown';
    } catch { return req.ip || 'unknown'; }
  }
  return req.ip || 'unknown';
};

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: extractUserId,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'リクエスト数が制限を超えました。しばらく待ってから再試行してください。' },
});

export const expensiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: extractUserId,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI処理のリクエスト数が制限を超えました。しばらく待ってから再試行してください。' },
});
