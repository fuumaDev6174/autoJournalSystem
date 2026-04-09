// ============================================
// 証憑分類サービス
// Gemini AI で画像を分類し、書類種別コードを返す
//
// 処理フロー:
//   1. 入力チェック（画像データの有無）
//   2. Gemini API 呼び出し（リトライ付き）
//   3. レスポンスから JSON を抽出
//   4. JSON パース（壊れていれば修復を試みる）
//   5. 分類コードの検証・正規化
//
// どのステップで失敗しても安全なフォールバック値を返す。
// エラー原因はすべて console.error に出力される。
// ============================================

import { ai, GEMINI_MODEL_OCR, callGeminiWithRetry } from '../../adapters/gemini/gemini.client.js';
import { CLASSIFY_DOCUMENT_PROMPT } from './classifier.prompt.js';
import type { ClassificationResult } from './ocr.types.js';

// ============================================
// 有効な書類種別コード（DOC_TYPE_REGISTRY と同期すること）
// ※ registry.ts に種別を追加したらここにも追加する
// ============================================
const VALID_DOC_CODES = new Set([
  // 収入系
  'issued_invoice', 'payment_record', 'platform_csv', 'bank_statement',
  'salary_cert', 'stock_report', 'crypto_history', 'pension_cert',
  'realestate_inc', 'insurance_mat',

  // 経費系
  'receipt', 'pdf_invoice', 'recv_invoice', 'invoice', 'credit_card',
  'e_money_statement', 'etc_statement', 'expense_report', 'inventory',
  'tax_interim', 'payment_notice',

  // 複合仕訳
  'payroll', 'sales_report',

  // 控除系
  'kokuho', 'nenkin', 'shokibo', 'ideco', 'life_insurance',
  'earthquake_ins', 'medical', 'furusato', 'housing_loan',
  'deduction_cert', 'other_deduction',

  // 資産・償却系
  'fixed_asset', 'prev_return', 'loan_schedule',

  // メタデータ（届出・契約書等）
  'mynumber', 'kaigyo', 'aoiro', 'senjusha', 'invoice_reg', 'kanizei',
  'tanaoroshi_method', 'shoukyaku_method', 'chintai', 'gaichuu',
  'fudosan_contract', 'lease', 'shaken', 'id_card', 'contract',
  'estimate', 'purchase_order', 'delivery_note', 'insurance_policy',
  'registry', 'minutes',
  
  // 保管・フォールバック
  'other_ref', 'other_journal',
]);

// ClassificationResult は ocr.types.ts から import
export type { ClassificationResult } from './ocr.types.js';

/** 判定失敗時に返すデフォルト値 */
const FALLBACK: ClassificationResult = {
  document_type_code: 'other_journal',
  confidence: 0,
  estimated_lines: 1,
  description: 'AI判定失敗',
};

// ============================================
// メイン関数
// ============================================

/**
 * 画像（Base64）を Gemini に送り、書類種別を判定する。
 * どんなエラーが起きても例外は投げず、フォールバック値を返す。
 */
export async function classifyDocument(
  imageBase64: string,
  mimeType: string,
): Promise<ClassificationResult> {

  // --- 1. 入力チェック ---
  if (!imageBase64) {
    console.error('[分類] 画像データが空です');
    return { ...FALLBACK, description: '画像データが空です' };
  }

  // --- 2. Gemini API 呼び出し ---
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

  // --- 3. レスポンスから JSON を抽出 ---
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

  // --- 4. JSON パース（失敗時は修復を試みる） ---
  const parsed = safeParseJSON(jsonText);
  if (!parsed) {
    return { ...FALLBACK, description: 'JSONパース失敗' };
  }

  // --- 5. 検証・正規化 ---
  return normalize(parsed);
}

// ============================================
// ヘルパー関数
// ============================================

/**
 * Gemini の生テキストから JSON 部分だけを取り出す。
 * Gemini は ```json ... ``` で囲む場合と、裸の { } で返す場合がある。
 */
function extractJSON(raw: string): string {
  // パターン1: ```json ... ``` コードブロック
  const codeBlock = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlock) return codeBlock[1].trim();

  // パターン2: 裸の JSON オブジェクト
  const bare = raw.match(/\{[\s\S]*\}/);
  if (bare) return bare[0].trim();

  return '';
}

/**
 * JSON パースを試み、失敗したらよくある壊れ方を修復して再試行する。
 * - 末尾カンマ:   {"a": 1,}  → {"a": 1}
 * - シングルクォート: {'a': 1}  → {"a": 1}
 * - クォートなしキー: {a: 1}   → {"a": 1}
 */
function safeParseJSON(text: string): any | null {
  // まずそのまま試す
  try {
    return JSON.parse(text);
  } catch {
    // 修復を試みる
  }

  // 修復して再試行
  try {
    const fixed = text
      .replace(/,\s*([}\]])/g, '$1')  // 末尾カンマ除去
      .replace(/'/g, '"')              // ' → "
      .replace(/(\w+)\s*:/g, '"$1":'); // キーにクォート付与
    const result = JSON.parse(fixed);
    console.warn('[分類] JSON修復パースで成功');
    return result;
  } catch {
    console.error('[分類] JSON修復パースも失敗。テキスト:', text.slice(0, 300));
    return null;
  }
}

/**
 * Gemini の返した値を安全な ClassificationResult に変換する。
 * 不正な値はすべてフォールバックに丸める。
 */
function normalize(raw: any): ClassificationResult {
  // コード: 小文字に統一して検証
  const code = (typeof raw.document_type_code === 'string')
    ? raw.document_type_code.trim().toLowerCase()
    : '';

  // confidence: 数値でなければ 0、0〜1 に収める
  const confidence = clamp(toNumber(raw.confidence), 0, 1);

  // 行数: 1以上の整数
  const estimatedLines = Math.max(1, Math.round(toNumber(raw.estimated_lines, 1)));

  // 説明: 文字列でなければ空、長すぎたら切る
  const description = (typeof raw.description === 'string')
    ? raw.description.slice(0, 200)
    : '';

  // レジストリに存在しないコードはフォールバック
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

// ============================================
// ユーティリティ
// ============================================

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

  // よくある原因を判別して追加ログ（運用時のトラブルシュート用）
  if (/429|RESOURCE_EXHAUSTED|rate.?limit/i.test(msg)) {
    console.error('[分類] → レート制限。時間をおいて再実行してください');
  } else if (/403|PERMISSION_DENIED/i.test(msg)) {
    console.error('[分類] → APIキーの権限不足、またはモデルへのアクセス不可');
  } else if (/timeout|DEADLINE_EXCEEDED/i.test(msg)) {
    console.error('[分類] → タイムアウト。画像サイズが大きすぎる可能性があります');
  }
}
