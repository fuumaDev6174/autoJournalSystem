import { GoogleGenAI } from '@google/genai';
import { GEMINI_CONFIG } from './gemini.config';

if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY が設定されていません。OCR・仕訳生成が動作しません。');
}

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export const GEMINI_MODEL_OCR = GEMINI_CONFIG.modelOcr;
export const GEMINI_MODEL_JOURNAL = GEMINI_CONFIG.modelJournal;

let lastGeminiCallTime = 0;

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Gemini API呼び出しをリトライ+スロットリング付きでラップ
 */
export async function callGeminiWithRetry<T>(fn: () => Promise<T>, label: string = 'Gemini'): Promise<T> {
  for (let attempt = 0; attempt <= GEMINI_CONFIG.maxRetries; attempt++) {
    const now = Date.now();
    const elapsed = now - lastGeminiCallTime;
    if (elapsed < GEMINI_CONFIG.minIntervalMs) {
      await sleep(GEMINI_CONFIG.minIntervalMs - elapsed);
    }
    lastGeminiCallTime = Date.now();

    try {
      const result = await fn();
      return result;
    } catch (error: any) {
      const status = error?.status || error?.httpStatusCode || error?.code;
      const message = error?.message || String(error);

      const isRetryable =
        status === 429 ||
        status === 503 ||
        status === 500 ||
        status === 408 ||
        message.includes('429') ||
        message.includes('503') ||
        message.includes('RESOURCE_EXHAUSTED') ||
        message.includes('UNAVAILABLE') ||
        message.includes('INTERNAL') ||
        message.includes('rate limit') ||
        message.includes('quota');

      if (isRetryable && attempt < GEMINI_CONFIG.maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[${label}] ⚠️ リトライ ${attempt + 1}/${GEMINI_CONFIG.maxRetries} (${delay}ms後) - ${status || ''} ${message.slice(0, 100)}`);
        await sleep(delay);
        continue;
      }

      console.error(`[${label}] ❌ Gemini APIエラー (リトライ${isRetryable ? '回数超過' : '不可'}): ${status || ''} ${message.slice(0, 200)}`);
      throw error;
    }
  }
  throw new Error(`[${label}] 最大リトライ回数(${GEMINI_CONFIG.maxRetries})を超えました`);
}
