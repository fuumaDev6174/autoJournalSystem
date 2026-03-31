import { matchProcessingRules } from '../rule-engine/matcher.service.js';
import { buildEntryFromRule } from './rule-generator.service.js';
import { generateJournalEntry } from './ai-generator.service.js';
import type { JournalEntryInput, AccountItemRef, TaxCategoryRef, GeneratedJournalEntry } from './journal.types.js';
import type { RuleMatchInput } from '../rule-engine/rule-engine.types.js';

/**
 * 仕訳生成の統合戦略:
 * 1. ルールエンジンでマッチを試みる
 * 2. マッチしなければ Gemini AI にフォールバック
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
