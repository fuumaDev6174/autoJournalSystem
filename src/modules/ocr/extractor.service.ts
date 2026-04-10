/**
 * @module OCR データ抽出サービス
 * @description 画像を Gemini に送り取引データ（金額・日付・取引先等）を構造化して返す。
 */

import { ai, GEMINI_MODEL_OCR, callGeminiWithRetry } from '../../adapters/gemini/gemini.client.js';
import { EXTRACT_OCR_PROMPT } from './extractor.prompt.js';
import type { OCRTransaction, OCRResult } from './ocr.types.js';

/** MIME タイプの判定マップ */
const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

const DEFAULT_MIME = 'image/jpeg';

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

  const image = preloaded ?? await fetchImage(imageUrl);
  const rawText = await callGemini(image);
  const extracted = parseGeminiResponse(rawText);
  const transactions = normalizeTransactions(extracted.transactions);
  return buildResult(rawText, extracted, transactions);
}

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
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];

  if (contentType) {
    for (const [, mime] of Object.entries(EXT_TO_MIME)) {
      if (contentType.includes(mime)) return mime;
    }
  }

  return DEFAULT_MIME;
}

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
    throw new Error(`Gemini API エラー: ${error.message?.slice(0, 200)}`);
  }

  const text = response?.text ?? '';
  if (text.trim().length === 0) {
    throw new Error('Gemini から空の応答が返されました');
  }

  return text;
}

/** Gemini の応答テキストから JSON を抽出してパースする */
function parseGeminiResponse(rawText: string): any {
  const jsonText = extractJSON(rawText);
  if (!jsonText) {
    console.error('[OCR抽出] JSON抽出失敗。応答:', rawText.slice(0, 500));
    throw new Error('Gemini 応答から JSON を抽出できません');
  }

  try {
    return JSON.parse(jsonText);
  } catch {
    // 修復を試みる
  }

  try {
    const fixed = jsonText
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/'/g, '"')
      .replace(/(\w+)\s*:/g, '"$1":');
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
  const codeBlock = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlock) return codeBlock[1].trim();

  const bare = raw.match(/\{[\s\S]*\}/);
  if (bare) return bare[0].trim();

  return '';
}

/** Gemini が返した transactions 配列を型安全な OCRTransaction[] に変換する */
function normalizeTransactions(raw: any): OCRTransaction[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    console.warn('[OCR抽出] transactions が空または配列でない → 空配列を返します');
    return [];
  }

  return raw.map(normalizeTx);
}

/** 1件の取引を正規化する。不正な値は null / デフォルト値に丸め、フォールバックしたフィールドをログ出力 */
function normalizeTx(tx: any): OCRTransaction {
  const fallbacks: string[] = [];
  const track = <T>(field: string, raw: unknown, normalized: T): T => {
    if (raw != null && raw !== '' && normalized == null) fallbacks.push(field);
    return normalized;
  };

  const result: OCRTransaction = {
    date:                   normalizeDate(tx.date),
    supplier:               track('supplier', tx.supplier, asStringOrNull(tx.supplier)),
    total_amount:           track('total_amount', tx.total_amount, asNumberOrNull(tx.total_amount)),
    tax_amount:             track('tax_amount', tx.tax_amount, asNumberOrNull(tx.tax_amount)),
    tax_details:            normalizeTaxDetails(tx.tax_details),
    tax_included:           tx.tax_included ?? true,
    payment_method:         track('payment_method', tx.payment_method, asStringOrNull(tx.payment_method)),
    invoice_number:         normalizeInvoiceNumber(tx.invoice_number),
    reference_number:       asStringOrNull(tx.reference_number),
    items:                  normalizeItems(tx.items),
    tategaki:               asStringOrNull(tx.tategaki),
    withholding_tax_amount: track('withholding_tax', tx.withholding_tax_amount, asNumberOrNull(tx.withholding_tax_amount)),
    invoice_qualification:  asEnumOrNull(tx.invoice_qualification, ['qualified', 'kubun_kisai']),
    addressee:              asStringOrNull(tx.addressee),
    transaction_type:       asEnumOrNull(tx.transaction_type, ['purchase', 'expense', 'asset', 'sales', 'fee']),
    transfer_fee_bearer:    asEnumOrNull(tx.transfer_fee_bearer, ['sender', 'receiver']),
  };

  if (fallbacks.length > 0) {
    console.warn(`[OCR抽出] フォールバック発生: ${fallbacks.join(', ')}`);
  }

  return result;
}

/** 税区分詳細を正規化する */
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

/** 日付文字列を YYYY-MM-DD に正規化する */
function normalizeDate(value: any): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replace(/\//g, '-');
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) return normalized;
  return normalized;
}

/** インボイス登録番号を正規化する（T + 13桁） */
function normalizeInvoiceNumber(value: any): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const cleaned = value.trim()
    .replace(/^Ｔ/, 'T')
    .replace(/[\s\-]/g, '');
  if (/^T\d{13}$/.test(cleaned)) return cleaned;
  return value.trim();
}

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
