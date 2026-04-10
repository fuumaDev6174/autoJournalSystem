/**
 * @module サーバーエントリーポイント
 * @description 本番用 Express サーバーの起動スクリプト。
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';

import { authMiddleware } from '../api/middleware/auth.middleware.js';
import { apiLimiter, expensiveLimiter } from '../api/middleware/rate-limit.middleware.js';

import journalRoutes from '../api/routes/journal/index.js';
import documentRoutes from '../api/routes/document/index.js';
import masterRoutes from '../api/routes/master/index.js';
import clientRoutes from '../api/routes/client/index.js';
import userRoutes from '../api/routes/user/index.js';
import exportRoutes from '../api/routes/export/index.js';
import systemRoutes from '../api/routes/system/index.js';

// 必須環境変数の起動時チェック
const requiredEnvVars = ['GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(`FATAL: 必須環境変数が未設定です: ${missingEnvVars.join(', ')}`);
  console.error('サーバーを起動できません。.env ファイルまたはホスティング設定を確認してください。');
  process.exit(1);
}
if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
  console.warn('WARNING: SUPABASE_URL / VITE_SUPABASE_URL が未設定です。DB接続に失敗します。');
}

const app = express();
const PORT = process.env.PORT || 3001;

// ログミドルウェア
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ヘルスチェック（認証不要・CORS不要）
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 静的ファイル配信（本番環境）— CORS/API middlewareより前に配置
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
}

// CORS（APIルートのみに適用）
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.VITE_APP_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

const apiCors = cors({
  origin: (origin, callback) => {
    // 同一オリジン（origin なし）は常に許可
    if (!origin) return callback(null, true);
    // 明示的に許可されたオリジン
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // 本番環境: Render の外部URLと同一オリジンなら許可
    if (process.env.RENDER_EXTERNAL_URL && origin === process.env.RENDER_EXTERNAL_URL) return callback(null, true);
    callback(new Error('CORS not allowed'));
  },
  credentials: true,
});

app.use('/api', apiCors);
app.use(express.json({ limit: '10mb' }));

// レート制限（認証前に適用 — DoS防御）
app.use('/api', apiLimiter);
app.use('/api/ocr/process', expensiveLimiter);
app.use('/api/journal-entries/generate', expensiveLimiter);
app.use('/api/process/batch', expensiveLimiter);

// ヘルスチェック（認証不要）
app.use('/api', systemRoutes);

// 認証ミドルウェア（/api/health 以外の全 API に適用）
app.use('/api', authMiddleware as any);

// ドメイン別ルート
app.use('/api', journalRoutes);
app.use('/api', documentRoutes);
app.use('/api', masterRoutes);
app.use('/api', clientRoutes);
app.use('/api', userRoutes);
app.use('/api', exportRoutes);

// ルートエンドポイント（開発環境のみ）
if (process.env.NODE_ENV !== 'production') {
  app.get('/', (_req, res) => {
    res.json({
      message: '経理自動化システム API Server',
      version: '1.0.0',
      status: 'running',
    });
  });
}

// React Router SPA フォールバック（本番環境）
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), 'dist');
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// エラーハンドリングミドルウェア
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('エラー:', err);
  const statusCode = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'サーバーエラーが発生しました'
    : (err.message || 'サーバーエラーが発生しました');
  res.status(statusCode).json({ success: false, error: message });
});

// 404ハンドリング
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'エンドポイントが見つかりません' });
});

// サーバー起動
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('経理自動化システム API Server');
  console.log('='.repeat(50));
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Gemini API: ${process.env.GEMINI_API_KEY ? '設定済み' : '未設定'}`);
  console.log('='.repeat(50));
});

// グレースフルシャットダウン
process.on('SIGTERM', () => {
  console.log('SIGTERM受信 - サーバーをシャットダウンします');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT受信 - サーバーをシャットダウンします');
  process.exit(0);
});
