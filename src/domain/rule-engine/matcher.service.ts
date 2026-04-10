/**
 * @module ルールマッチングサービス
 * @description OCR 結果をルール条件と照合し、最優先の1件を返す。
 *              優先順位: client > industry > shared（スコープが狭いほど優先）。
 */

import { evaluateConditions } from './condition-evaluator.js';
import type { RuleMatchInput, MatchedRule } from './rule-engine.types.js';

/** matcher / matcher-with-candidates が共通で受け取るルール型 */
export type ProcessingRule = {
  id: string;
  rule_name: string;
  priority: number;
  scope: string;
  rule_type: string;
  client_id: string | null;
  industry_id: string | null;
  conditions: {
    supplier_pattern?: string | null;
    transaction_pattern?: string | null;
    amount_min?: number | null;
    amount_max?: number | null;
    item_pattern?: string | null;
    payment_method?: string | null;
    document_type?: string | null;
    has_invoice_number?: boolean | null;
    tax_rate_hint?: number | null;
    is_internal_tax?: boolean | null;
    frequency_hint?: string | null;
    tategaki_pattern?: string | null;
    invoice_qualification?: string | null;
    addressee_pattern?: string | null;
    transaction_type?: string | null;
    transfer_fee_bearer?: string | null;
  };
  actions: {
    account_item_id?: string | null;
    tax_category_id?: string | null;
    description_template?: string | null;
    business_ratio?: number | null;
    business_ratio_note?: string | null;
    entry_type_hint?: string | null;
    requires_manual_review?: boolean | null;
    auto_tags?: string[] | null;
    withholding_tax_handling?: string | null;
  };
  is_active: boolean;
};

/** ルールから MatchedRule + スコープ/優先度を構築する共通関数 */
function toMatchedRule(rule: ProcessingRule): MatchedRule & { scope: string; priority: number } {
  return {
    rule_id: rule.id,
    rule_name: rule.rule_name,
    account_item_id: rule.actions.account_item_id!,
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
  };
}

/**
 * ルール配列をスコープ優先順にソートし、条件にマッチするもの全てを返す。
 * matcher と matcher-with-candidates の共通基盤。
 */
export function buildOrderedMatches(
  rules: ProcessingRule[],
  input: RuleMatchInput,
): Array<MatchedRule & { scope: string; priority: number }> {
  const activeRules = rules.filter(r => r.is_active);

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
  const matches: Array<MatchedRule & { scope: string; priority: number }> = [];

  for (const rule of orderedRules) {
    if (evaluateConditions(rule.conditions, input) && rule.actions.account_item_id) {
      matches.push(toMatchedRule(rule));
    }
  }

  return matches;
}

/**
 * ルール配列を優先順に走査し、最初にマッチしたルールを返す。
 */
export function matchProcessingRules(
  rules: ProcessingRule[],
  input: RuleMatchInput,
): MatchedRule | null {
  const matches = buildOrderedMatches(rules, input);

  if (matches.length > 0) {
    console.log(`[ルールマッチ] マッチ: "${matches[0].rule_name}" (priority=${matches[0].priority}, scope=${matches[0].scope})`);
    return matches[0];
  }

  console.log(`[ルールマッチ] ルールマッチなし → Gemini AI にフォールバック`);
  return null;
}
