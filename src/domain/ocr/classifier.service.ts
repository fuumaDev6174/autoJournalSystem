/**
 * @module 証憑分類サービス
 * @description Gemini AI で画像を書類種別に分類する。失敗時はフォールバック値を返す。
 */

import { ai, GEMINI_MODEL_OCR, callGeminiWithRetry } from '../../adapters/gemini/gemini.client.js';
import { CLASSIFY_DOCUMENT_PROMPT } from './classifier.prompt.js';
import type { ClassificationResult } from './ocr.types.js';

/**
 * 有効な書類種別コードの一覧。
 * Gemini が返したコードがこの Set に含まれなければ other_journal にフォールバックする。
 */
const VALID_DOC_CODES = new Set([
  // ── 収入系 ──
  'issued_invoice', 'payment_record', 'payment_statement', 'platform_csv',
  'bank_statement', 'salary_cert', 'stock_report', 'crypto_history',
  'pension_cert', 'realestate_inc', 'insurance_mat',

  // ── 経費系 ──
  'receipt', 'pdf_invoice', 'recv_invoice', 'invoice', 'credit_card',
  'e_money_statement', 'etc_statement', 'expense_report', 'inventory',
  'tax_interim', 'payment_notice', 'bank_transfer_receipt', 'utility_bill',
  'tax_receipt',

  // ── 複合仕訳 ──
  'payroll', 'sales_report',

  // ── 資産・償却系 ──
  'fixed_asset', 'loan_schedule',

  // ── 所得控除・税額控除系 ──
  'kokuho', 'nenkin', 'shokibo', 'ideco', 'life_insurance',
  'earthquake_ins', 'medical', 'furusato', 'housing_loan',
  'deduction_cert', 'other_deduction',

  // ── メタデータ系（届出・契約・身分証・参照書類）──
  'mynumber', 'kaigyo', 'aoiro', 'senjusha', 'invoice_reg', 'kanizei',
  'tanaoroshi_method', 'shoukyaku_method', 'chintai', 'gaichuu',
  'fudosan_contract', 'lease', 'shaken', 'id_card', 'contract',
  'estimate', 'purchase_order', 'delivery_note', 'insurance_policy',
  'registry', 'minutes', 'prev_return',

  // ── 保管・フォールバック ──
  'other_ref', 'other_journal',

  // ── Phase B 予約（投入時にコメントを外す）──
  // 'current_account_statement',  // 当座勘定照合表
  // 'social_insurance_notice',    // 社会保険料決定通知書
  // 'labor_insurance',            // 労働保険料申告書/通知書
  // 'import_doc',                 // 輸入許可通知書・関税/輸入消費税
]);

export type { ClassificationResult } from './ocr.types.js';

/** 判定失敗時に返すデフォルト値 */
const FALLBACK: ClassificationResult = {
  document_type_code: 'other_journal',
  confidence: 0,
  estimated_lines: 1,
  description: 'AI判定失敗',
};

/**
 * 画像（Base64）を Gemini に送り、書類種別を判定する。
 * どんなエラーが起きても例外は投げず、フォールバック値を返す。
 */
export async function classifyDocument(
  imageBase64: string,
  mimeType: string,
): Promise<ClassificationResult> {

  if (!imageBase64) {
    console.error('[分類] 画像データが空です');
    return { ...FALLBACK, description: '画像データが空です' };
  }

  let response;
  try {
    response = await callGeminiWithRetry(
      () => ai.models.generateContent({
        model: GEMINI_MODEL_OCR,
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: CLASSIFY_DOCUMENT_PROMPT },
          ],
        }],
      }),
      '証憑分類',
    );
  } catch (error: any) {
    logApiError(error);
    return { ...FALLBACK, description: `Gemini APIエラー: ${errorSummary(error)}` };
  }

  const rawText = response?.text ?? '';
  if (rawText.trim().length === 0) {
    console.error('[分類] Gemini の応答が空です');
    return { ...FALLBACK, description: 'Geminiの応答が空です' };
  }

  const jsonText = extractJSON(rawText);
  if (!jsonText) {
    console.error('[分類] JSON抽出失敗。応答:', rawText.slice(0, 300));
    return { ...FALLBACK, description: 'Gemini応答からJSONを取り出せません' };
  }

  const parsed = safeParseJSON(jsonText);
  if (!parsed) {
    return { ...FALLBACK, description: 'JSONパース失敗' };
  }

  return normalize(parsed);
}

/** Gemini の生テキストから JSON 部分だけを取り出す */
function extractJSON(raw: string): string {
  const codeBlock = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlock) return codeBlock[1].trim();

  const bare = raw.match(/\{[\s\S]*\}/);
  if (bare) return bare[0].trim();

  return '';
}

/**
 * JSON パースを試み、失敗したらよくある壊れ方を修復して再試行する。
 * 末尾カンマ・シングルクォート・クォートなしキーに対応。
 */
function safeParseJSON(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    // 修復を試みる
  }

  try {
    const fixed = text
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/'/g, '"')
      .replace(/(\w+)\s*:/g, '"$1":');
    const result = JSON.parse(fixed);
    console.warn('[分類] JSON修復パースで成功');
    return result;
  } catch {
    console.error('[分類] JSON修復パースも失敗。テキスト:', text.slice(0, 300));
    return null;
  }
}

/** Gemini の返した値を安全な ClassificationResult に変換する */
function normalize(raw: any): ClassificationResult {
  const code = (typeof raw.document_type_code === 'string')
    ? raw.document_type_code.trim().toLowerCase()
    : '';

  const confidence = clamp(toNumber(raw.confidence), 0, 1);
  const estimatedLines = Math.max(1, Math.round(toNumber(raw.estimated_lines, 1)));
  const description = (typeof raw.description === 'string')
    ? raw.description.slice(0, 200)
    : '';

  if (!code || !VALID_DOC_CODES.has(code)) {
    console.warn(`[分類] 不明なコード "${code}" → other_journal にフォールバック`);
    return {
      document_type_code: 'other_journal',
      confidence: Math.min(confidence, 0.3),
      estimated_lines: estimatedLines,
      description: description || `不明なコード: ${code}`,
    };
  }

  return { document_type_code: code, confidence, estimated_lines: estimatedLines, description };
}

/** 値を数値に変換する。変換できなければ fallback を返す */
function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return Number.isNaN(n) ? fallback : n;
  }
  return fallback;
}

/** min〜max に収める */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** エラーメッセージを短く切り出す */
function errorSummary(error: any): string {
  return (error?.message || String(error)).slice(0, 100);
}

/** Gemini API エラーの原因を特定してログに出す */
function logApiError(error: any): void {
  const msg = errorSummary(error);
  console.error(`[分類] Gemini API失敗: ${msg}`);

  if (/429|RESOURCE_EXHAUSTED|rate.?limit/i.test(msg)) {
    console.error('[分類] → レート制限。時間をおいて再実行してください');
  } else if (/403|PERMISSION_DENIED/i.test(msg)) {
    console.error('[分類] → APIキーの権限不足、またはモデルへのアクセス不可');
  } else if (/timeout|DEADLINE_EXCEEDED/i.test(msg)) {
    console.error('[分類] → タイムアウト。画像サイズが大きすぎる可能性があります');
  }
}