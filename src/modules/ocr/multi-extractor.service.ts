/**
 * @module 明細分割サービス
 * @description 通帳・クレカ明細など複数取引がある書類から各行を個別に抽出する。
 */

import { ai, GEMINI_MODEL_JOURNAL, callGeminiWithRetry } from '../../adapters/gemini/gemini.client.js';
import { buildMultiExtractPrompt } from './multi-extractor.prompt.js';
import type { ExtractedLine } from './ocr.types.js';

export type { ExtractedLine } from './ocr.types.js';

/** extractMultipleEntries の返り値。error が null でなければ API 失敗 */
export interface MultiExtractResult {
  lines: ExtractedLine[];
  error: string | null;
}

/**
 * 明細書類の画像から各取引行を抽出する。
 *
 * @param imageBase64   - 画像の Base64 データ
 * @param mimeType      - MIME タイプ（image/jpeg, application/pdf 等）
 * @param documentType  - classifier が返した書類種別コード
 * @param industryPath  - 業種階層パス（省略可）
 * @returns lines: 抽出された取引行、error: エラー時のメッセージ（null なら成功）
 */
export async function extractMultipleEntries(
  imageBase64: string,
  mimeType: string,
  documentType: string,
  industryPath?: string,
): Promise<MultiExtractResult> {

  if (!imageBase64) {
    console.error('[明細分割] 画像データが空です');
    return { lines: [], error: '画像データが空です' };
  }
  if (!documentType) {
    console.warn('[明細分割] documentType が未指定 → デフォルトヒントで処理');
  }

  const prompt = buildMultiExtractPrompt(documentType, industryPath);

  let rawText: string;
  try {
    const response = await callGeminiWithRetry(
      () => ai.models.generateContent({
        model: GEMINI_MODEL_JOURNAL,
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: prompt },
          ],
        }],
      }),
      '明細分割',
    );

    rawText = response?.text ?? '';
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error(`[明細分割] Gemini API エラー: ${msg.slice(0, 200)}`);

    if (/429|RESOURCE_EXHAUSTED|rate.?limit/i.test(msg)) {
      console.error('[明細分割] → レート制限。時間をおいて再実行してください');
    }

    return { lines: [], error: `Gemini APIエラー: ${msg.slice(0, 200)}` };
  }

  if (rawText.trim().length === 0) {
    console.error('[明細分割] Gemini の応答が空です');
    return { lines: [], error: 'Gemini の応答が空です' };
  }

  const parsed = safeParseArray(rawText);
  if (parsed.length === 0) {
    console.warn('[明細分割] 取引行が0件。応答:', rawText.slice(0, 300));
    return { lines: [], error: null }; // 0件は正常（エラーではない）
  }

  const lines = parsed.map(normalizeLine).filter(isValidLine);

  console.log(`[明細分割] ${documentType}: ${parsed.length}行抽出 → ${lines.length}行有効`);
  return { lines, error: null };
}

/** Gemini の応答テキストから JSON 配列を抽出してパースする */
function safeParseArray(rawText: string): any[] {
  const jsonText = extractJSON(rawText);
  if (!jsonText) return [];

  try {
    const result = JSON.parse(jsonText);
    return Array.isArray(result) ? result : [];
  } catch {
    // 修復を試みる
  }

  try {
    const fixed = jsonText
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/'/g, '"')
      .replace(/(\w+)\s*:/g, '"$1":');
    const result = JSON.parse(fixed);
    console.warn('[明細分割] JSON修復パースで成功');
    return Array.isArray(result) ? result : [];
  } catch {
    console.error('[明細分割] JSONパース失敗。テキスト:', jsonText.slice(0, 300));
    return [];
  }
}

/** 生テキストから JSON 部分を切り出す */
function extractJSON(raw: string): string {
  const codeBlock = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlock) return codeBlock[1].trim();

  const bareArray = raw.match(/\[[\s\S]*\]/);
  if (bareArray) return bareArray[0].trim();

  const bareObj = raw.match(/\{[\s\S]*\}/);
  if (bareObj) return `[${bareObj[0].trim()}]`;

  return '';
}

/** Gemini の出力を型安全な ExtractedLine に変換する */
function normalizeLine(raw: any): ExtractedLine {
  return {
    date:                   normalizeDate(raw.date),
    description:            asString(raw.description, ''),
    amount:                 Math.abs(toNumber(raw.amount)),
    counterparty:           asStringOrNull(raw.counterparty),
    is_income:              raw.is_income === true,
    suggested_account_name: asStringOrNull(raw.suggested_account_name),
    tax_rate:               asNumberOrNull(raw.tax_rate),
    confidence:             clamp(toNumber(raw.confidence, 0.5), 0, 1),
  };
}

/** 金額が 0 の行は無効として除外する */
function isValidLine(line: ExtractedLine): boolean {
  if (line.amount <= 0) {
    console.warn(`[明細分割] 金額0以下の行を除外: "${line.description}"`);
    return false;
  }
  return true;
}

/** 日付を YYYY-MM-DD に正規化する。無効な形式は null を返す */
function normalizeDate(value: any): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    console.warn('[明細分割] 日付が空のため null を返します');
    return null;
  }
  const normalized = value.trim().replace(/\//g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    console.warn(`[明細分割] 日付正規化失敗（非対応形式）: "${value}"`);
    return null;
  }
  const [, y, m, d] = match;
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    console.warn(`[明細分割] 日付正規化失敗（範囲外）: "${value}"`);
    return null;
  }
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function asString(value: unknown, fallback: string): string {
  return (typeof value === 'string' && value.trim()) ? value.trim() : fallback;
}

function asStringOrNull(value: unknown): string | null {
  return (typeof value === 'string' && value.trim()) ? value.trim() : null;
}

function asNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return Number.isNaN(n) ? fallback : n;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
