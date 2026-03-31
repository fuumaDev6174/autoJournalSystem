import { ai, GEMINI_MODEL_OCR, callGeminiWithRetry } from '@/adapters/gemini/gemini.client';
import { CLASSIFY_DOCUMENT_PROMPT } from './classifier.prompt';

export async function classifyDocument(
  imageBase64: string,
  mimeType: string
): Promise<{
  document_type_code: string;
  confidence: number;
  estimated_lines: number;
  description: string;
}> {
  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: GEMINI_MODEL_OCR,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: CLASSIFY_DOCUMENT_PROMPT },
          ],
        },
      ],
    }), '証憑分類');

    const text = response.text?.replace(/```json\n?|```\n?/g, '').trim() || '';
    const parsed = JSON.parse(text);
    return {
      document_type_code: parsed.document_type_code || 'other_ref',
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
      estimated_lines: parsed.estimated_lines || 1,
      description: parsed.description || '',
    };
  } catch (error) {
    console.error('[classifyDocument] 証憑種別判定エラー:', error);
    return {
      document_type_code: 'other_journal',
      confidence: 0.3,
      estimated_lines: 1,
      description: 'AI判定失敗',
    };
  }
}
