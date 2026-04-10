/**
 * @module バックエンド API クライアント
 */
import { supabase } from '@/adapters/supabase/supabase.client';
import type {
  Client, ClientWithIndustry, AccountItem, AccountCategory, TaxCategory,
  Industry, Rule, Supplier, SupplierAlias, Document,
  JournalEntry, JournalEntryLine, Workflow,
  User, Notification, ClientAccountRatio, ClientTaxCategorySetting,
} from '@/types';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ============================================
// 型定義
// ============================================

/** 品目 */
export interface Item {
  id: string;
  name: string;
  code: string | null;
  default_account_item_id: string | null;
  default_tax_category_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** 品目エイリアス */
export interface ItemAlias {
  id: string;
  item_id: string;
  alias_name: string;
  created_at: string;
}

/** 税率 */
export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

/** クライアント業種 */
export interface ClientIndustry {
  id: string;
  client_id: string;
  industry_id: string;
  created_at: string;
}

/** 仕訳修正カウント */
export interface CorrectionCount {
  count: number;
}

/** 未読通知カウント */
export interface UnreadCount {
  count: number;
}

/** ストレージ署名付き URL */
export interface SignedUrlResponse {
  signedUrl: string;
}

/** 仕訳 + 明細行 (リレーション込み) */
export interface JournalEntryWithLines extends JournalEntry {
  journal_entry_lines?: (JournalEntryLine & {
    account_item?: AccountItem | AccountItem[];
    tax_category?: TaxCategory | TaxCategory[];
  })[];
}

// ============================================
// 認証ヘッダー取得
// ============================================
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

// ============================================
// 共通 fetch ラッパー（認証トークン自動付与）
// ============================================
async function apiFetch<T>(path: string, options?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const authHeaders = await getAuthHeaders();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options?.headers as Record<string, string> || {}),
    };
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
    if (res.status === 204) return { data: null, error: null };
    if (res.status === 401) return { data: null, error: '認証が必要です。再ログインしてください。' };
    // 502/503 等でJSON以外が返る場合に備える
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { data: null, error: `サーバーエラー (HTTP ${res.status})` };
    }
    const body = json as Record<string, unknown>;
    if (!res.ok) return { data: null, error: (body.error as string) || `HTTP ${res.status}` };
    return { data: (body.data ?? body) as T, error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][];
  return entries.length ? '?' + new URLSearchParams(entries).toString() : '';
}

// ─── 顧客 ─────────────────────────────────────────
export const clientsApi = {
  getAll: (params?: { status?: string }) =>
    apiFetch<ClientWithIndustry[]>(`/api/clients${qs({ status: params?.status })}`),
  getById: (id: string) => apiFetch<ClientWithIndustry>(`/api/clients/${id}`),
  create: (data: Partial<Client>) => apiFetch<Client>('/api/clients', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Client>) => apiFetch<Client>(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<null>(`/api/clients/${id}`, { method: 'DELETE' }),
};

// ─── 勘定科目 ──────────────────────────────────────
export const accountItemsApi = {
  getAll: (params?: { industry_id?: string; is_active?: string }) =>
    apiFetch<AccountItem[]>(`/api/account-items${qs({ industry_id: params?.industry_id, is_active: params?.is_active })}`),
  create: (data: Partial<AccountItem>) => apiFetch<AccountItem>('/api/account-items', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<AccountItem>) => apiFetch<AccountItem>(`/api/account-items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<null>(`/api/account-items/${id}`, { method: 'DELETE' }),
};

// ─── 勘定科目カテゴリ ────────────────────────────────
export const accountCategoriesApi = {
  getAll: () => apiFetch<AccountCategory[]>('/api/account-categories'),
};

// ─── 税区分 ────────────────────────────────────────
export const taxCategoriesApi = {
  getAll: () => apiFetch<TaxCategory[]>('/api/tax-categories'),
  create: (data: Partial<TaxCategory>) => apiFetch<TaxCategory>('/api/tax-categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<TaxCategory>) => apiFetch<TaxCategory>(`/api/tax-categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<null>(`/api/tax-categories/${id}`, { method: 'DELETE' }),
};

// ─── 税率 ──────────────────────────────────────────
export const taxRatesApi = {
  getAll: () => apiFetch<TaxRate[]>('/api/tax-rates'),
  create: (data: Partial<TaxRate>) => apiFetch<TaxRate>('/api/tax-rates', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<TaxRate>) => apiFetch<TaxRate>(`/api/tax-rates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<null>(`/api/tax-rates/${id}`, { method: 'DELETE' }),
};

// ─── クライアント税区分設定 ──────────────────────────
export const clientTaxSettingsApi = {
  getByClient: (clientId: string) => apiFetch<ClientTaxCategorySetting[]>(`/api/client-tax-category-settings?client_id=${clientId}`),
  upsert: (data: Partial<ClientTaxCategorySetting>) => apiFetch<ClientTaxCategorySetting>('/api/client-tax-category-settings', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── 業種 ──────────────────────────────────────────
export const industriesApi = {
  getAll: (params?: { is_active?: string }) =>
    apiFetch<Industry[]>(`/api/industries${qs({ is_active: params?.is_active })}`),
  create: (data: Partial<Industry>) => apiFetch<Industry>('/api/industries', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Industry>) => apiFetch<Industry>(`/api/industries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<null>(`/api/industries/${id}`, { method: 'DELETE' }),
};

// ─── クライアント業種 ──────────────────────────────
export const clientIndustriesApi = {
  getAll: (params?: { client_id?: string; industry_id?: string }) =>
    apiFetch<ClientIndustry[]>(`/api/client-industries${qs({ client_id: params?.client_id, industry_id: params?.industry_id })}`),
};

// ─── ルール ────────────────────────────────────────
export const rulesApi = {
  getAll: (params?: { scope?: string; industry_id?: string; client_id?: string; is_active?: string }) =>
    apiFetch<Rule[]>(`/api/rules${qs(params || {})}`),
  create: (data: Partial<Rule>) => apiFetch<Rule>('/api/rules', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Rule>) => apiFetch<Rule>(`/api/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<null>(`/api/rules/${id}`, { method: 'DELETE' }),
};

// ─── 取引先 ────────────────────────────────────────
export const suppliersApi = {
  getAll: (params?: { is_active?: string }) =>
    apiFetch<Supplier[]>(`/api/suppliers${qs({ is_active: params?.is_active })}`),
  create: (data: Partial<Supplier>) => apiFetch<Supplier>('/api/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Supplier>) => apiFetch<Supplier>(`/api/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<null>(`/api/suppliers/${id}`, { method: 'DELETE' }),
  getAllAliases: () => apiFetch<SupplierAlias[]>('/api/supplier-aliases'),
  getAliases: (id: string) => apiFetch<SupplierAlias[]>(`/api/suppliers/${id}/aliases`),
  addAlias: (id: string, data: Partial<SupplierAlias>) => apiFetch<SupplierAlias>(`/api/suppliers/${id}/aliases`, { method: 'POST', body: JSON.stringify(data) }),
  updateAlias: (aliasId: string, data: Partial<SupplierAlias>) => apiFetch<SupplierAlias>(`/api/supplier-aliases/${aliasId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAlias: (aliasId: string) => apiFetch<null>(`/api/supplier-aliases/${aliasId}`, { method: 'DELETE' }),
};

// ─── 品目 ──────────────────────────────────────────
export const itemsApi = {
  getAll: (params?: { is_active?: string }) =>
    apiFetch<Item[]>(`/api/items${qs({ is_active: params?.is_active })}`),
  create: (data: Partial<Item>) => apiFetch<Item>('/api/items', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Item>) => apiFetch<Item>(`/api/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<null>(`/api/items/${id}`, { method: 'DELETE' }),
  getAliases: (id: string) => apiFetch<ItemAlias[]>(`/api/items/${id}/aliases`),
  addAlias: (id: string, data: Partial<ItemAlias>) => apiFetch<ItemAlias>(`/api/items/${id}/aliases`, { method: 'POST', body: JSON.stringify(data) }),
  deleteAlias: (aliasId: string) => apiFetch<null>(`/api/item-aliases/${aliasId}`, { method: 'DELETE' }),
};

// ─── 仕訳 ──────────────────────────────────────────
export const journalEntriesApi = {
  getAll: (params?: { client_id?: string; workflow_id?: string; status?: string; document_id?: string }) =>
    apiFetch<JournalEntryWithLines[]>(`/api/journal-entries${qs(params || {})}`),
  getById: (id: string) => apiFetch<JournalEntryWithLines>(`/api/journal-entries/${id}`),
  create: (data: Record<string, unknown>) => apiFetch<JournalEntryWithLines>('/api/journal-entries', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<JournalEntry>) => apiFetch<JournalEntry>(`/api/journal-entries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<null>(`/api/journal-entries/${id}`, { method: 'DELETE' }),
  updateStatus: (id: string, status: string) =>
    apiFetch<JournalEntry>(`/api/journal-entries/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  bulkUpdateStatus: (ids: string[], status: string) =>
    apiFetch<{ updated: number }>('/api/journal-entries/bulk-status', { method: 'PUT', body: JSON.stringify({ ids, status }) }),
  approve: (id: string, data: Record<string, unknown>) =>
    apiFetch<JournalEntry>(`/api/journal-entries/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }),
  updateLine: (lineId: string, data: Partial<JournalEntryLine>) =>
    apiFetch<JournalEntryLine>(`/api/journal-entry-lines/${lineId}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── ワークフロー ──────────────────────────────────
export const workflowsApi = {
  getAll: (params?: { client_id?: string; status?: string }) =>
    apiFetch<Workflow[]>(`/api/workflows${qs(params || {})}`),
  getById: (id: string) => apiFetch<Workflow>(`/api/workflows/${id}`),
  create: (data: Partial<Workflow>) => apiFetch<Workflow>('/api/workflows', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Workflow>) => apiFetch<Workflow>(`/api/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  complete: (id: string, completedBy: string) =>
    apiFetch<Workflow>(`/api/workflows/${id}/complete`, { method: 'PUT', body: JSON.stringify({ completed_by: completedBy }) }),
  cancel: (id: string) => apiFetch<Workflow>(`/api/workflows/${id}/cancel`, { method: 'PUT' }),
  getByClient: (clientId: string) => apiFetch<Workflow>(`/api/workflows/by-client/${clientId}`),
};

// ─── ユーザー ──────────────────────────────────────
export const usersApi = {
  getAll: () => apiFetch<User[]>('/api/users'),
  getById: (id: string) => apiFetch<User>(`/api/users/${id}`),
  create: (data: Partial<User>) => apiFetch<User>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<User>) => apiFetch<User>(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<null>(`/api/users/${id}`, { method: 'DELETE' }),
};

// ─── 通知 ──────────────────────────────────────────
export const notificationsApi = {
  getAll: (params?: { user_id?: string; limit?: string }) =>
    apiFetch<Notification[]>(`/api/notifications${qs(params || {})}`),
  markRead: (id: string) => apiFetch<Notification>(`/api/notifications/${id}/read`, { method: 'PUT' }),
  markAllRead: (userId: string) =>
    apiFetch<{ updated: number }>('/api/notifications/read-all', { method: 'PUT', body: JSON.stringify({ user_id: userId }) }),
  getUnreadCount: (userId: string) => apiFetch<UnreadCount>(`/api/notifications/unread-count?user_id=${userId}`),
};

// ─── 家事按分 ──────────────────────────────────────
export const clientAccountRatiosApi = {
  getByClient: (clientId: string) => apiFetch<ClientAccountRatio[]>(`/api/client-account-ratios?client_id=${clientId}`),
  upsert: (data: Partial<ClientAccountRatio>) => apiFetch<ClientAccountRatio>('/api/client-account-ratios', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<null>(`/api/client-account-ratios/${id}`, { method: 'DELETE' }),
};

// ─── 対象外仕訳 ────────────────────────────────────
export const excludedEntriesApi = {
  getByClient: (clientId: string) => apiFetch<JournalEntryWithLines[]>(`/api/excluded-entries?client_id=${clientId}`),
};

// ─── 仕訳修正履歴 ──────────────────────────────────
export const journalCorrectionsApi = {
  create: (data: Record<string, unknown>) => apiFetch<Record<string, unknown>>('/api/journal-entry-corrections', { method: 'POST', body: JSON.stringify(data) }),
  count: (params: { client_id: string; field_name: string; corrected_value: string; rule_suggested?: string }) =>
    apiFetch<CorrectionCount>(`/api/journal-entry-corrections/count${qs(params)}`),
  markSuggested: (data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/api/journal-entry-corrections/mark-suggested', { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── ドキュメント ──────────────────────────────────
export const documentsApi = {
  getAll: (params?: { client_id?: string; workflow_id?: string; status?: string }) =>
    apiFetch<Document[]>(`/api/documents${qs(params || {})}`),
  getById: (id: string) => apiFetch<Document>(`/api/documents/${id}`),
  create: (data: Partial<Document>) => apiFetch<Document>('/api/documents', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Document>) => apiFetch<Document>(`/api/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<null>(`/api/documents/${id}`, { method: 'DELETE' }),
};

// ─── OCR処理 ──────────────────────────────────────
export const ocrApi = {
  process: (data: { document_id: string; file_url: string; file_path: string }) =>
    apiFetch<Record<string, unknown>>('/api/ocr/process', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── 仕訳生成 ─────────────────────────────────────
export const journalGenerateApi = {
  generate: (data: { document_id: string; client_id: string; ocr_result: Record<string, unknown>; industry?: string }) =>
    apiFetch<JournalEntryWithLines>('/api/journal-entries/generate', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── エクスポート履歴 ──────────────────────────────
export const exportsApi = {
  getByClient: (clientId: string) => apiFetch<Record<string, unknown>[]>(`/api/exports?client_id=${clientId}`),
};

// ─── ストレージ ────────────────────────────────────
export const storageApi = {
  upload: async (storagePath: string, file: File): Promise<{ data: Record<string, unknown> | null; error: string | null }> => {
    try {
      const authHeaders = await getAuthHeaders();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', storagePath);
      const res = await fetch(`${API_BASE}/api/storage/upload`, {
        method: 'POST',
        headers: { ...authHeaders },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.success) return { data: null, error: json.error || `HTTP ${res.status}` };
      return { data: json.data, error: null };
    } catch (e: unknown) {
      return { data: null, error: e instanceof Error ? e.message : String(e) };
    }
  },
  getSignedUrl: (path: string) => apiFetch<SignedUrlResponse>(`/api/storage/signed-url?path=${encodeURIComponent(path)}`),
  delete: (path: string) => apiFetch<null>(`/api/storage/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
};
