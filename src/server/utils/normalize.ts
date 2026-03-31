import { GoogleGenAI } from '@google/genai';

// Gemini APIクライアントの初期化（新SDK: @google/genai）
if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY が設定されていません。OCR・仕訳生成が動作しません。');
}
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// 使用モデル（用途別に分離）
// OCR: Flash（高速・低コスト・マルチモーダルに強い）
// 仕訳生成: Pro（推論・判断に強い）
export const GEMINI_MODEL_OCR = process.env.GEMINI_MODEL_OCR || 'gemini-3-flash-preview';
export const GEMINI_MODEL_JOURNAL = process.env.GEMINI_MODEL_JOURNAL || 'gemini-3.1-pro-preview';

// ============================================
// 【追加】Gemini API リトライ + スロットリング
// 429(レート制限)/503(過負荷)/500(内部エラー)を自動リトライ
// 指数バックオフ: 1s → 2s → 4s → 8s
// スロットリング: リクエスト間の最小間隔を保証
// ============================================

const GEMINI_MAX_RETRIES = 4;
const GEMINI_MIN_INTERVAL_MS = 150; // 150ms = 最大約400 RPM
let lastGeminiCallTime = 0;

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 【追加】Gemini API呼び出しをリトライ+スロットリング付きでラップ
 * @param fn - Gemini API呼び出し関数
 * @param label - ログ用ラベル（例: "OCR", "仕訳生成"）
 */
export async function callGeminiWithRetry<T>(fn: () => Promise<T>, label: string = 'Gemini'): Promise<T> {
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    // 【追加】スロットリング: 前回のリクエストからの最小間隔を保証
    const now = Date.now();
    const elapsed = now - lastGeminiCallTime;
    if (elapsed < GEMINI_MIN_INTERVAL_MS) {
      await sleep(GEMINI_MIN_INTERVAL_MS - elapsed);
    }
    lastGeminiCallTime = Date.now();

    try {
      const result = await fn();
      return result;
    } catch (error: any) {
      const status = error?.status || error?.httpStatusCode || error?.code;
      const message = error?.message || String(error);

      // 【追加】リトライ対象のエラーかどうかを判定
      const isRetryable =
        status === 429 ||  // レート制限
        status === 503 ||  // サーバー過負荷
        status === 500 ||  // 内部エラー
        status === 408 ||  // タイムアウト
        message.includes('429') ||
        message.includes('503') ||
        message.includes('RESOURCE_EXHAUSTED') ||
        message.includes('UNAVAILABLE') ||
        message.includes('INTERNAL') ||
        message.includes('rate limit') ||
        message.includes('quota');

      if (isRetryable && attempt < GEMINI_MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s
        console.warn(`[${label}] ⚠️ リトライ ${attempt + 1}/${GEMINI_MAX_RETRIES} (${delay}ms後) - ${status || ''} ${message.slice(0, 100)}`);
        await sleep(delay);
        continue;
      }

      // 【追加】リトライ不可のエラー（400等）またはリトライ回数超過
      console.error(`[${label}] ❌ Gemini APIエラー (リトライ${isRetryable ? '回数超過' : '不可'}): ${status || ''} ${message.slice(0, 200)}`);
      throw error;
    }
  }
  throw new Error(`[${label}] 最大リトライ回数(${GEMINI_MAX_RETRIES})を超えました`);
}
