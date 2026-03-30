// ============================================
// データベース型定義
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
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccountCategory {
  id: string;
  code: string;      // '1'=資産, '2'=負債, '3'=純資産, '4'=収益, '5'=費用
  name: string;      // '資産', '負債', '純資産', '収益', '費用'
  type: 'bs' | 'pl';
  sort_order: number;
  created_at: string;
}

// ① Client 型に新規カラムを追加
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
  // Block 1-A 追加カラム
  is_taxable: boolean;
  tax_method: '原則課税' | '簡易課税' | null;
  invoice_number: string | null;
  auto_rule_addition: boolean;
  created_at: string;
  updated_at: string;
}

// DBの account_items テーブルに完全対応した型
export interface AccountItem {
  id: string;
  organization_id: string | null;
  client_id: string | null;
  industry_id: string | null;

  // 科目カテゴリ（外部キー）
  category_id: string;

  code: string;
  name: string;
  name_kana: string | null;
  short_name: string | null;

  // 分類
  sub_category: string | null;   // '流動資産', '固定資産（有形）' など

  // 税務
  tax_category_id: string | null;
  subject_to_depreciation: boolean;

  // 決算書表示
  fs_category: string | null;
  display_order: number;

  // 相手勘定科目
  default_contra_account_id: string | null;

  // 設定
  is_default: boolean;
  is_system: boolean;
  is_active: boolean;
  allow_department: boolean;
  allow_tag: boolean;

  // freee連携
  freee_account_item_id: string | null;

  description: string | null;
  created_at: string;
  updated_at: string;

  // JOIN結果（select時に取得するリレーション）
  account_category?: AccountCategory;
  tax_category?: TaxCategory;
  industry?: Industry;
}

export interface TaxCategory {
  id: string;
  code: string;
  name: string;
  display_name: string | null;
  type: string;       // '課税' | '非課税' | '不課税' | '免税'
  direction: string;  // '売上' | '仕入' | 'その他'
  current_tax_rate_id: string | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// DBテーブル名: processing_rules
export interface Rule {
  id: string;
  organization_id: string | null;
  client_id: string | null;
  industry_id: string | null;

  rule_name: string;
  priority: number;

  scope: 'shared' | 'industry' | 'client';
  rule_type: '支出' | '収入';

  // 条件（16キー）
  conditions: {
    supplier_pattern?: string | null;       // 取引先名パターン（部分一致）
    transaction_pattern?: string | null;    // 摘要パターン（部分一致）
    amount_min?: number | null;             // 金額下限
    amount_max?: number | null;             // 金額上限
    item_pattern?: string | null;           // 品目パターン（部分一致）
    payment_method?: string | null;         // 支払方法（cash/card/bank_transfer/e_money）
    document_type?: string | null;          // 証憑種別コード（document_types.code）
    has_invoice_number?: boolean | null;    // インボイス番号の有無
    tax_rate_hint?: number | null;          // OCR読取税率（0.10 / 0.08）
    is_internal_tax?: boolean | null;       // 内税(true) / 外税(false)
    frequency_hint?: string | null;         // 取引頻度（'recurring' / 'one_time'）
    // 新規追加5キー
    tategaki_pattern?: string | null;       // 但書きパターン（部分一致）「〇〇代として」
    invoice_qualification?: string | null;  // 適格/非適格（'qualified' / 'kubun_kisai'）
    addressee_pattern?: string | null;      // 宛名パターン（部分一致）
    transaction_type?: string | null;       // 取引種類（'purchase'/'expense'/'asset'/'sales'/'fee'）
    transfer_fee_bearer?: string | null;    // 振込手数料負担（'sender'/'receiver'）
  };

  // アクション（9キー）
  actions: {
    account_item_id?: string | null;        // 勘定科目UUID
    tax_category_id?: string | null;        // 税区分UUID
    description_template?: string | null;   // 摘要テンプレート（{supplier}等のプレースホルダ対応）
    business_ratio?: number | null;         // 家事按分率（0.0〜1.0）
    business_ratio_note?: string | null;    // 按分根拠メモ
    entry_type_hint?: string | null;        // 特殊仕訳フラグ（'normal'/'fixed_asset'/'prepaid'/'reversal'）
    requires_manual_review?: boolean | null; // 強制レビューフラグ
    auto_tags?: string[] | null;            // 自動付与メモID（将来のnotes連携用）
    // 新規追加1キー
    withholding_tax_handling?: string | null; // 源泉徴収処理（'deduct'=差引 / 'separate'=別仕訳 / null=なし）
  };

  is_active: boolean;
  auto_apply: boolean;
  require_confirmation: boolean;

  match_count: number;
  last_matched_at: string | null;

  created_at: string;
  updated_at: string;

  // JOINリレーション（SELECT時）
  industry?: Industry;
  client?: Client;
}

// documents テーブルの完全対応型（既存の詳細定義を維持）
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
  // 旧フィールド（後方互換性のために残す）
  upload_date?: string;
  ocr_completed_at?: string | null;
  is_excluded?: boolean;
  exclusion_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OCRResult {
  id: string;
  document_id: string;
  raw_text: string | null;
  extracted_date: string | null;
  extracted_supplier: string | null;
  extracted_amount: number | null;
  extracted_tax_amount: number | null;
  extracted_items: any | null;
  confidence_score: number | null;
  created_at: string;
}

// ② JournalEntry 型を DB の実構造（journal_entries ヘッダー）に再設計
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

// ② journal_entry_lines（仕訳明細行）型を新規追加
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

// ③ Supplier（取引先）型を新規追加
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

// ③ SupplierAlias（取引先別名）型を新規追加
export interface SupplierAlias {
  id: string;
  supplier_id: string;
  alias_name: string;
  source: 'manual' | 'ai_suggested' | 'imported';
  created_at: string;
}

// ③ ClientAccountRatio（家事按分率）型を新規追加
export interface ClientAccountRatio {
  id: string;
  organization_id: string;
  client_id: string;
  account_item_id: string;
  business_ratio: number;     // 0〜1の数値（例: 0.70）
  valid_from: string;         // date
  valid_until: string | null; // null は無期限
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ③ ClientTaxCategorySetting（税区分の顧客別設定）型を新規追加
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

// ③ Workflow（ワークフロー状態）型を新規追加
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
  current_step: number;         // 1〜8
  completed_steps: number[];
  status: 'in_progress' | 'completed' | 'cancelled';
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  data: WorkflowData;
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

// ⑤ JournalEntryWithRelations を journal_entry_lines 含む構造に更新
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
  rule_type: '支出' | '収入';
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

// 通知型 (Task 5-1)
export type NotificationType = 'upload' | 'approval_needed' | 'approved' | 'rejected' | 'exported' | 'ocr_completed' | 'ocr_error' | 'system';

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

// freee連携型 (Task 5-3)
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

// バリデーション結果型 (Task 5-4)
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