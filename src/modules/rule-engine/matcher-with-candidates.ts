/**
 * @module ルールマッチング（候補付き）
 * @description matcher.service.ts の拡張版。最優先マッチに加え、他の候補も返す。
 *              ReviewPage でユーザーに代替ルールを提示するために使用。
 */

import { evaluateConditions } from '../../core/matching/condition-evaluator.js';
import { matchProcessingRules } from './matcher.service.js';
import type { RuleMatchInput, MatchedRule } from './rule-engine.types.js';

/**
 * 全マッチルールを収集し、最優先の1件 + 残りの候補を返す。
 *
 * @param rules - 処理ルール配列
 * @param input - マッチ入力
 * @returns matched（最優先）と candidates（その他のマッチ）
 */
export function matchProcessingRulesWithCandidates(
  rules: Parameters<typeof matchProcessingRules>[0],
  input: RuleMatchInput
): {
  matched: MatchedRule | null;
  candidates: Array<MatchedRule & { scope: string; priority: number }>;
} {
  const activeRules = rules.filter(r => r.is_active);
  const allMatched: Array<MatchedRule & { scope: string; priority: number }> = [];

  const clientRules = activeRules
    .filter(r => r.scope === 'client' && r.client_id === input.client_id)
    .sort((a, b) => a.priority - b.priority);
  const industryRules = activeRules
    .filter(r => r.scope === 'industry' && r.industry_id && input.industry_ids.includes(r.industry_id))
    .sort((a, b) => a.priority - b.priority);
  const sharedRules = activeRules
    .filter(r => r.scope === 'shared')
    .sort((a, b) => a.priority - b.priority);

  const orderedRules = [...clientRules, ...industryRules, ...sharedRules];

  for (const rule of orderedRules) {
    if (evaluateConditions(rule.conditions, input) && rule.actions.account_item_id) {
      allMatched.push({
        rule_id: rule.id,
        rule_name: rule.rule_name,
        account_item_id: rule.actions.account_item_id,
        tax_category_id: rule.actions.tax_category_id || null,
        description_template: rule.actions.description_template || null,
        business_ratio: rule.actions.business_ratio || null,
        business_ratio_note: rule.actions.business_ratio_note || null,
        entry_type_hint: rule.actions.entry_type_hint || null,
        requires_manual_review: rule.actions.requires_manual_review === true,
        withholding_tax_handling: rule.actions.withholding_tax_handling || null,
        confidence: 0.95,
        scope: rule.scope,
        priority: rule.priority,
      });
    }
  }

  return {
    matched: allMatched.length > 0 ? allMatched[0] : null,
    candidates: allMatched.slice(1),
  };
}
