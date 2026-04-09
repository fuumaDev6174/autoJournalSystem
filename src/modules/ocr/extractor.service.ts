// ============================================
// OCR データ抽出サービス
//
// 画像（URL or Base64）を Gemini に送り、
// 取引データ（金額・日付・取引先・品目等）を構造化して返す。
//
// 処理フロー:
//   1. 画像の取得（URL fetch or preloaded Base64）
//   2. Gemini API 呼び出し（リトライ付き）
//   3. レスポンスから JSON を抽出・パース
//   4. transactions 配列を型安全に正規化
//   5. 先頭取引のフィールドをフラット展開して OCRResult を組み立て
//
// 各ステップのエラーは原因を特定できるメッセージ付きで throw する。
// ============================================

import { ai, GEMINI_MODEL_OCR, callGeminiWithRetry } from '../../adapters/gemini/gemini.client.js';
import { EXTRACT_OCR_PROMPT } from './extractor.prompt.js';
import type { OCRTransaction, OCRResult } from './ocr.types.js';

// ============================================
// 定数
// ============================================

/** MIME タイプの判定マップ（拡張子 → MIME） */
const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

const DEFAULT_MIME = 'image/jpeg';

// ============================================
// メイン関数
// ============================================

/**
 * 画像から取引データを OCR 抽出する。
 *
 * @param imageUrl   - 署名付き URL（preloaded がなければここから画像を取得）
 * @param preloaded  - classifier で既に取得済みの場合に渡す（二重ダウンロード防止）
 * @throws エラー原因を含むメッセージ付きの Error
 */
export async function processOCR(
  imageUrl: string,
  preloaded?: { base64: string; mimeType: string },
): Promise<OCRResult> {

  // --- 1. 画像データの準備 ---
  const image = preloaded ?? await fetchImage(imageUrl);

  // --- 2. Gemini API 呼び出し ---
  const rawText = await callGemini(image);

  // --- 3. JSON パース ---
  const extracted = parseGeminiResponse(rawText);

  // --- 4. transactions を正規化 ---
  const transactions = normalizeTransactions(extracted.transactions);

  // --- 5. OCRResult を組み立て ---
  return buildResult(rawText, extracted, transactions);
}

// ============================================
// Step 1: 画像取得
// ============================================

/** URL から画像をダウンロードして Base64 に変換する */
async function fetchImage(url: string): Promise<{ base64: string; mimeType: string }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (error: any) {
    throw new Error(`画像のダウンロードに失敗: ${error.message}`);
  }

  if (!res.ok) {
    throw new Error(`画像の取得に失敗 (HTTP ${res.status}): URL=${url.slice(0, 100)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error('画像ファイルが空です');
  }

  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = detectMimeType(url, res.headers.get('content-type'));

  return { base64, mimeType };
}

/** 拡張子と Content-Type から MIME タイプを判定する */
function detectMimeType(url: string, contentType: string | null): string {
  // まず拡張子で判定（クエリパラメータを除去してから）
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];

  // Content-Type ヘッダーで判定
  if (contentType) {
    for (const [, mime] of Object.entries(EXT_TO_MIME)) {
      if (contentType.includes(mime)) return mime;
    }
  }

  return DEFAULT_MIME;
}

// ============================================
// Step 2: Gemini API 呼び出し
// ============================================

/** Gemini にプロンプト + 画像を送り、テキスト応答を返す */
async function callGemini(image: { base64: string; mimeType: string }): Promise<string> {
  let response;
  try {
    response = await callGeminiWithRetry(
      () => ai.models.generateContent({
        model: GEMINI_MODEL_OCR,
        contents: [{
          role: 'user',
          parts: [
            { text: EXTRACT_OCR_PROMPT },
            { inlineData: { mimeType: image.mimeType, data: image.base64 } },
          ],
        }],
      }),
      'OCR抽出',
    );
  } catch (error: any) {
    // リトライ上限に達した場合ここに来る
    throw new Error(`Gemini API エラー: ${error.message?.slice(0, 200)}`);
  }

  const text = response?.text ?? '';
  if (text.trim().length === 0) {
    throw new Error('Gemini から空の応答が返されました');
  }

  return text;
}

// ============================================
// Step 3: JSON パース
// ============================================

/**
 * Gemini の応答テキストから JSON を抽出してパースする。
 * コードブロック、裸の JSON オブジェクト、壊れた JSON の修復に対応。
 */
function parseGeminiResponse(rawText: string): any {
  const jsonText = extractJSON(rawText);
  if (!jsonText) {
    console.error('[OCR抽出] JSON抽出失敗。応答:', rawText.slice(0, 500));
    throw new Error('Gemini 応答から JSON を抽出できません');
  }

  // そのままパース
  try {
    return JSON.parse(jsonText);
  } catch {
    // 修復を試みる
  }

  // よくある Gemini の壊れ方を修復して再試行
  try {
    const fixed = jsonText
      .replace(/,\s*([}\]])/g, '$1')  // 末尾カンマ  {"a":1,} → {"a":1}
      .replace(/'/g, '"')              // シングルクォート
      .replace(/(\w+)\s*:/g, '"$1":'); // クォートなしキー
    const result = JSON.parse(fixed);
    console.warn('[OCR抽出] JSON修復パースで成功');
    return result;
  } catch {
    console.error('[OCR抽出] JSONパース失敗。テキスト:', jsonText.slice(0, 500));
    throw new Error('Gemini 応答の JSON パースに失敗しました');
  }
}

/** 生テキストから JSON 部分だけを切り出す */
function extractJSON(raw: string): string {
  // パターン1: ```json ... ``` コードブロック
  const codeBlock = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlock) return codeBlock[1].trim();

  // パターン2: 裸の { ... } オブジェクト
  const bare = raw.match(/\{[\s\S]*\}/);
  if (bare) return bare[0].trim();

  return '';
}

// ============================================
// Step 4: transactions の正規化
// ============================================

/** Gemini が返した transactions 配列を型安全な OCRTransaction[] に変換 */
function normalizeTransactions(raw: any): OCRTransaction[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    console.warn('[OCR抽出] transactions が空または配列でない → 空配列を返します');
    return [];
  }

  return raw.map(normalizeTx);
}

/** 1件の取引を正規化する。不正な値は null / デフォルト値に丸める */
function normalizeTx(tx: any): OCRTransaction {
  return {
    date:                   normalizeDate(tx.date),
    supplier:               asStringOrNull(tx.supplier),
    total_amount:           asNumberOrNull(tx.total_amount),
    tax_amount:             asNumberOrNull(tx.tax_amount),
    tax_details:            normalizeTaxDetails(tx.tax_details),
    tax_included:           tx.tax_included ?? true,
    payment_method:         asStringOrNull(tx.payment_method),
    invoice_number:         normalizeInvoiceNumber(tx.invoice_number),
    reference_number:       asStringOrNull(tx.reference_number),
    items:                  normalizeItems(tx.items),
    tategaki:               asStringOrNull(tx.tategaki),
    withholding_tax_amount: asNumberOrNull(tx.withholding_tax_amount),
    invoice_qualification:  asEnumOrNull(tx.invoice_qualification, ['qualified', 'kubun_kisai']),
    addressee:              asStringOrNull(tx.addressee),
    transaction_type:       asEnumOrNull(tx.transaction_type, ['purchase', 'expense', 'asset', 'sales', 'fee']),
    transfer_fee_bearer:    asEnumOrNull(tx.transfer_fee_bearer, ['sender', 'receiver']),
  };
}

/** 税区分詳細を正規化。全フィールド null でもオブジェクトを維持 */
function normalizeTaxDetails(raw: any): OCRTransaction['tax_details'] {
  if (!raw || typeof raw !== 'object') return null;
  return {
    rate_10_amount: asNumberOrNull(raw.rate_10_amount),
    rate_10_tax:    asNumberOrNull(raw.rate_10_tax),
    rate_8_amount:  asNumberOrNull(raw.rate_8_amount),
    rate_8_tax:     asNumberOrNull(raw.rate_8_tax),
    exempt_amount:  asNumberOrNull(raw.exempt_amount),
  };
}

/** 品目配列を正規化 */
function normalizeItems(raw: any): OCRTransaction['items'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => ({
    name:       (typeof item.name === 'string') ? item.name : '',
    quantity:   asNumberOrNull(item.quantity),
    unit_price: asNumberOrNull(item.unit_price),
    amount:     toNumber(item.amount),
    tax_rate:   asNumberOrNull(item.tax_rate),
  }));
}

/**
 * 日付文字列を YYYY-MM-DD に正規化。
 * Gemini が返す日付は大抵正しいが、
 * "2024/01/15" のようなスラッシュ区切りも許容する。
 */
function normalizeDate(value: any): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  // スラッシュ → ハイフンに統一
  const normalized = value.trim().replace(/\//g, '-');
  // YYYY-MM-DD の形式チェック（ゆるめ）
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) return normalized;
  // そのまま返す（後段で弾かれるよりは残す）
  return normalized;
}

/**
 * インボイス登録番号を正規化。
 * "T" + 13桁の数字が正式形式。全角Tや余分なスペースを修正する。
 */
function normalizeInvoiceNumber(value: any): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const cleaned = value.trim()
    .replace(/^Ｔ/, 'T')       // 全角T → 半角
    .replace(/[\s\-]/g, '');    // スペース・ハイフン除去
  // T + 13桁の数字に一致するか
  if (/^T\d{13}$/.test(cleaned)) return cleaned;
  // 形式が違っても値は保持（ログ用途）
  return value.trim();
}

// ============================================
// Step 5: OCRResult の組み立て
// ============================================

/** transactions と先頭取引からフラット構造の OCRResult を組み立てる */
function buildResult(
  rawText: string,
  extracted: any,
  transactions: OCRTransaction[],
): OCRResult {
  const first = transactions[0];

  return {
    raw_text: rawText,
    document_type: asStringOrNull(extracted.document_type) ?? 'other',
    transactions,
    confidence_score: clamp(toNumber(extracted.confidence, 0.5), 0, 1),

    // 先頭取引からフラット展開（後段の仕訳生成で使用）
    extracted_date:                 first?.date ?? null,
    extracted_supplier:             first?.supplier ?? null,
    extracted_amount:               first?.total_amount ?? null,
    extracted_tax_amount:           first?.tax_amount ?? null,
    extracted_payment_method:       first?.payment_method ?? null,
    extracted_invoice_number:       first?.invoice_number ?? null,
    extracted_tategaki:             first?.tategaki ?? null,
    extracted_withholding_tax:      first?.withholding_tax_amount ?? null,
    extracted_invoice_qualification: first?.invoice_qualification ?? null,
    extracted_addressee:            first?.addressee ?? null,
    extracted_transaction_type:     first?.transaction_type ?? null,
    extracted_transfer_fee_bearer:  first?.transfer_fee_bearer ?? null,
    extracted_items: first?.items?.length
      ? first.items.map(i => ({
          name: i.name,
          quantity: i.quantity ?? undefined,
          unit_price: i.unit_price ?? undefined,
          amount: i.amount,
          tax_rate: i.tax_rate ?? undefined,
        }))
      : null,
  };
}

// ============================================
// 汎用ユーティリティ
// ============================================

/** null-safe な文字列変換 */
function asStringOrNull(value: unknown): string | null {
  return (typeof value === 'string' && value.trim()) ? value.trim() : null;
}

/** null-safe な数値変換 */
function asNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** 許可リストにある値だけ通す */
function asEnumOrNull<T extends string>(value: unknown, allowed: T[]): T | null {
  return (typeof value === 'string' && allowed.includes(value as T))
    ? value as T
    : null;
}

/** 数値に変換。変換できなければ fallback */
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
