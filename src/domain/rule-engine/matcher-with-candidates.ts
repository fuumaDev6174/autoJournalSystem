/**
 * @module ルールマッチング（候補付き）
 * @description matcher.service.ts の拡張版。最優先マッチに加え、他の候補も返す。
 *              ReviewPage でユーザーに代替ルールを提示するために使用。
 */

import { buildOrderedMatches, type ProcessingRule } from './matcher.service.js';
import type { RuleMatchInput, MatchedRule } from './rule-engine.types.js';

/**
 * 全マッチルールを収集し、最優先の1件 + 残りの候補を返す。
 */
export function matchProcessingRulesWithCandidates(
  rules: ProcessingRule[],
  input: RuleMatchInput,
): {
  matched: MatchedRule | null;
  candidates: Array<MatchedRule & { scope: string; priority: number }>;
} {
  const allMatched = buildOrderedMatches(rules, input);

  return {
    matched: allMatched.length > 0 ? allMatched[0] : null,
    candidates: allMatched.slice(1),
  };
}
