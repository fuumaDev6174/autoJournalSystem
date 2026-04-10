/**
 * @module 取引先名寄せ
 * @description OCR 抽出の取引先名を既存マスタと照合する。
 *              完全一致 → 部分一致 → エイリアスの3段階でマッチ。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** 取引先マッチ結果 */
export interface SupplierMatchResult {
  matchedSupplierId: string | null;
  matchedSupplierName: string | null;
  matchType: 'exact' | 'partial' | 'alias' | 'none';
}

const NONE_RESULT: SupplierMatchResult = { matchedSupplierId: null, matchedSupplierName: null, matchType: 'none' };

/**
 * 取引先名をマスタ・エイリアスと3段階で照合する。
 * 全件ロードではなく SQL の ilike で DB 側フィルタを行う。
 */
export async function findSupplierAliasMatch(
  supabaseAdmin: SupabaseClient,
  supplierName: string | null,
  organizationId: string,
): Promise<SupplierMatchResult> {
  if (!supplierName) return NONE_RESULT;
  const sName = supplierName.trim();
  if (!sName) return NONE_RESULT;

  // 1. 完全一致（SQL で直接検索）
  const { data: exactMatch } = await supabaseAdmin.from('suppliers')
    .select('id, name')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .ilike('name', sName)
    .limit(1);
  if (exactMatch && exactMatch.length > 0) {
    return { matchedSupplierId: exactMatch[0].id, matchedSupplierName: exactMatch[0].name, matchType: 'exact' };
  }

  // 2. 部分一致（SQL ilike でパターン検索）
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

  // 3. エイリアス検索（SQL ilike + org フィルタ）
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
