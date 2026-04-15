// 取引先名寄せ — OCR 抽出の取引先名を既存マスタと照合する（完全一致 → 部分一致 → エイリアスの3段階）

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SupplierMatchResult {
  matchedSupplierId: string | null;
  matchedSupplierName: string | null;
  matchType: 'exact' | 'partial' | 'alias' | 'none';
}

const NONE_RESULT: SupplierMatchResult = { matchedSupplierId: null, matchedSupplierName: null, matchType: 'none' };

export async function findSupplierAliasMatch(
  supabaseAdmin: SupabaseClient,
  supplierName: string | null,
  organizationId: string,
): Promise<SupplierMatchResult> {
  if (!supplierName) return NONE_RESULT;
  const sName = supplierName.trim();
  if (!sName) return NONE_RESULT;

  // 1. 完全一致
  const { data: exactMatch } = await supabaseAdmin.from('suppliers')
    .select('id, name')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .ilike('name', sName)
    .limit(1);
  if (exactMatch && exactMatch.length > 0) {
    return { matchedSupplierId: exactMatch[0].id, matchedSupplierName: exactMatch[0].name, matchType: 'exact' };
  }

  // 2. 部分一致
  const escaped = sName.replace(/[%_]/g, '\\$&');
  const { data: partialMatch } = await supabaseAdmin.from('suppliers')
    .select('id, name')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .ilike('name', `%${escaped}%`)
    .limit(1);
  if (partialMatch && partialMatch.length > 0) {
    return { matchedSupplierId: partialMatch[0].id, matchedSupplierName: partialMatch[0].name, matchType: 'partial' };
  }

  // 3. エイリアス検索
  const { data: aliasMatch } = await supabaseAdmin.from('supplier_aliases')
    .select('supplier_id, alias_name, suppliers!inner(id, name, organization_id)')
    .eq('suppliers.organization_id', organizationId)
    .ilike('alias_name', `%${escaped}%`)
    .limit(1);
  if (aliasMatch && aliasMatch.length > 0) {
    const alias = aliasMatch[0];
    const sup = Array.isArray(alias.suppliers) ? alias.suppliers[0] : alias.suppliers;
    return { matchedSupplierId: alias.supplier_id, matchedSupplierName: sup?.name || null, matchType: 'alias' };
  }

  return NONE_RESULT;
}

// ---------------------------------------------------------------------------
// 取引先名 = クライアント名 の誤認検出（フロントエンド用の純粋関数）
// ---------------------------------------------------------------------------

export interface SupplierClientCheckResult {
  isMatch: boolean;
  similarity: number;
  warning?: string;
}

const NO_MATCH: SupplierClientCheckResult = { isMatch: false, similarity: 0 };

export function detectSupplierIsClient(
  supplierName: string,
  clientName: string,
  clientAliases?: string[],
): SupplierClientCheckResult {
  if (!supplierName || !clientName) return NO_MATCH;

  const normSupplier = normalizeForComparison(supplierName);
  const normClient = normalizeForComparison(clientName);

  if (normSupplier === normClient) {
    return { isMatch: true, similarity: 1.0,
      warning: `取引先「${supplierName}」はクライアント名と一致しています。請求書の宛先（請求先）を取引先として読み取っている可能性があります。` };
  }

  const sim = calcSimilarity(normSupplier, normClient);
  if (sim >= 0.8) {
    return { isMatch: true, similarity: sim,
      warning: `取引先「${supplierName}」がクライアント名「${clientName}」と類似しています。請求書の宛先を読み取っている可能性があります。` };
  }

  if (clientAliases) {
    for (const alias of clientAliases) {
      const normAlias = normalizeForComparison(alias);
      if (normSupplier === normAlias || calcSimilarity(normSupplier, normAlias) >= 0.8) {
        return { isMatch: true, similarity: 0.9,
          warning: `取引先「${supplierName}」がクライアントの別名「${alias}」と一致しています。` };
      }
    }
  }

  return NO_MATCH;
}

function normalizeForComparison(name: string): string {
  let n = name.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/株式会社|有限会社|合同会社|一般社団法人|合資会社/g, '')
    .replace(/（株）|（有）|（合）|\(株\)|\(有\)|\(合\)/g, '')
    .trim();
  // 全角→半角（英数字）
  n = n.replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return n;
}

function calcSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  // 包含関係チェック
  if (a.includes(b) || b.includes(a)) return 0.85;
  // Levenshtein 距離ベースの類似度
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
