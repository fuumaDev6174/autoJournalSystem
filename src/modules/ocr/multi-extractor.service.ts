// ============================================
// 明細分割サービス
//
// 通帳・クレカ明細など「1枚に複数取引がある書類」から
// 各取引行を個別に抽出して返す。
//
// 処理フロー:
//   1. 入力チェック（画像データ・書類種別）
//   2. プロンプト組み立て
//   3. Gemini API 呼び出し（リトライ付き）
//   4. JSON 抽出・パース（壊れていれば修復）
//   5. 各行を型安全に正規化
//
// 【呼び出し元】
//   journals.route.ts の明細分割モード
// ============================================

import { ai, GEMINI_MODEL_JOURNAL, callGeminiWithRetry } from '../../adapters/gemini/gemini.client.js';
import { buildMultiExtractPrompt } from './multi-extractor.prompt.js';
import type { ExtractedLine } from './ocr.types.js';

// ExtractedLine は ocr.types.ts から import
export type { ExtractedLine } from './ocr.types.js';

// ============================================
// メイン関数
// ============================================

/**
 * 明細書類の画像から各取引行を抽出する。
 *
 * @param imageBase64   - 画像の Base64 データ
 * @param mimeType      - MIME タイプ（image/jpeg, application/pdf 等）
 * @param documentType  - classifier が返した書類種別コード
 * @param industryPath  - 業種階層パス（省略可）
 * @returns 抽出された取引行の配列。エラー時は空配列
 */
export async function extractMultipleEntries(
  imageBase64: string,
  mimeType: string,
  documentType: string,
  industryPath?: string,
): Promise<ExtractedLine[]> {

  // --- 1. 入力チェック ---
  if (!imageBase64) {
    console.error('[明細分割] 画像データが空です');
    return [];
  }
  if (!documentType) {
    console.warn('[明細分割] documentType が未指定 → デフォルトヒントで処理');
  }

  // --- 2. プロンプト組み立て ---
  const prompt = buildMultiExtractPrompt(documentType, industryPath);

  // --- 3. Gemini API 呼び出し ---
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

    return [];
  }

  if (rawText.trim().length === 0) {
    console.error('[明細分割] Gemini の応答が空です');
    return [];
  }

  // --- 4. JSON 抽出・パース ---
  const parsed = safeParseArray(rawText);
  if (parsed.length === 0) {
    console.warn('[明細分割] 取引行が0件。応答:', rawText.slice(0, 300));
    return [];
  }

  // --- 5. 各行を正規化 ---
  const lines = parsed.map(normalizeLine).filter(isValidLine);

  console.log(`[明細分割] ${documentType}: ${parsed.length}行抽出 → ${lines.length}行有効`);
  return lines;
}

// ============================================
// JSON パース
// ============================================

/**
 * Gemini の応答テキストから JSON 配列を抽出してパースする。
 * コードブロック、裸の配列、壊れた JSON の修復に対応。
 */
function safeParseArray(rawText: string): any[] {
  const jsonText = extractJSON(rawText);
  if (!jsonText) return [];

  // そのままパース
  try {
    const result = JSON.parse(jsonText);
    return Array.isArray(result) ? result : [];
  } catch {
    // 修復を試みる
  }

  // よくある Gemini の壊れ方を修復して再試行
  try {
    const fixed = jsonText
      .replace(/,\s*([}\]])/g, '$1')  // 末尾カンマ除去
      .replace(/'/g, '"')              // シングルクォート → ダブルクォート
      .replace(/(\w+)\s*:/g, '"$1":'); // クォートなしキー
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
  // パターン1: ```json ... ``` コードブロック
  const codeBlock = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlock) return codeBlock[1].trim();

  // パターン2: 裸の JSON 配列
  const bareArray = raw.match(/\[[\s\S]*\]/);
  if (bareArray) return bareArray[0].trim();

  // パターン3: 裸の JSON オブジェクト（単一行の場合）
  const bareObj = raw.match(/\{[\s\S]*\}/);
  if (bareObj) return `[${bareObj[0].trim()}]`;

  return '';
}

// ============================================
// 正規化
// ============================================

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

/**
 * 日付を YYYY-MM-DD に正規化。
 * スラッシュ区切り、月日のみ（年なし）にも対応。
 */
function normalizeDate(value: any): string {
  if (typeof value !== 'string' || !value.trim()) {
    return new Date().toISOString().split('T')[0]; // 今日を仮設定
  }
  return value.trim().replace(/\//g, '-');
}

// ============================================
// ユーティリティ
// ============================================

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
