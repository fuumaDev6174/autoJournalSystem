/**
 * @module ルールマッチングサービス
 * @description OCR 結果をルール条件と照合し、最優先の1件を返す。
 *              優先順位: client > industry > shared（スコープが狭いほど優先）。
 */

import { evaluateConditions } from '../../core/matching/condition-evaluator.js';
import type { RuleMatchInput, MatchedRule } from './rule-engine.types.js';

/**
 * ルール配列を優先順に走査し、最初にマッチしたルールを返す。
 * client スコープ → industry スコープ → shared スコープの順で評価するため、
 * クライアント固有ルールが業種共通ルールより常に優先される。
 *
 * @param rules - 処理ルール配列
 * @param input - OCR 抽出データから構築したマッチ入力
 * @returns マッチしたルール。マッチなしなら null（AI 生成にフォールバック）
 */
export function matchProcessingRules(
  rules: Array<{
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
  }>,
  input: RuleMatchInput
): MatchedRule | null {
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

  // スコープ優先順: client(最優先) → industry → shared
  const orderedRules = [...clientRules, ...industryRules, ...sharedRules];

  for (const rule of orderedRules) {
    if (evaluateConditions(rule.conditions, input)) {
      // account_item_id がないルールは仕訳を組めないためスキップ
      if (!rule.actions.account_item_id) continue;

      console.log(`[ルールマッチ] ✅ マッチ: "${rule.rule_name}" (priority=${rule.priority}, scope=${rule.scope})`);

      return {
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
      };
    }
  }

  console.log(`[ルールマッチ] ルールマッチなし → Gemini AI にフォールバック`);
  return null;
}
