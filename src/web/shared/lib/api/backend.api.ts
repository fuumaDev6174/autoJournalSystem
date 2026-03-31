const API_BASE = import.meta.env.VITE_API_URL || '';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    });
    if (res.status === 204) return { data: null, error: null };
    const json = await res.json();
    if (!res.ok) return { data: null, error: json.error || `HTTP ${res.status}` };
    return { data: json.data ?? json, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][];
  return entries.length ? '?' + new URLSearchParams(entries).toString() : '';
}

// ─── 顧客 ─────────────────────────────────────────
export const clientsApi = {
  getAll: (params?: { status?: string }) =>
    apiFetch<any[]>(`/api/clients${qs({ status: params?.status })}`),
  getById: (id: string) => apiFetch<any>(`/api/clients/${id}`),
  create: (data: any) => apiFetch<any>('/api/clients', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<any>(`/api/clients/${id}`, { method: 'DELETE' }),
};

// ─── 勘定科目 ──────────────────────────────────────
export const accountItemsApi = {
  getAll: (params?: { industry_id?: string; is_active?: string }) =>
    apiFetch<any[]>(`/api/account-items${qs({ industry_id: params?.industry_id, is_active: params?.is_active })}`),
  create: (data: any) => apiFetch<any>('/api/account-items', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/api/account-items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<any>(`/api/account-items/${id}`, { method: 'DELETE' }),
};

// ─── 勘定科目カテゴリ ────────────────────────────────
export const accountCategoriesApi = {
  getAll: () => apiFetch<any[]>('/api/account-categories'),
};

// ─── 税区分 ────────────────────────────────────────
export const taxCategoriesApi = {
  getAll: () => apiFetch<any[]>('/api/tax-categories'),
  create: (data: any) => apiFetch<any>('/api/tax-categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/api/tax-categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<any>(`/api/tax-categories/${id}`, { method: 'DELETE' }),
};

// ─── 税率 ──────────────────────────────────────────
export const taxRatesApi = {
  getAll: () => apiFetch<any[]>('/api/tax-rates'),
  create: (data: any) => apiFetch<any>('/api/tax-rates', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/api/tax-rates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<any>(`/api/tax-rates/${id}`, { method: 'DELETE' }),
};

// ─── クライアント税区分設定 ──────────────────────────
export const clientTaxSettingsApi = {
  getByClient: (clientId: string) => apiFetch<any[]>(`/api/client-tax-category-settings?client_id=${clientId}`),
  upsert: (data: any) => apiFetch<any>('/api/client-tax-category-settings', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── 業種 ──────────────────────────────────────────
export const industriesApi = {
  getAll: (params?: { is_active?: string }) =>
    apiFetch<any[]>(`/api/industries${qs({ is_active: params?.is_active })}`),
  create: (data: any) => apiFetch<any>('/api/industries', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/api/industries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<any>(`/api/industries/${id}`, { method: 'DELETE' }),
};

// ─── クライアント業種 ──────────────────────────────
export const clientIndustriesApi = {
  getAll: (params?: { client_id?: string; industry_id?: string }) =>
    apiFetch<any[]>(`/api/client-industries${qs({ client_id: params?.client_id, industry_id: params?.industry_id })}`),
};

// ─── ルール ────────────────────────────────────────
export const rulesApi = {
  getAll: (params?: { scope?: string; industry_id?: string; client_id?: string; is_active?: string }) =>
    apiFetch<any[]>(`/api/rules${qs(params || {})}`),
  create: (data: any) => apiFetch<any>('/api/rules', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/api/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<any>(`/api/rules/${id}`, { method: 'DELETE' }),
};

// ─── 取引先 ────────────────────────────────────────
export const suppliersApi = {
  getAll: (params?: { is_active?: string }) =>
    apiFetch<any[]>(`/api/suppliers${qs({ is_active: params?.is_active })}`),
  create: (data: any) => apiFetch<any>('/api/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/api/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<any>(`/api/suppliers/${id}`, { method: 'DELETE' }),
  getAllAliases: () => apiFetch<any[]>('/api/supplier-aliases'),
  getAliases: (id: string) => apiFetch<any[]>(`/api/suppliers/${id}/aliases`),
  addAlias: (id: string, data: any) => apiFetch<any>(`/api/suppliers/${id}/aliases`, { method: 'POST', body: JSON.stringify(data) }),
  updateAlias: (aliasId: string, data: any) => apiFetch<any>(`/api/supplier-aliases/${aliasId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAlias: (aliasId: string) => apiFetch<any>(`/api/supplier-aliases/${aliasId}`, { method: 'DELETE' }),
};

// ─── 品目 ──────────────────────────────────────────
export const itemsApi = {
  getAll: (params?: { is_active?: string }) =>
    apiFetch<any[]>(`/api/items${qs({ is_active: params?.is_active })}`),
  create: (data: any) => apiFetch<any>('/api/items', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/api/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<any>(`/api/items/${id}`, { method: 'DELETE' }),
  getAliases: (id: string) => apiFetch<any[]>(`/api/items/${id}/aliases`),
  addAlias: (id: string, data: any) => apiFetch<any>(`/api/items/${id}/aliases`, { method: 'POST', body: JSON.stringify(data) }),
  deleteAlias: (aliasId: string) => apiFetch<any>(`/api/item-aliases/${aliasId}`, { method: 'DELETE' }),
};

// ─── 仕訳 ──────────────────────────────────────────
export const journalEntriesApi = {
  getAll: (params?: { client_id?: string; workflow_id?: string; status?: string; document_id?: string }) =>
    apiFetch<any[]>(`/api/journal-entries${qs(params || {})}`),
  getById: (id: string) => apiFetch<any>(`/api/journal-entries/${id}`),
  create: (data: any) => apiFetch<any>('/api/journal-entries', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/api/journal-entries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<any>(`/api/journal-entries/${id}`, { method: 'DELETE' }),
  updateStatus: (id: string, status: string) =>
    apiFetch<any>(`/api/journal-entries/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  bulkUpdateStatus: (ids: string[], status: string) =>
    apiFetch<any>('/api/journal-entries/bulk-status', { method: 'PUT', body: JSON.stringify({ ids, status }) }),
  approve: (id: string, data: any) =>
    apiFetch<any>(`/api/journal-entries/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }),
  updateLine: (lineId: string, data: any) =>
    apiFetch<any>(`/api/journal-entry-lines/${lineId}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── ワークフロー ──────────────────────────────────
export const workflowsApi = {
  getAll: (params?: { client_id?: string; status?: string }) =>
    apiFetch<any[]>(`/api/workflows${qs(params || {})}`),
  create: (data: any) => apiFetch<any>('/api/workflows', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/api/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  complete: (id: string, completedBy: string) =>
    apiFetch<any>(`/api/workflows/${id}/complete`, { method: 'PUT', body: JSON.stringify({ completed_by: completedBy }) }),
  cancel: (id: string) => apiFetch<any>(`/api/workflows/${id}/cancel`, { method: 'PUT' }),
};

// ─── ユーザー ──────────────────────────────────────
export const usersApi = {
  getAll: () => apiFetch<any[]>('/api/users'),
  getById: (id: string) => apiFetch<any>(`/api/users/${id}`),
  create: (data: any) => apiFetch<any>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<any>(`/api/users/${id}`, { method: 'DELETE' }),
};

// ─── 通知 ──────────────────────────────────────────
export const notificationsApi = {
  getAll: (params?: { user_id?: string; limit?: string }) =>
    apiFetch<any[]>(`/api/notifications${qs(params || {})}`),
  markRead: (id: string) => apiFetch<any>(`/api/notifications/${id}/read`, { method: 'PUT' }),
  markAllRead: (userId: string) =>
    apiFetch<any>('/api/notifications/read-all', { method: 'PUT', body: JSON.stringify({ user_id: userId }) }),
  getUnreadCount: (userId: string) => apiFetch<{ count: number }>(`/api/notifications/unread-count?user_id=${userId}`),
};

// ─── 家事按分 ──────────────────────────────────────
export const clientAccountRatiosApi = {
  getByClient: (clientId: string) => apiFetch<any[]>(`/api/client-account-ratios?client_id=${clientId}`),
  upsert: (data: any) => apiFetch<any>('/api/client-account-ratios', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<any>(`/api/client-account-ratios/${id}`, { method: 'DELETE' }),
};

// ─── 対象外仕訳 ────────────────────────────────────
export const excludedEntriesApi = {
  getByClient: (clientId: string) => apiFetch<any[]>(`/api/excluded-entries?client_id=${clientId}`),
};

// ─── 仕訳修正履歴 ──────────────────────────────────
export const journalCorrectionsApi = {
  create: (data: any) => apiFetch<any>('/api/journal-entry-corrections', { method: 'POST', body: JSON.stringify(data) }),
  count: (params: { client_id: string; field_name: string; corrected_value: string; rule_suggested?: string }) =>
    apiFetch<{ count: number }>(`/api/journal-entry-corrections/count${qs(params)}`),
  markSuggested: (data: any) =>
    apiFetch<any>('/api/journal-entry-corrections/mark-suggested', { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── ドキュメント ──────────────────────────────────
export const documentsApi = {
  getAll: (params?: { client_id?: string; workflow_id?: string; status?: string }) =>
    apiFetch<any[]>(`/api/documents${qs(params || {})}`),
  getById: (id: string) => apiFetch<any>(`/api/documents/${id}`),
  create: (data: any) => apiFetch<any>('/api/documents', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/api/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<any>(`/api/documents/${id}`, { method: 'DELETE' }),
};

// ─── ストレージ ────────────────────────────────────
export const storageApi = {
  upload: async (storagePath: string, file: File): Promise<{ data: any | null; error: string | null }> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', storagePath);
      const res = await fetch(`${API_BASE}/api/storage/upload`, { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok || !json.success) return { data: null, error: json.error || `HTTP ${res.status}` };
      return { data: json.data, error: null };
    } catch (e: any) {
      return { data: null, error: e.message };
    }
  },
  getSignedUrl: (path: string) => apiFetch<{ signedUrl: string }>(`/api/storage/signed-url?path=${encodeURIComponent(path)}`),
  delete: (path: string) => apiFetch<any>(`/api/storage/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
};
