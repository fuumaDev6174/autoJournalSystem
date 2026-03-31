import { createClient } from '@supabase/supabase-js';
import type { AccountItemRef, TaxCategoryRef } from '../../server/services/index.js';

// ============================================
// Supabase サーバーサイドクライアント（service_role で RLS バイパス）
// ============================================
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 起動時の環境変数診断ログ
console.log('=== Supabase 環境変数診断 ===');
console.log(`  SUPABASE_URL:              ${supabaseUrl ? '✅ 設定済み' : '❌ 未設定'}`);
console.log(`  VITE_SUPABASE_URL:         ${process.env.VITE_SUPABASE_URL ? '✅ 設定済み' : '（未設定 - フォールバック対象）'}`);
console.log(`  SUPABASE_SERVICE_ROLE_KEY:  ${supabaseServiceKey ? '✅ 設定済み' : '❌ 未設定'}`);
console.log('============================');

if (!supabaseUrl) {
  console.error('⚠️  SUPABASE_URL も VITE_SUPABASE_URL も設定されていません。マスタ取得が全て失敗します。');
}
if (!supabaseServiceKey) {
  console.error('⚠️  SUPABASE_SERVICE_ROLE_KEY が設定されていません。RLS バイパスできず、全クエリが失敗します。');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================
// UUID形式バリデーション
// ============================================
export const isValidUUID = (str: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// ============================================
// 通知作成ヘルパー (Task 5-1)
// ============================================
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

// ============================================
// マスタデータ取得ヘルパー（全てエラーログ付き）
// ============================================

/** client_id → organization_id を解決 */
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

/** 「雑費」のフォールバック用 UUID を取得 */
export async function findFallbackAccountId(organizationId: string): Promise<string> {
  // organization固有 → 共通(null) の順で検索
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
