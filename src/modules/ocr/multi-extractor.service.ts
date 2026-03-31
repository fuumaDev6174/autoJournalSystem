import { ai, GEMINI_MODEL_JOURNAL, callGeminiWithRetry } from '../../adapters/gemini/gemini.client.js';
import { buildMultiExtractPrompt } from './multi-extractor.prompt';

export async function extractMultipleEntries(
  imageBase64: string,
  mimeType: string,
  documentType: string,
  industryPath?: string
): Promise<Array<{
  date: string;
  description: string;
  amount: number;
  counterparty: string | null;
  is_income: boolean;
  suggested_account_name: string | null;
  tax_rate: number | null;
  confidence: number;
}>> {
  const prompt = buildMultiExtractPrompt(documentType, industryPath);

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: GEMINI_MODEL_JOURNAL,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      }],
    }), '明細分割');

    const text = response.text?.replace(/```json\n?|```\n?/g, '').trim() || '[]';
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.error('[extractMultipleEntries] 明細分割エラー:', error);
    return [];
  }
}
