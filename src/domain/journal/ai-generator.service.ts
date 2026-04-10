/**
 * @module AI 仕訳生成サービス
 * @description Gemini AI で OCR 結果から仕訳（借方・貸方）を自動生成する。
 */

import { ai, GEMINI_MODEL_JOURNAL, callGeminiWithRetry } from '../../adapters/gemini/gemini.client.js';
import { buildJournalGenerationPrompt } from './ai-generator.prompt.js';
import type { JournalEntryInput, GeneratedJournalEntry, GeneratedJournalLine } from './journal.types.js';

/**
 * OCR 抽出データから仕訳を AI 生成する。
 * Gemini が返した JSON をパースし、失敗時は雑費/現金のフォールバック仕訳を返す。
 *
 * @param input - OCR 抽出データ + 勘定科目・税区分マスタ
 * @returns 生成された仕訳（category, lines, confidence 等）
 */
export async function generateJournalEntry(
  input: JournalEntryInput
): Promise<GeneratedJournalEntry> {
  try {
    const prompt = buildJournalGenerationPrompt(input);

    const result = await callGeminiWithRetry(() => ai.models.generateContent({
      model: GEMINI_MODEL_JOURNAL,
      contents: prompt,
    }), '仕訳生成');

    const text = result.text ?? '';

    // Gemini は ```json``` で囲む場合と裸の {} で返す場合がある
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/) || text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;

    let generated;
    try {
      generated = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[仕訳生成] JSON parse失敗。Geminiの生レスポンス:', text.slice(0, 500));
      throw new Error(`Gemini応答のJSON解析に失敗: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    const lines: GeneratedJournalLine[] = (generated.lines || []).map((line: any, idx: number) => ({
      line_number: line.line_number ?? idx + 1,
      debit_credit: line.debit_credit || 'debit',
      account_item_name: line.account_item_name || '雑費',
      tax_category_name: line.tax_category_name || null,
      amount: Number(line.amount) || 0,
      tax_rate: line.tax_rate ?? null,
      tax_amount: line.tax_amount != null ? Number(line.tax_amount) : null,
      description: line.description || '',
      supplier_name: line.supplier_name || null,
      item_name: line.item_name || null,
    }));

    // Gemini が lines を空で返すことがあるため、最低限の借方/貸方を補完
    if (lines.length === 0) {
      lines.push(
        ...buildFallbackLines(input)
      );
    }

    return {
      category: generated.category || '事業用',
      notes: generated.notes || `${input.supplier}`,
      confidence: generated.confidence ?? 0.7,
      reasoning: generated.reasoning || '自動判定',
      lines,
    };
  } catch (error) {
    console.error('仕訳生成エラー:', error);
    return {
      category: '事業用',
      notes: `${input.supplier}`,
      confidence: 0.3,
      reasoning: `AI判定失敗 - デフォルト値を使用（${error instanceof Error ? error.message : String(error)}）`,
      lines: buildFallbackLines(input),
    };
  }
}

/**
 * AI 生成失敗時のフォールバック仕訳を組み立てる。
 * 借方=雑費、貸方=決済手段に応じた科目で最低限の複式簿記を成立させる。
 */
function buildFallbackLines(input: JournalEntryInput): GeneratedJournalLine[] {
  return [
    {
      line_number: 1,
      debit_credit: 'debit',
      account_item_name: '雑費',
      tax_category_name: input.tax_amount ? '課対仕入10%' : null,
      amount: input.amount,
      tax_rate: input.tax_amount ? 0.10 : null,
      tax_amount: input.tax_amount,
      description: `${input.supplier}`,
    },
    {
      line_number: 2,
      debit_credit: 'credit',
      account_item_name: input.payment_method === 'credit_card' ? '未払金' : '現金',
      tax_category_name: null,
      amount: input.amount,
      tax_rate: null,
      tax_amount: null,
      description: `${input.supplier}`,
    },
  ];
}
