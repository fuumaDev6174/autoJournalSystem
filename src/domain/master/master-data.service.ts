// マスタデータ取得サービス（勘定科目・税区分・フォールバック科目）

import { supabaseAdmin } from '../../adapters/supabase/supabase-admin.client.js';
import type { AccountItemRef, TaxCategoryRef } from '../journal/journal.types.js';

export async function getOrganizationId(clientId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('clients').select('organization_id').eq('id', clientId).single();
  if (error || !data) return null;
  return data.organization_id || null;
}

/** 組織固有 + 共通マスタ（organization_id=NULL）の両方を取得 */
export async function fetchAccountItems(organizationId: string): Promise<AccountItemRef[]> {
  const { data, error } = await supabaseAdmin
    .from('account_items')
    .select('id, code, name, category:account_categories(name)')
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .eq('is_active', true)
    .order('code', { ascending: true });

  if (error) {
    console.error('[fetchAccountItems] エラー:', error.message);
    return [];
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    code: item.code || '',
    name: item.name,
    category: item.category?.name || 'expense',
  }));
}

/** tax_rates を JOIN して税率を取得。FK名不一致時は個別取得にフォールバック */
export async function fetchTaxCategories(): Promise<TaxCategoryRef[]> {
  const { data, error } = await supabaseAdmin
    .from('tax_categories')
    .select('id, code, name, tax_rate:tax_rates!current_tax_rate_id(rate)')
    .eq('is_active', true)
    .order('code', { ascending: true });

  if (!error) {
    return (data || []).map((item: any) => ({
      id: item.id,
      code: item.code || '',
      name: item.name,
      rate: Number(item.tax_rate?.rate) || 0,
    }));
  }

  // FK名不一致時のフォールバック: tax_rates を個別取得して手動 JOIN
  const { data: fallbackData, error: fallbackError } = await supabaseAdmin
    .from('tax_categories')
    .select('id, code, name, current_tax_rate_id')
    .eq('is_active', true)
    .order('code', { ascending: true });

  if (fallbackError) {
    console.error('[fetchTaxCategories] フォールバックも失敗:', fallbackError.message);
    return [];
  }

  const rateIds = [...new Set((fallbackData || []).map((t: any) => t.current_tax_rate_id).filter(Boolean))];
  let rateMap: Record<string, number> = {};

  if (rateIds.length > 0) {
    const { data: rates } = await supabaseAdmin.from('tax_rates').select('id, rate').in('id', rateIds);
    if (rates) rateMap = Object.fromEntries(rates.map((r: any) => [r.id, Number(r.rate)]));
  }

  return (fallbackData || []).map((item: any) => ({
    id: item.id,
    code: item.code || '',
    name: item.name,
    rate: item.current_tax_rate_id ? (rateMap[item.current_tax_rate_id] || 0) : 0,
  }));
}

export async function findFallbackAccountId(organizationId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('account_items')
    .select('id')
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .eq('name', '雑費')
    .eq('is_active', true)
    .limit(1);
  return data?.[0]?.id || '';
}
