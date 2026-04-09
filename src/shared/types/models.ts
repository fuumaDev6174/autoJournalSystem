// ============================================
// データベースモデル型定義
// ============================================

export interface Organization {
  id: string;
  name: string;
  code: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'manager' | 'operator' | 'viewer';
  status: 'active' | 'inactive';
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Industry {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccountCategory {
  id: string;
  code: string;
  name: string;
  type: 'bs' | 'pl';
  sort_order: number;
  created_at: string;
}

export interface Client {
  id: string;
  organization_id: string;
  name: string;
  industry_id: string | null;
  annual_sales: number | null;
  tax_category: '原則課税' | '簡易課税' | '免税';
  invoice_registered: boolean;
  use_custom_rules: boolean;
  status: 'active' | 'inactive';
  is_taxable: boolean;
  tax_method: '原則課税' | '簡易課税' | null;
  invoice_number: string | null;
  auto_rule_addition: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccountItem {
  id: string;
  organization_id: string | null;
  client_id: string | null;
  industry_id: string | null;
  category_id: string;
  code: string;
  name: string;
  name_kana: string | null;
  short_name: string | null;
  sub_category: string | null;
  tax_category_id: string | null;
  subject_to_depreciation: boolean;
  fs_category: string | null;
  display_order: number;
  default_contra_account_id: string | null;
  is_default: boolean;
  is_system: boolean;
  is_active: boolean;
  allow_department: boolean;
  allow_tag: boolean;
  freee_account_item_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  account_category?: AccountCategory;
  tax_category?: TaxCategory;
  industry?: Industry;
}

export interface TaxCategory {
  id: string;
  code: string;
  name: string;
  display_name: string | null;
  type: string;
  direction: string;
  current_tax_rate_id: string | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Rule {
  id: string;
  organization_id: string | null;
  client_id: string | null;
  industry_id: string | null;
  rule_name: string;
  priority: number;
  scope: 'shared' | 'industry' | 'client';
  rule_type: '支出' | '収入' | '複合仕訳';
  conditions: {
    supplier_pattern?: string | null;
    transaction_pattern?: string | null;
    amount_min?: number | null;
    amount_max?: number | null;
    item_pattern?: string | null;
    payment_method?: string | null;
    document_type?: string | null;
    has_invoice_number?: boolean | null;
    tax_rate_hint?: number | null;
    is_internal_tax?: boolean | null;
    frequency_hint?: string | null;
    tategaki_pattern?: string | null;
    invoice_qualification?: string | null;
    addressee_pattern?: string | null;
    transaction_type?: string | null;
    transfer_fee_bearer?: string | null;
  };
  actions: {
    account_item_id?: string | null;
    tax_category_id?: string | null;
    description_template?: string | null;
    business_ratio?: number | null;
    business_ratio_note?: string | null;
    entry_type_hint?: string | null;
    requires_manual_review?: boolean | null;
    auto_tags?: string[] | null;
    withholding_tax_handling?: string | null;
  };
  is_active: boolean;
  auto_apply: boolean;
  require_confirmation: boolean;
  match_count: number;
  last_matched_at: string | null;
  created_at: string;
  updated_at: string;
  derived_from_rule_id: string | null;
  industry?: Industry;
  client?: Client;
  derived_from?: Rule;
}

export interface Document {
  id: string;
  organization_id: string | null;
  client_id: string;
  workflow_id: string | null;
  document_type_id: string | null;
  document_number: string | null;
  document_date: string;
  file_name: string;
  original_file_name: string | null;
  file_path: string;
  storage_path: string | null;
  file_size: number | null;
  file_type: string | null;
  page_count: number | null;
  ocr_status: 'pending' | 'processing' | 'completed' | 'error' | 'skipped';
  ocr_confidence: number | null;
  supplier_name: string | null;
  supplier_id: string | null;
  amount: number | null;
  tax_amount: number | null;
  status: 'uploaded' | 'ocr_processing' | 'ocr_completed' | 'ai_processing' | 'reviewed' | 'approved' | 'exported' | 'excluded';
  is_business: boolean;
  is_processed: boolean;
  tags: string[] | null;
  notes: string | null;
  timestamp_token: string | null;
  hash_value: string | null;
  uploaded_by: string | null;
  upload_date?: string;
  ocr_completed_at?: string | null;
  is_excluded?: boolean;
  exclusion_reason?: string | null;

  // OCR 分類・処理段階（ocr.route.ts で書き込まれる）
  doc_classification?: import('../modules/ocr/ocr.types').ClassificationResult | null;
  ocr_step1_type?: string | null;
  ocr_step1_confidence?: number | null;
  ocr_step?: 'step1' | 'step2' | null;

  created_at: string;
  updated_at: string;
}

// OCRResult は src/modules/ocr/ocr.types.ts に一元管理
// ここでは re-export のみ行う
export type { OCRResult, ClassificationResult, ExtractedLine } from '../modules/ocr/ocr.types';

export interface JournalEntry {
  id: string;
  organization_id: string;
  client_id: string;
  document_id: string | null;
  entry_date: string;
  entry_number: string | null;
  entry_type: 'normal' | 'adjusting' | 'closing' | 'opening' | 'reversal';
  description: string | null;
  supplier_id: string | null;
  status: 'draft' | 'pending' | 'approved' | 'posted' | 'rejected';
  requires_review: boolean;
  ai_generated: boolean;
  ai_confidence: number | null;
  is_excluded: boolean;
  excluded_reason: string | null;
  excluded_by: string | null;
  excluded_at: string | null;
  notes: string | null;
  exported_at: string | null;
  export_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface JournalEntryLine {
  id: string;
  journal_entry_id: string;
  line_number: number;
  debit_credit: 'debit' | 'credit';
  account_item_id: string;
  supplier_id: string | null;
  item_id: string | null;
  amount: number;
  tax_category_id: string | null;
  tax_rate: number | null;
  tax_amount: number | null;
  description: string | null;
}

export interface BatchHistory {
  id: string;
  upload_date: string;
  uploaded_by: string | null;
  total_documents: number;
  completed_entries: number;
  excluded_entries: number;
  pending_entries: number;
  status: 'in_progress' | 'completed';
  progress_percentage: number;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  organization_id: string;
  client_id: string | null;
  code: string | null;
  name: string;
  name_kana: string | null;
  invoice_number: string | null;
  is_invoice_registered: boolean;
  default_account_item_id: string | null;
  default_tax_category_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierAlias {
  id: string;
  supplier_id: string;
  alias_name: string;
  source: 'manual' | 'ai_suggested' | 'imported';
  created_at: string;
}

export interface ClientAccountRatio {
  id: string;
  organization_id: string;
  client_id: string;
  account_item_id: string;
  business_ratio: number;
  valid_from: string;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientTaxCategorySetting {
  id: string;
  organization_id: string;
  client_id: string;
  tax_category_id: string;
  use_as_default: boolean;
  use_for_income: boolean;
  use_for_expense: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkflowData {
  uploaded_document_ids: string[];
  ocr_completed_ids: string[];
  ocr_pending_ids: string[];
  aicheck_status: 'pending' | 'completed';
  review_completed_at: string | null;
}

export interface Workflow {
  id: string;
  organization_id: string;
  client_id: string;
  current_step: number;
  completed_steps: number[];
  status: 'in_progress' | 'completed' | 'cancelled';
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  data: WorkflowData;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  organization_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  link_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface FreeeConnection {
  id: string;
  organization_id: string;
  client_id: string | null;
  freee_company_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  scope: string | null;
  connected_at: string;
  connected_by: string | null;
  last_sync_at: string | null;
  sync_status: 'active' | 'expired' | 'revoked' | 'error';
  created_at: string;
  updated_at: string;
}

// ============================================
// API レスポンス型
// ============================================

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// ============================================
// UI用の拡張型
// ============================================

export interface ClientWithIndustry extends Client {
  industry?: Industry;
}

export interface JournalEntryWithRelations extends JournalEntry {
  lines?: JournalEntryLine[];
  supplier?: Supplier;
  client?: Client;
  document?: Document;
}

export interface RuleWithRelations extends Rule {
  account_item?: AccountItem;
  tax_category?: TaxCategory;
}

// ============================================
// フォーム型
// ============================================

export interface ClientFormData {
  name: string;
  industry_id: string;
  annual_sales: number | null;
  tax_category: '原則課税' | '簡易課税' | '免税';
  invoice_registered: boolean;
  use_custom_rules: boolean;
  is_taxable: boolean;
  tax_method: '原則課税' | '簡易課税' | null;
  invoice_number: string | null;
  auto_rule_addition: boolean;
}

export interface RuleFormData {
  priority: number;
  rule_type: '支出' | '収入' | '複合仕訳';
  industry_id: string | null;
  client_id: string | null;
  supplier_pattern: string | null;
  transaction_pattern: string | null;
  amount_min: number | null;
  amount_max: number | null;
  account_item_id: string;
  tax_category_id: string;
}

export interface JournalEntryFormData {
  entry_date: string;
  description: string | null;
  supplier_id: string | null;
  lines: {
    debit_credit: 'debit' | 'credit';
    account_item_id: string;
    tax_category_id: string | null;
    amount: number;
    tax_amount: number | null;
    description: string | null;
  }[];
}

// ============================================
// アップロード関連
// ============================================

export interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  status: 'uploading' | 'success' | 'error';
  progress: number;
}

// ============================================
// バリデーション結果型
// ============================================

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateDocId: string | null;
  duplicateFileName: string | null;
}

export interface BalanceCheckResult {
  isBalanced: boolean;
  debitTotal: number;
  creditTotal: number;
  difference: number;
}

export interface ReceiptDuplicateResult {
  possibleDuplicates: Array<{ id: string; fileName: string; date: string; amount: number; supplierName: string | null }>;
}

export interface SupplierMatchResult {
  matchedSupplierId: string | null;
  matchedSupplierName: string | null;
  matchType: 'exact' | 'partial' | 'alias' | 'none';
}

// enums.ts からインポートして使用
import type { NotificationType } from './enums';
