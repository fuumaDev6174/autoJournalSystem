/**
 * @module 仕訳生成統合戦略
 * @description ルールマッチ → AI 生成のフォールバック戦略で仕訳を生成する。
 */

import { matchProcessingRules } from '../rule-engine/matcher.service.js';
import { buildEntryFromRule } from './rule-generator.service.js';
import { generateJournalEntry } from './ai-generator.service.js';
import type { JournalEntryInput, AccountItemRef, TaxCategoryRef, GeneratedJournalEntry } from './journal.types.js';
import type { RuleMatchInput } from '../rule-engine/rule-engine.types.js';

/**
 * ルールマッチを優先し、マッチしなければ Gemini AI で仕訳を生成する。
 * ルールマッチは高速かつ確定的、AI は柔軟だがコストがかかるため、この順序を採用。
 *
 * @param input - 仕訳生成の入力データ
 * @param ruleMatchInput - ルールマッチ用の入力
 * @param rules - 処理ルール配列
 * @param accountItems - 勘定科目マスタ
 * @param taxCategories - 税区分マスタ
 * @returns 生成された仕訳
 */
export async function generateJournalWithStrategy(
  input: JournalEntryInput,
  ruleMatchInput: RuleMatchInput,
  rules: Parameters<typeof matchProcessingRules>[0],
  accountItems: AccountItemRef[],
  taxCategories: TaxCategoryRef[],
): Promise<GeneratedJournalEntry> {
  const matched = matchProcessingRules(rules, ruleMatchInput);
  if (matched) {
    return buildEntryFromRule(matched, {
      supplier: input.supplier,
      amount: input.amount,
      tax_amount: input.tax_amount,
      payment_method: input.payment_method,
      date: input.date,
    }, accountItems, taxCategories);
  }
  return generateJournalEntry(input);
}
