import { supabase } from './supabase';
import type {
  Client,
  Industry,
  AccountItem,
  TaxCategory,
  Rule,
  Document,
  JournalEntry,
  JournalEntryLine,
  User,
  Supplier,
  SupplierAlias,
  ClientAccountRatio,
  ClientTaxCategorySetting,
  Workflow,
  ApiResponse,
} from '@/types';

// ============================================
// 汎用APIヘルパー
// ============================================

async function handleResponse<T>(promise: any): Promise<ApiResponse<T>> {
  try {
    const { data, error } = await promise;
    if (error) {
      return { data: null, error: error.message, status: 400 };
    }
    return { data, error: null, status: 200 };
  } catch (error: any) {
    return { data: null, error: error.message, status: 500 };
  }
}

// ============================================
// 顧客API
// ④ getAll を name 昇順に変更
// ============================================

export const clientsApi = {
  getAll: () => handleResponse<Client[]>(
    supabase.from('clients').select('*, industry:industries(*)').order('name', { ascending: true })
  ),

  getById: (id: string) => handleResponse<Client>(
    supabase.from('clients').select('*, industry:industries(*)').eq('id', id).single()
  ),

  create: (data: Partial<Client>) => handleResponse<Client>(
    supabase.from('clients').insert(data).select().single()
  ),

  update: (id: string, data: Partial<Client>) => handleResponse<Client>(
    supabase.from('clients').update(data).eq('id', id).select().single()
  ),

  delete: (id: string) => handleResponse<void>(
    supabase.from('clients').delete().eq('id', id)
  ),
};

// ============================================
// 業種API
// ============================================

export const industriesApi = {
  getAll: () => handleResponse<Industry[]>(
    supabase.from('industries').select('*').order('sort_order', { ascending: true })
  ),

  getById: (id: string) => handleResponse<Industry>(
    supabase.from('industries').select('*').eq('id', id).single()
  ),

  create: (data: Partial<Industry>) => handleResponse<Industry>(
    supabase.from('industries').insert(data).select().single()
  ),

  update: (id: string, data: Partial<Industry>) => handleResponse<Industry>(
    supabase.from('industries').update(data).eq('id', id).select().single()
  ),

  delete: (id: string) => handleResponse<void>(
    supabase.from('industries').delete().eq('id', id)
  ),
};

// ============================================
// 勘定科目API
// ============================================

export const accountItemsApi = {
  getAll: () => handleResponse<AccountItem[]>(
    supabase.from('account_items').select('*').order('code', { ascending: true })
  ),

  getById: (id: string) => handleResponse<AccountItem>(
    supabase.from('account_items').select('*').eq('id', id).single()
  ),

  create: (data: Partial<AccountItem>) => handleResponse<AccountItem>(
    supabase.from('account_items').insert(data).select().single()
  ),

  update: (id: string, data: Partial<AccountItem>) => handleResponse<AccountItem>(
    supabase.from('account_items').update(data).eq('id', id).select().single()
  ),

  delete: (id: string) => handleResponse<void>(
    supabase.from('account_items').delete().eq('id', id)
  ),
};

// ============================================
// 税区分API
// ============================================

export const taxCategoriesApi = {
  getAll: () => handleResponse<TaxCategory[]>(
    supabase.from('tax_categories').select('*').order('sort_order', { ascending: true })
  ),

  getById: (id: string) => handleResponse<TaxCategory>(
    supabase.from('tax_categories').select('*').eq('id', id).single()
  ),

  create: (data: Partial<TaxCategory>) => handleResponse<TaxCategory>(
    supabase.from('tax_categories').insert(data).select().single()
  ),

  update: (id: string, data: Partial<TaxCategory>) => handleResponse<TaxCategory>(
    supabase.from('tax_categories').update(data).eq('id', id).select().single()
  ),

  delete: (id: string) => handleResponse<void>(
    supabase.from('tax_categories').delete().eq('id', id)
  ),
};

// ============================================
// ルールAPI  ※DBテーブル名は processing_rules
// ============================================

export const rulesApi = {
  getAll: () => handleResponse<Rule[]>(
    supabase
      .from('processing_rules')
      .select('*, industry:industries(*), client:clients(*)')
      .order('priority', { ascending: true })
  ),

  getById: (id: string) => handleResponse<Rule>(
    supabase
      .from('processing_rules')
      .select('*, industry:industries(*), client:clients(*)')
      .eq('id', id)
      .single()
  ),

  create: (data: Partial<Rule>) => handleResponse<Rule>(
    supabase.from('processing_rules').insert(data).select().single()
  ),

  update: (id: string, data: Partial<Rule>) => handleResponse<Rule>(
    supabase.from('processing_rules').update(data).eq('id', id).select().single()
  ),

  delete: (id: string) => handleResponse<void>(
    supabase.from('processing_rules').delete().eq('id', id)
  ),
};

// ============================================
// 証憑API
// ============================================

export const documentsApi = {
  getAll: (clientId?: string) => {
    let query = supabase.from('documents').select('*').order('created_at', { ascending: false });
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    return handleResponse<Document[]>(query);
  },

  getById: (id: string) => handleResponse<Document>(
    supabase.from('documents').select('*').eq('id', id).single()
  ),

  create: (data: Partial<Document>) => handleResponse<Document>(
    supabase.from('documents').insert(data).select().single()
  ),

  update: (id: string, data: Partial<Document>) => handleResponse<Document>(
    supabase.from('documents').update(data).eq('id', id).select().single()
  ),

  delete: (id: string) => handleResponse<void>(
    supabase.from('documents').delete().eq('id', id)
  ),
};

// ============================================
// 仕訳API
// ① 2テーブル構造（journal_entries + journal_entry_lines）対応に再設計
// ============================================

export const journalEntriesApi = {
  // journal_entry_lines を JOIN して取得
  getAll: (clientId?: string, workflowId?: string) => {
    let query = supabase
      .from('journal_entries')
      .select('*, lines:journal_entry_lines(*)')
      .order('entry_date', { ascending: false });
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    if (workflowId) {
      // document_id を経由して workflow に紐づく仕訳を取得する場合は
      // documents テーブルとの JOIN が必要だが、ここでは workflow_id を
      // journal_entries に持たせる設計も検討。現状は clientId でフィルタ。
      query = query.eq('document_id', workflowId); // 暫定: 呼び出し側で適切に使い分ける
    }
    return handleResponse<JournalEntry[]>(query);
  },

  getById: (id: string) => handleResponse<JournalEntry>(
    supabase
      .from('journal_entries')
      .select('*, lines:journal_entry_lines(*)')
      .eq('id', id)
      .single()
  ),

  // ヘッダーと明細行を分けて insert
  create: async (
    header: Partial<JournalEntry>,
    lines: Partial<JournalEntryLine>[]
  ): Promise<ApiResponse<JournalEntry>> => {
    try {
      // 1. ヘッダーを insert
      const { data: entryData, error: entryError } = await supabase
        .from('journal_entries')
        .insert(header)
        .select()
        .single();

      if (entryError) {
        return { data: null, error: entryError.message, status: 400 };
      }

      // 2. 明細行を一括 insert
      if (lines.length > 0) {
        const linesWithEntryId = lines.map((line, index) => ({
          ...line,
          journal_entry_id: entryData.id,
          line_number: line.line_number ?? index + 1,
        }));

        const { error: linesError } = await supabase
          .from('journal_entry_lines')
          .insert(linesWithEntryId);

        if (linesError) {
          return { data: null, error: linesError.message, status: 400 };
        }
      }

      return { data: entryData, error: null, status: 200 };
    } catch (error: any) {
      return { data: null, error: error.message, status: 500 };
    }
  },

  // ヘッダー update + 明細行は全削除→再 insert
  update: async (
    id: string,
    header: Partial<JournalEntry>,
    lines: Partial<JournalEntryLine>[]
  ): Promise<ApiResponse<JournalEntry>> => {
    try {
      // 1. ヘッダーを update
      const { data: entryData, error: entryError } = await supabase
        .from('journal_entries')
        .update(header)
        .eq('id', id)
        .select()
        .single();

      if (entryError) {
        return { data: null, error: entryError.message, status: 400 };
      }

      // 2. 既存の明細行を全削除
      const { error: deleteError } = await supabase
        .from('journal_entry_lines')
        .delete()
        .eq('journal_entry_id', id);

      if (deleteError) {
        return { data: null, error: deleteError.message, status: 400 };
      }

      // 3. 新しい明細行を一括 insert
      if (lines.length > 0) {
        const linesWithEntryId = lines.map((line, index) => ({
          ...line,
          journal_entry_id: id,
          line_number: line.line_number ?? index + 1,
        }));

        const { error: linesError } = await supabase
          .from('journal_entry_lines')
          .insert(linesWithEntryId);

        if (linesError) {
          return { data: null, error: linesError.message, status: 400 };
        }
      }

      return { data: entryData, error: null, status: 200 };
    } catch (error: any) {
      return { data: null, error: error.message, status: 500 };
    }
  },

  // journal_entries を delete（CASCADE で lines も削除）
  delete: (id: string) => handleResponse<void>(
    supabase.from('journal_entries').delete().eq('id', id)
  ),
};

// ============================================
// 取引先API（新規追加）
// ============================================

export const suppliersApi = {
  getAll: () => handleResponse<Supplier[]>(
    supabase.from('suppliers').select('*').order('name', { ascending: true })
  ),

  getById: (id: string) => handleResponse<Supplier>(
    supabase.from('suppliers').select('*').eq('id', id).single()
  ),

  create: (data: Partial<Supplier>) => handleResponse<Supplier>(
    supabase.from('suppliers').insert(data).select().single()
  ),

  update: (id: string, data: Partial<Supplier>) => handleResponse<Supplier>(
    supabase.from('suppliers').update(data).eq('id', id).select().single()
  ),

  delete: (id: string) => handleResponse<void>(
    supabase.from('suppliers').delete().eq('id', id)
  ),

  getAliases: (supplierId: string) => handleResponse<SupplierAlias[]>(
    supabase
      .from('supplier_aliases')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
  ),

  addAlias: (
    supplierId: string,
    aliasName: string,
    source: SupplierAlias['source'] = 'manual'
  ) => handleResponse<SupplierAlias>(
    supabase
      .from('supplier_aliases')
      .insert({ supplier_id: supplierId, alias_name: aliasName, source })
      .select()
      .single()
  ),

  deleteAlias: (aliasId: string) => handleResponse<void>(
    supabase.from('supplier_aliases').delete().eq('id', aliasId)
  ),
};

// ============================================
// 家事按分率API（新規追加）
// ============================================

export const clientAccountRatiosApi = {
  getByClient: (clientId: string) => handleResponse<ClientAccountRatio[]>(
    supabase
      .from('client_account_ratios')
      .select('*')
      .eq('client_id', clientId)
      .order('valid_from', { ascending: false })
  ),

  // 同じ client_id + account_item_id + valid_from の組み合わせは上書き（upsert）
  upsert: (
    clientId: string,
    accountItemId: string,
    ratio: number,
    validFrom: string,
    validUntil: string | null = null,
    notes: string | null = null
  ) => handleResponse<ClientAccountRatio>(
    supabase
      .from('client_account_ratios')
      .upsert(
        {
          client_id: clientId,
          account_item_id: accountItemId,
          business_ratio: ratio,
          valid_from: validFrom,
          valid_until: validUntil,
          notes,
        },
        { onConflict: 'client_id,account_item_id,valid_from' }
      )
      .select()
      .single()
  ),

  delete: (id: string) => handleResponse<void>(
    supabase.from('client_account_ratios').delete().eq('id', id)
  ),
};

// ============================================
// 税区分顧客別設定API（新規追加）
// ============================================

export const clientTaxCategorySettingsApi = {
  getByClient: (clientId: string) => handleResponse<ClientTaxCategorySetting[]>(
    supabase
      .from('client_tax_category_settings')
      .select('*')
      .eq('client_id', clientId)
  ),

  upsert: (
    clientId: string,
    taxCategoryId: string,
    settings: {
      use_as_default?: boolean;
      use_for_income?: boolean;
      use_for_expense?: boolean;
    }
  ) => handleResponse<ClientTaxCategorySetting>(
    supabase
      .from('client_tax_category_settings')
      .upsert(
        {
          client_id: clientId,
          tax_category_id: taxCategoryId,
          ...settings,
        },
        { onConflict: 'client_id,tax_category_id' }
      )
      .select()
      .single()
  ),

  resetToDefault: (clientId: string) => handleResponse<void>(
    supabase
      .from('client_tax_category_settings')
      .delete()
      .eq('client_id', clientId)
  ),
};

// ============================================
// ワークフローAPI（新規追加）
// ============================================

export const workflowsApi = {
  getByClient: (clientId: string) => handleResponse<Workflow[]>(
    supabase
      .from('workflows')
      .select('*')
      .eq('client_id', clientId)
      .order('started_at', { ascending: false })
  ),

  getById: (id: string) => handleResponse<Workflow>(
    supabase.from('workflows').select('*').eq('id', id).single()
  ),

  create: (clientId: string, startedBy: string) => handleResponse<Workflow>(
    supabase
      .from('workflows')
      .insert({
        client_id: clientId,
        started_by: startedBy,
        current_step: 1,
        completed_steps: [],
        status: 'in_progress',
        data: {
          uploaded_document_ids: [],
          ocr_completed_ids: [],
          ocr_pending_ids: [],
          aicheck_status: 'pending',
          review_completed_at: null,
        },
      })
      .select()
      .single()
  ),

  update: (id: string, data: Partial<Workflow>) => handleResponse<Workflow>(
    supabase.from('workflows').update(data).eq('id', id).select().single()
  ),

  complete: (id: string) => handleResponse<Workflow>(
    supabase
      .from('workflows')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
  ),

  cancel: (id: string) => handleResponse<Workflow>(
    supabase
      .from('workflows')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single()
  ),
};

// ============================================
// ユーザーAPI
// ============================================

export const usersApi = {
  getAll: () => handleResponse<User[]>(
    supabase.from('users').select('*').order('created_at', { ascending: false })
  ),

  getById: (id: string) => handleResponse<User>(
    supabase.from('users').select('*').eq('id', id).single()
  ),

  create: (data: Partial<User>) => handleResponse<User>(
    supabase.from('users').insert(data).select().single()
  ),

  update: (id: string, data: Partial<User>) => handleResponse<User>(
    supabase.from('users').update(data).eq('id', id).select().single()
  ),

  // ⚠️ Supabase Auth との連携は未実装。Auth側の削除は別途管理者が対応。
  delete: (id: string) => handleResponse<void>(
    supabase.from('users').delete().eq('id', id)
  ),
};