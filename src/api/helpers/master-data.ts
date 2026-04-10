/**
 * @module マスタデータヘルパー
 */

import { supabaseAdmin } from '../../adapters/supabase/supabase-admin.client.js';
import type { AccountItemRef, TaxCategoryRef } from '../../modules/journal/journal.types.js';

export { supabaseAdmin };

export const isValidUUID = (str: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const ALWAYS_BLOCKED_FIELDS = ['id', 'created_at', 'updated_at'];

/** Mass Assignment 防止: req.body から保護フィールドを除去する */
export function sanitizeBody(
  body: Record<string, any>,
  extraBlocked: string[] = [],
): Record<string, any> {
  const blocked = new Set([...ALWAYS_BLOCKED_FIELDS, ...extraBlocked]);
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (!blocked.has(key)) result[key] = value;
  }
  return result;
}

/** ストレージパス検証（パストラバーサル防止） */
export function isValidStoragePath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  if (filePath.includes('..')) return false;
  if (filePath.startsWith('/') || filePath.startsWith('\\')) return false;
  return /^[a-zA-Z0-9_\-./]+$/.test(filePath);
}

export async function verifyClientOwnership(clientId: string, organizationId: string): Promise<boolean> {
  if (!clientId || !organizationId) return false;
  const { data } = await supabaseAdmin
    .from('clients').select('id').eq('id', clientId).eq('organization_id', organizationId).single();
  return !!data;
}

export async function verifyDocumentOwnership(documentId: string, organizationId: string): Promise<boolean> {
  if (!documentId || !organizationId) return false;
  const { data: doc } = await supabaseAdmin.from('documents').select('client_id').eq('id', documentId).single();
  if (!doc?.client_id) return false;
  return verifyClientOwnership(doc.client_id, organizationId);
}

export async function verifyJournalEntryOwnership(journalEntryId: string, organizationId: string): Promise<boolean> {
  if (!journalEntryId || !organizationId) return false;
  const { data: entry } = await supabaseAdmin.from('journal_entries').select('client_id').eq('id', journalEntryId).single();
  if (!entry?.client_id) return false;
  return verifyClientOwnership(entry.client_id, organizationId);
}

export async function verifyWorkflowOwnership(workflowId: string, organizationId: string): Promise<boolean> {
  if (!workflowId || !organizationId) return false;
  const { data } = await supabaseAdmin
    .from('workflows').select('id').eq('id', workflowId).eq('organization_id', organizationId).single();
  return !!data;
}

export function safeErrorMessage(error: any): string {
  if (process.env.NODE_ENV === 'production') return 'サーバーエラーが発生しました';
  return error?.message || 'サーバーエラーが発生しました';
}

export async function createNotification(params: {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  linkUrl?: string;
}) {
  try {
    await supabaseAdmin.from('notifications').insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      type: params.type,
      title: params.title,
      message: params.message || null,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      link_url: params.linkUrl || null,
    });
  } catch (e: any) {
    console.error('[通知] 作成エラー:', e.message);
  }
}

export async function getOrganizationId(clientId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('clients').select('organization_id').eq('id', clientId).single();
  if (error || !data) return null;
  return data.organization_id || null;
}

/** 勘定科目を取得（組織固有 + 共通マスタ） */
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

/** 税区分を取得（tax_rates を JOIN して税率を取得） */
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
