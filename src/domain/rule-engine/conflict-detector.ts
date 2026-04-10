/**
 * @module ルール競合検出
 * @description 同一条件で異なるアクション（勘定科目）を持つルールペアを検出する。
 */

import type { ProcessingRule } from './matcher.service.js';

/** 競合ルールのペア */
export interface RuleConflict {
  ruleA: { id: string; name: string; accountItemId: string | null };
  ruleB: { id: string; name: string; accountItemId: string | null };
  reason: string;
}

/**
 * アクティブなルール配列から、条件が実質同一で勘定科目が異なるペアを検出する。
 * 条件の同一性は conditions オブジェクトの JSON 一致で判定する。
 */
export function detectConflicts(rules: ProcessingRule[]): RuleConflict[] {
  const activeRules = rules.filter(r => r.is_active);
  const conflicts: RuleConflict[] = [];

  // 条件セットを正規化した文字列をキーとしてグルーピング
  const byCondition = new Map<string, ProcessingRule[]>();

  for (const rule of activeRules) {
    const key = normalizeConditionKey(rule.conditions);
    const group = byCondition.get(key);
    if (group) {
      group.push(rule);
    } else {
      byCondition.set(key, [rule]);
    }
  }

  // 同一条件グループ内でアクションが異なるペアを検出
  for (const [, group] of byCondition) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.actions.account_item_id !== b.actions.account_item_id) {
          conflicts.push({
            ruleA: { id: a.id, name: a.rule_name, accountItemId: a.actions.account_item_id || null },
            ruleB: { id: b.id, name: b.rule_name, accountItemId: b.actions.account_item_id || null },
            reason: '同一条件で異なる勘定科目が設定されています',
          });
        }
      }
    }
  }

  return conflicts;
}

/** 条件セットを正規化してキー文字列にする（null/undefined は除外、キー順ソート） */
function normalizeConditionKey(conditions: ProcessingRule['conditions']): string {
  const entries = Object.entries(conditions)
    .filter(([, v]) => v != null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}
