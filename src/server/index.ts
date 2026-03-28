import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './api.js';

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

// ミドルウェア設定
app.use(cors({
  origin: process.env.VITE_APP_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ログミドルウェア
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// レート制限（API全体: 15分間に100リクエスト）
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'リクエスト数が制限を超えました。しばらく待ってから再試行してください。' },
});

// Gemini呼び出しを含む高コストエンドポイント用（15分間に20リクエスト）
const expensiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI処理のリクエスト数が制限を超えました。しばらく待ってから再試行してください。' },
});

// APIルートをマウント
app.use('/api', apiLimiter);
app.use('/api/ocr/process', expensiveLimiter);
app.use('/api/journal-entries/generate', expensiveLimiter);
app.use('/api/process/batch', expensiveLimiter);
app.use('/api', apiRouter);

// 静的ファイル配信（本番環境）
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  
  // React Routerのため、全てのルートでindex.htmlを返す
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ルートエンドポイント
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

// ヘルスチェックエンドポイント（UptimeRobot用）
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

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