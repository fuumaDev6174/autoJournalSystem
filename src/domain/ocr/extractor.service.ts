// OCR データ抽出サービス — 画像を Gemini に送り取引データを構造化して返す

import { ai, GEMINI_MODEL_OCR, callGeminiWithRetry } from '../../adapters/gemini/gemini.client.js';
import { buildExtractorPrompt } from './extractor.prompt.js';
import {
  detectMimeType, extractJSON, safeParseJSON,
  toNumber, clamp, asStringOrNull, asNumberOrNull, asEnumOrNull, normalizeDate,
} from './ocr-parse-utils.js';
import type { OCRTransaction, OCRResult } from './ocr.types.js';

const TAX_PAYMENT_TYPES = [
  'income_tax', 'consumption_tax', 'resident_tax', 'property_tax',
  'auto_tax', 'national_health_insurance', 'national_pension',
  'business_tax', 'other_tax',
] as const;

export async function processOCR(
  imageUrl: string,
  preloaded?: { base64: string; mimeType: string },
  documentTypeCode?: string,
): Promise<OCRResult> {
  const image = preloaded ?? await fetchImage(imageUrl);
  const rawText = await callGemini(image, documentTypeCode);
  const extracted = parseGeminiResponse(rawText);
  const transactions = normalizeTransactions(extracted.transactions);
  return buildResult(rawText, extracted, transactions);
}

async function fetchImage(url: string): Promise<{ base64: string; mimeType: string }> {
  let res: globalThis.Response;
  try {
    res = await fetch(url);
  } catch (error: unknown) {
    throw new Error(`画像のダウンロードに失敗: ${error instanceof Error ? error.message : String(error)}`);
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

async function callGemini(image: { base64: string; mimeType: string }, documentTypeCode?: string): Promise<string> {
  const prompt = buildExtractorPrompt(documentTypeCode);
  let response;
  try {
    response = await callGeminiWithRetry(
      () => ai.models.generateContent({
        model: GEMINI_MODEL_OCR,
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: image.mimeType, data: image.base64 } },
          ],
        }],
      }),
      'OCR抽出',
    );
  } catch (error: unknown) {
    throw new Error(`Gemini API エラー: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`);
  }

  const text = response?.text ?? '';
  if (text.trim().length === 0) {
    throw new Error('Gemini から空の応答が返されました');
  }

  return text;
}

function parseGeminiResponse(rawText: string): Record<string, any> {
  const jsonText = extractJSON(rawText);
  if (!jsonText) {
    console.error('[OCR抽出] JSON抽出失敗。応答:', rawText.slice(0, 500));
    throw new Error('Gemini 応答から JSON を抽出できません');
  }

  const parsed = safeParseJSON(jsonText, 'OCR抽出');
  if (!parsed) {
    throw new Error('Gemini 応答の JSON パースに失敗しました');
  }
  return parsed;
}

function normalizeTransactions(raw: unknown): OCRTransaction[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    console.warn('[OCR抽出] transactions が空または配列でない → 空配列を返します');
    return [];
  }
  return raw.map(normalizeTx);
}

function normalizeTx(tx: Record<string, any>): OCRTransaction {
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
    transaction_type:       asEnumOrNull(tx.transaction_type, ['purchase', 'expense', 'asset', 'sales', 'fee', 'tax_payment']),
    transfer_fee_bearer:    asEnumOrNull(tx.transfer_fee_bearer, ['sender', 'receiver']),
    tax_payment_type:       asEnumOrNull(tx.tax_payment_type, TAX_PAYMENT_TYPES),
  };

  if (fallbacks.length > 0) {
    console.warn(`[OCR抽出] フォールバック発生: ${fallbacks.join(', ')}`);
  }

  return result;
}

function normalizeTaxDetails(raw: unknown): OCRTransaction['tax_details'] {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    rate_10_amount: asNumberOrNull(r.rate_10_amount),
    rate_10_tax:    asNumberOrNull(r.rate_10_tax),
    rate_8_amount:  asNumberOrNull(r.rate_8_amount),
    rate_8_tax:     asNumberOrNull(r.rate_8_tax),
    exempt_amount:  asNumberOrNull(r.exempt_amount),
  };
}

function normalizeItems(raw: unknown): OCRTransaction['items'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: Record<string, unknown>) => ({
    name:       (typeof item.name === 'string') ? item.name : '',
    quantity:   asNumberOrNull(item.quantity),
    unit_price: asNumberOrNull(item.unit_price),
    amount:     toNumber(item.amount),
    tax_rate:   asNumberOrNull(item.tax_rate),
  }));
}

function normalizeInvoiceNumber(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  // T + 13桁の形式に正規化
  const cleaned = value.trim()
    .replace(/^Ｔ/, 'T')
    .replace(/[\s\-]/g, '');
  if (/^T\d{13}$/.test(cleaned)) return cleaned;
  console.warn(`[抽出] インボイス番号不正（T+13桁でない）: "${value}"`);
  return null;
}

function buildResult(
  rawText: string,
  extracted: Record<string, any>,
  transactions: OCRTransaction[],
): OCRResult {
  const first = transactions[0];

  return {
    raw_text: rawText,
    document_type: asStringOrNull(extracted.document_type) ?? 'other',
    transactions,
    confidence_score: clamp(toNumber(extracted.confidence, 0.5), 0, 1),

    extracted_date:                  first?.date ?? null,
    extracted_supplier:              first?.supplier ?? null,
    extracted_amount:                first?.total_amount ?? null,
    extracted_tax_amount:            first?.tax_amount ?? null,
    extracted_payment_method:        first?.payment_method ?? null,
    extracted_invoice_number:        first?.invoice_number ?? null,
    extracted_tategaki:              first?.tategaki ?? null,
    extracted_withholding_tax:       first?.withholding_tax_amount ?? null,
    extracted_invoice_qualification: first?.invoice_qualification ?? null,
    extracted_addressee:             first?.addressee ?? null,
    extracted_transaction_type:      first?.transaction_type ?? null,
    extracted_transfer_fee_bearer:   first?.transfer_fee_bearer ?? null,
    extracted_tax_payment_type:      first?.tax_payment_type ?? null,
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
