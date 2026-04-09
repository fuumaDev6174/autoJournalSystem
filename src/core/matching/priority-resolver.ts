/**
 * @module ルール優先順位解決
 * @description scope（client > industry > shared）→ priority 数値の順でソート。
 */

export type RuleScope = 'client' | 'industry' | 'shared';

const SCOPE_ORDER: Record<RuleScope, number> = {
  client: 0,
  industry: 1,
  shared: 2,
};

export interface SortableRule {
  scope: RuleScope;
  priority: number;
  client_id: string | null;
  industry_id: string | null;
}

/** ルールを scope → priority の順でソートし、対象外のルールを除外する */
export function sortByPriority<T extends SortableRule>(
  rules: T[],
  targetClientId: string,
  targetIndustryIds: string[]
): T[] {
  return [...rules]
    .filter(r => {
      if (r.scope === 'client') return r.client_id === targetClientId;
      if (r.scope === 'industry') return r.industry_id != null && targetIndustryIds.includes(r.industry_id);
      return true; // shared
    })
    .sort((a, b) => {
      const scopeDiff = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
      if (scopeDiff !== 0) return scopeDiff;
      return a.priority - b.priority;
    });
}
