import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { apiLimiter, expensiveLimiter } from './middleware/rate-limit.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';
import { errorHandler, notFoundHandler } from './middleware/error-handler.middleware';
import documentsRoute from './routes/documents.route.js';
import ocrRoute from './routes/ocr.route.js';
import journalsRoute from './routes/journals.route.js';
import freeeRoute from './routes/freee.route.js';
import batchRoute from './routes/batch.route.js';
import validationRoute from './routes/validation.route.js';
import healthRoute from './routes/health.route.js';

dotenv.config();

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

// CORS設定
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.VITE_APP_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(loggingMiddleware);

// レート制限
app.use('/api', apiLimiter);
app.use('/api/ocr/process', expensiveLimiter);
app.use('/api/journal-entries/generate', expensiveLimiter);
app.use('/api/process/batch', expensiveLimiter);

// APIルート
app.use('/api', documentsRoute);
app.use('/api', ocrRoute);
app.use('/api', journalsRoute);
app.use('/api', freeeRoute);
app.use('/api', batchRoute);
app.use('/api', validationRoute);
app.use('/api', healthRoute);

// 静的ファイル配信（本番環境）
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ルートエンドポイント
app.get('/', (_req, res) => {
  res.json({
    message: '経理自動化システム API Server',
    version: '1.0.0',
    status: 'running',
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// エラーハンドリング
app.use(errorHandler);
app.use(notFoundHandler);

// サーバー起動
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 経理自動化システム API Server');
  console.log('='.repeat(50));
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 Gemini API: ${process.env.GEMINI_API_KEY ? '✅ 設定済み' : '❌ 未設定'}`);
  console.log('='.repeat(50));
});

process.on('SIGTERM', () => {
  console.log('SIGTERM受信 - サーバーをシャットダウンします');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT受信 - サーバーをシャットダウンします');
  process.exit(0);
});
