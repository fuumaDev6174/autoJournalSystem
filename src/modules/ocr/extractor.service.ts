import { ai, GEMINI_MODEL_OCR, callGeminiWithRetry } from '../../adapters/gemini/gemini.client.js';
import { EXTRACT_OCR_PROMPT } from './extractor.prompt.js';
import type { OCRTransaction, OCRResult } from './ocr.types.js';

export async function processOCR(imageUrl: string): Promise<OCRResult> {
  try {
    const fetchRes = await fetch(imageUrl);
    if (!fetchRes.ok) {
      throw new Error(`画像の取得に失敗しました: ${fetchRes.status}`);
    }
    const arrayBuffer = await fetchRes.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';

    const ext = imageUrl.split('?')[0].split('.').pop()?.toLowerCase();
    const mimeType =
      ext === 'pdf' || contentType.includes('pdf') ? 'application/pdf'
      : ext === 'png' || contentType.includes('png') ? 'image/png'
      : ext === 'webp' || contentType.includes('webp') ? 'image/webp'
      : 'image/jpeg';

    const result = await callGeminiWithRetry(() => ai.models.generateContent({
      model: GEMINI_MODEL_OCR,
      contents: [
        {
          role: 'user',
          parts: [
            { text: EXTRACT_OCR_PROMPT },
            { inlineData: { mimeType, data: base64Image } },
          ],
        },
      ],
    }), 'OCR');

    const text = result.text ?? '';
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/) || text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;

    let extracted;
    try {
      extracted = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[OCR] JSON parse失敗。Geminiの生レスポンス:', text.slice(0, 500));
      throw new Error(`Gemini応答のJSON解析に失敗: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    const transactions: OCRTransaction[] = (extracted.transactions || []).map((tx: any) => ({
      date: tx.date || null,
      supplier: tx.supplier || null,
      total_amount: tx.total_amount != null ? Number(tx.total_amount) : null,
      tax_amount: tx.tax_amount != null ? Number(tx.tax_amount) : null,
      tax_details: tx.tax_details || null,
      tax_included: tx.tax_included ?? true,
      payment_method: tx.payment_method || null,
      invoice_number: tx.invoice_number || null,
      reference_number: tx.reference_number || null,
      items: (tx.items || []).map((item: any) => ({
        name: item.name || '',
        quantity: item.quantity ?? null,
        unit_price: item.unit_price ?? null,
        amount: Number(item.amount) || 0,
        tax_rate: item.tax_rate ?? null,
      })),
      tategaki: tx.tategaki || null,
      withholding_tax_amount: tx.withholding_tax_amount != null ? Number(tx.withholding_tax_amount) : null,
      invoice_qualification: tx.invoice_qualification || null,
      addressee: tx.addressee || null,
      transaction_type: tx.transaction_type || null,
      transfer_fee_bearer: tx.transfer_fee_bearer || null,
    }));

    const firstTx = transactions[0] || ({} as OCRTransaction);

    return {
      raw_text: text,
      document_type: extracted.document_type || 'other',
      transactions,
      extracted_date: firstTx.date || null,
      extracted_supplier: firstTx.supplier || null,
      extracted_amount: firstTx.total_amount ?? null,
      extracted_tax_amount: firstTx.tax_amount ?? null,
      extracted_items: firstTx.items?.length
        ? firstTx.items.map((i) => ({
            name: i.name,
            quantity: i.quantity ?? undefined,
            unit_price: i.unit_price ?? undefined,
            amount: i.amount,
            tax_rate: i.tax_rate ?? undefined,
          }))
        : null,
      extracted_payment_method: firstTx.payment_method || null,
      extracted_invoice_number: firstTx.invoice_number || null,
      extracted_tategaki: firstTx.tategaki || null,
      extracted_withholding_tax: firstTx.withholding_tax_amount ?? null,
      extracted_invoice_qualification: firstTx.invoice_qualification || null,
      extracted_addressee: firstTx.addressee || null,
      extracted_transaction_type: firstTx.transaction_type || null,
      extracted_transfer_fee_bearer: firstTx.transfer_fee_bearer || null,
      confidence_score: extracted.confidence ?? 0.85,
    };
  } catch (error) {
    console.error('OCR処理エラー:', error);
    throw new Error(`OCR処理に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}
