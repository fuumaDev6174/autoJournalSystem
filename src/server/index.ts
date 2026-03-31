import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

import documentsRoute from '../api/routes/documents.route.js';
import ocrRoute from '../api/routes/ocr.route.js';
import journalsRoute from '../api/routes/journals.route.js';
import freeeRoute from '../api/routes/freee.route.js';
import batchRoute from '../api/routes/batch.route.js';
import validationRoute from '../api/routes/validation.route.js';
import healthRoute from '../api/routes/health.route.js';
import clientsCrud from '../api/routes/crud/clients.crud.js';
import accountItemsCrud from '../api/routes/crud/account-items.crud.js';
import taxCategoriesCrud from '../api/routes/crud/tax-categories.crud.js';
import industriesCrud from '../api/routes/crud/industries.crud.js';
import rulesCrud from '../api/routes/crud/rules.crud.js';
import suppliersCrud from '../api/routes/crud/suppliers.crud.js';
import itemsCrud from '../api/routes/crud/items.crud.js';
import journalEntriesCrud from '../api/routes/crud/journal-entries.crud.js';
import workflowsCrud from '../api/routes/crud/workflows.crud.js';
import usersCrud from '../api/routes/crud/users.crud.js';
import notificationsCrud from '../api/routes/crud/notifications.crud.js';
import clientRatiosCrud from '../api/routes/crud/client-ratios.crud.js';
import storageCrud from '../api/routes/crud/storage.crud.js';
import documentsCrud from '../api/routes/crud/documents.crud.js';
import journalCorrectionsCrud from '../api/routes/crud/journal-corrections.crud.js';

// 環境変数を読み込み
dotenv.config();

// 必須環境変数の起動時チェック
const requiredEnvVars = ['GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(`FATAL: 必須環境変数が未設定です: ${missingEnvVars.join(', ')}`);
  console.error('サーバーを起動できません。.env ファイルまたはホスティング設定を確認してください。');
  process.exit(1);
}
// SUPABASE_URL は VITE_SUPABASE_URL からのフォールバックがあるためwarningのみ
if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
  console.warn('WARNING: SUPABASE_URL / VITE_SUPABASE_URL が未設定です。DB接続に失敗します。');
}

const app = express();
const PORT = process.env.PORT || 3001;

// ログミドルウェア
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ヘルスチェックエンドポイント（UptimeRobot用）
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 静的ファイル配信（本番環境） — CORSやAPI middlewareより前に配置
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
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
});

app.use('/api', apiCors);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// レート制限（API全体: 15分間に100リクエスト、ユーザー別）
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

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: extractUserId,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'リクエスト数が制限を超えました。しばらく待ってから再試行してください。' },
});

// Gemini呼び出しを含む高コストエンドポイント用（15分間に20リクエスト）
const expensiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: extractUserId,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI処理のリクエスト数が制限を超えました。しばらく待ってから再試行してください。' },
});

// APIルートをマウント
app.use('/api', apiLimiter);
app.use('/api/ocr/process', expensiveLimiter);
app.use('/api/journal-entries/generate', expensiveLimiter);
app.use('/api/process/batch', expensiveLimiter);
app.use('/api', documentsRoute);
app.use('/api', ocrRoute);
app.use('/api', journalsRoute);
app.use('/api', freeeRoute);
app.use('/api', batchRoute);
app.use('/api', validationRoute);
app.use('/api', healthRoute);

// CRUDルート
app.use('/api', clientsCrud);
app.use('/api', accountItemsCrud);
app.use('/api', taxCategoriesCrud);
app.use('/api', industriesCrud);
app.use('/api', rulesCrud);
app.use('/api', suppliersCrud);
app.use('/api', itemsCrud);
app.use('/api', journalEntriesCrud);
app.use('/api', workflowsCrud);
app.use('/api', usersCrud);
app.use('/api', notificationsCrud);
app.use('/api', clientRatiosCrud);
app.use('/api', storageCrud);
app.use('/api', documentsCrud);
app.use('/api', journalCorrectionsCrud);

// ルートエンドポイント（開発環境用）
app.get('/', (req, res) => {
  res.json({
    message: '経理自動化システム API Server',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      upload: 'POST /api/documents/upload',
      ocr: 'POST /api/ocr/process',
      generate_journal: 'POST /api/journal-entries/generate',
      freee_export: 'POST /api/freee/export',
      batch_process: 'POST /api/process/batch',
    },
    status: 'running',
  });
});

// React Router SPA フォールバック（本番環境）
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), 'dist');
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// エラーハンドリングミドルウェア
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('エラー:', err);
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'サーバーエラーが発生しました',
  });
});

// 404ハンドリング
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'エンドポイントが見つかりません',
  });
});

// サーバー起動
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 経理自動化システム API Server');
  console.log('='.repeat(50));
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 Gemini API: ${process.env.GEMINI_API_KEY ? '✅ 設定済み' : '❌ 未設定'}`);
  console.log(`📂 Upload directory: ${process.cwd()}/uploads`);
  console.log('='.repeat(50));
  console.log('利用可能なエンドポイント:');
  console.log('  GET  /api/health              - ヘルスチェック');
  console.log('  POST /api/documents/upload    - ファイルアップロード');
  console.log('  POST /api/ocr/process         - OCR処理');
  console.log('  POST /api/journal-entries/generate - 仕訳生成');
  console.log('  POST /api/freee/export        - freeeエクスポート');
  console.log('  POST /api/process/batch       - 一括処理');
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