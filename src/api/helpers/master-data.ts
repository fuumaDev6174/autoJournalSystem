/**
 * @module マスタデータヘルパー
 * @description 勘定科目・税区分取得、UUID バリデーション、通知作成など共通ヘルパー。
 */

import { supabaseAdmin } from '../../adapters/supabase/supabase-admin.client.js';
import type { AccountItemRef, TaxCategoryRef } from '../../modules/journal/journal.types.js';

export { supabaseAdmin };

/** UUID 形式バリデーション */
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
    if (!blocked.has(key)) {
      result[key] = value;
    }
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

/** クライアントが指定組織に属するか検証する */
export async function verifyClientOwnership(
  clientId: string,
  organizationId: string,
): Promise<boolean> {
  if (!clientId || !organizationId) return false;
  const { data } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('organization_id', organizationId)
    .single();
  return !!data;
}

/** ドキュメントが指定組織に属するか検証する（client_id 経由） */
export async function verifyDocumentOwnership(
  documentId: string,
  organizationId: string,
): Promise<boolean> {
  if (!documentId || !organizationId) return false;
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('client_id')
    .eq('id', documentId)
    .single();
  if (!doc?.client_id) return false;
  return verifyClientOwnership(doc.client_id, organizationId);
}

/** 仕訳エントリが指定組織に属するか検証する（client_id 経由） */
export async function verifyJournalEntryOwnership(
  journalEntryId: string,
  organizationId: string,
): Promise<boolean> {
  if (!journalEntryId || !organizationId) return false;
  const { data: entry } = await supabaseAdmin
    .from('journal_entries')
    .select('client_id')
    .eq('id', journalEntryId)
    .single();
  if (!entry?.client_id) return false;
  return verifyClientOwnership(entry.client_id, organizationId);
}

/** ワークフローが指定組織に属するか検証する（organization_id 直接） */
export async function verifyWorkflowOwnership(
  workflowId: string,
  organizationId: string,
): Promise<boolean> {
  if (!workflowId || !organizationId) return false;
  const { data } = await supabaseAdmin
    .from('workflows')
    .select('id')
    .eq('id', workflowId)
    .eq('organization_id', organizationId)
    .single();
  return !!data;
}

/** 本番環境では内部詳細を隠蔽したエラーメッセージを返す */
export function safeErrorMessage(error: any): string {
  if (process.env.NODE_ENV === 'production') {
    return 'サーバーエラーが発生しました';
  }
  return error?.message || 'サーバーエラーが発生しました';
}

/** 通知レコードを作成する */
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

/** client_id → organization_id を解決する */
export async function getOrganizationId(clientId: string): Promise<string | null> {
  console.log(`[getOrganizationId] client_id="${clientId}" で clients テーブルを検索中...`);

  const { data, error, status, statusText } = await supabaseAdmin
    .from('clients')
    .select('organization_id')
    .eq('id', clientId)
    .single();

  if (error) {
    console.error(`[getOrganizationId] ❌ Supabase エラー:`, {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      httpStatus: status,
      httpStatusText: statusText,
    });
    return null;
  }

  if (!data) {
    console.warn(`[getOrganizationId] ⚠️ client_id="${clientId}" のレコードが見つかりません (data=null)`);
    return null;
  }

  console.log(`[getOrganizationId] ✅ organization_id="${data.organization_id}"`);
  return data.organization_id || null;
}

/** 勘定科目を取得（組織固有 + 共通マスタ(organization_id=NULL)） */
export async function fetchAccountItems(organizationId: string): Promise<AccountItemRef[]> {
  console.log(`[fetchAccountItems] organization_id="${organizationId}" で勘定科目を取得中（共通マスタ含む）...`);

  const { data, error, status } = await supabaseAdmin
    .from('account_items')
    .select('id, code, name, category:account_categories(name)')
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .eq('is_active', true)
    .order('code', { ascending: true });

  if (error) {
    console.error(`[fetchAccountItems] ❌ Supabase エラー:`, {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      httpStatus: status,
    });
    return [];
  }

  const items = (data || []).map((item: any) => ({
    id: item.id,
    code: item.code || '',
    name: item.name,
    category: item.category?.name || 'expense',
  }));

  console.log(`[fetchAccountItems] ✅ ${items.length}件の勘定科目を取得`);
  return items;
}

/** 税区分を取得（tax_rates を JOIN して税率を取得） */
export async function fetchTaxCategories(): Promise<TaxCategoryRef[]> {
  console.log(`[fetchTaxCategories] 税区分マスタを取得中（tax_rates JOIN）...`);

  const { data, error, status } = await supabaseAdmin
    .from('tax_categories')
    .select('id, code, name, tax_rate:tax_rates!current_tax_rate_id(rate)')
    .eq('is_active', true)
    .order('code', { ascending: true });

  if (error) {
    // FK名が違う場合のフォールバック: tax_rates を JOIN せずに取得
    console.warn(`[fetchTaxCategories] ⚠️ JOIN エラー（FK名不一致の可能性）:`, error.message);
    console.log(`[fetchTaxCategories] フォールバック: tax_rates なしで取得中...`);

    const { data: fallbackData, error: fallbackError } = await supabaseAdmin
      .from('tax_categories')
      .select('id, code, name, current_tax_rate_id')
      .eq('is_active', true)
      .order('code', { ascending: true });

    if (fallbackError) {
      console.error(`[fetchTaxCategories] ❌ フォールバックも失敗:`, fallbackError.message);
      return [];
    }

    // current_tax_rate_id を使って tax_rates を個別取得
    const rateIds = [...new Set((fallbackData || []).map((t: any) => t.current_tax_rate_id).filter(Boolean))];
    let rateMap: Record<string, number> = {};

    if (rateIds.length > 0) {
      const { data: rates } = await supabaseAdmin
        .from('tax_rates')
        .select('id, rate')
        .in('id', rateIds);

      if (rates) {
        rateMap = Object.fromEntries(rates.map((r: any) => [r.id, Number(r.rate)]));
      }
    }

    const categories = (fallbackData || []).map((item: any) => ({
      id: item.id,
      code: item.code || '',
      name: item.name,
      rate: item.current_tax_rate_id ? (rateMap[item.current_tax_rate_id] || 0) : 0,
    }));

    console.log(`[fetchTaxCategories] ✅ ${categories.length}件の税区分を取得（フォールバック）`);
    return categories;
  }

  const categories = (data || []).map((item: any) => ({
    id: item.id,
    code: item.code || '',
    name: item.name,
    rate: Number(item.tax_rate?.rate) || 0,
  }));

  console.log(`[fetchTaxCategories] ✅ ${categories.length}件の税区分を取得`);
  return categories;
}

/** 「雑費」のフォールバック用 UUID を取得する */
export async function findFallbackAccountId(organizationId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('account_items')
    .select('id')
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .eq('name', '雑費')
    .eq('is_active', true)
    .limit(1);

  if (error) {
    console.warn(`[findFallbackAccountId] 「雑費」が見つかりません:`, error.message);
    return '';
  }

  const fallbackId = data?.[0]?.id || '';
  console.log(`[findFallbackAccountId] ✅ 雑費 ID="${fallbackId}"`);
  return fallbackId;
}
