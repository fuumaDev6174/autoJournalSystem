import type { DocTypeConfig } from './types';

export const DOC_TYPE_REGISTRY: Record<string, DocTypeConfig> = {
  // ========== 収入系 ==========
  issued_invoice:    { code: 'issued_invoice',    layout: 'single', extraSections: ['reconciliation'] },
  payment_record:    { code: 'payment_record',    layout: 'single', extraSections: ['reconciliation', 'withholding'] },
  platform_csv:      { code: 'platform_csv',      layout: 'statement', supportsMultiLine: true },
  bank_statement:    { code: 'bank_statement',    layout: 'statement', supportsMultiLine: true },
  salary_cert:       { code: 'salary_cert',       layout: 'single', extraSections: ['income_calc'] },
  stock_report:      { code: 'stock_report',      layout: 'single', extraSections: ['income_calc'] },
  crypto_history:    { code: 'crypto_history',    layout: 'statement', supportsMultiLine: true },
  pension_cert:      { code: 'pension_cert',      layout: 'single', extraSections: ['income_calc'] },
  realestate_inc:    { code: 'realestate_inc',    layout: 'statement', supportsMultiLine: true },
  insurance_mat:     { code: 'insurance_mat',     layout: 'single', extraSections: ['income_calc'] },

  // ========== 経費系 ==========
  receipt:           { code: 'receipt',           layout: 'single', extraSections: ['receipt_items', 'payment_method'] },
  pdf_invoice:       { code: 'pdf_invoice',       layout: 'single', extraSections: ['invoice_panel'] },
  credit_card:       { code: 'credit_card',       layout: 'statement', supportsMultiLine: true },
  e_money_statement: { code: 'e_money_statement', layout: 'statement', supportsMultiLine: true },
  etc_statement:     { code: 'etc_statement',     layout: 'statement', supportsMultiLine: true },
  expense_report:    { code: 'expense_report',    layout: 'statement', supportsMultiLine: true },
  inventory:         { code: 'inventory',         layout: 'single', extraSections: ['inventory_calc'] },
  recv_invoice:      { code: 'recv_invoice',      layout: 'single', extraSections: ['invoice_panel', 'withholding', 'transfer_fee'] },
  invoice:           { code: 'invoice',           layout: 'single', extraSections: ['invoice_panel', 'withholding', 'transfer_fee'] },
  tax_interim:       { code: 'tax_interim',       layout: 'single' },
  payment_notice:    { code: 'payment_notice',    layout: 'single', extraSections: ['withholding'] },

  // ========== 所得控除・税額控除系 ==========
  kokuho:            { code: 'kokuho',            layout: 'single', extraSections: ['deduction_calc'] },
  nenkin:            { code: 'nenkin',            layout: 'single', extraSections: ['deduction_calc'] },
  shokibo:           { code: 'shokibo',           layout: 'single', extraSections: ['deduction_calc'] },
  ideco:             { code: 'ideco',             layout: 'single', extraSections: ['deduction_calc'] },
  life_insurance:    { code: 'life_insurance',    layout: 'single', extraSections: ['life_ins_calc'] },
  earthquake_ins:    { code: 'earthquake_ins',    layout: 'single', extraSections: ['deduction_calc'] },
  medical:           { code: 'medical',           layout: 'statement', extraSections: ['medical_calc'] },
  furusato:          { code: 'furusato',          layout: 'statement', extraSections: ['furusato_calc'] },
  housing_loan:      { code: 'housing_loan',      layout: 'single', extraSections: ['housing_loan_calc'] },
  deduction_cert:    { code: 'deduction_cert',    layout: 'single', extraSections: ['deduction_calc'] },
  other_deduction:   { code: 'other_deduction',   layout: 'single', extraSections: ['deduction_calc'] },

  // ========== 資産・償却系 ==========
  fixed_asset:       { code: 'fixed_asset',       layout: 'statement', extraSections: ['depreciation'] },
  prev_return:       { code: 'prev_return',       layout: 'single', extraSections: ['carryover'] },
  loan_schedule:     { code: 'loan_schedule',     layout: 'statement', supportsMultiLine: true },

  // ========== 複合仕訳 ==========
  payroll:           { code: 'payroll',           layout: 'compound', supportsMultiLine: true, extraSections: ['payroll_summary'] },
  sales_report:      { code: 'sales_report',      layout: 'compound', supportsMultiLine: true, extraSections: ['sales_breakdown'] },

  // ========== メタデータ抽出 ==========
  mynumber:          { code: 'mynumber',          layout: 'metadata' },
  kaigyo:            { code: 'kaigyo',            layout: 'metadata' },
  aoiro:             { code: 'aoiro',             layout: 'metadata' },
  senjusha:          { code: 'senjusha',          layout: 'metadata' },
  invoice_reg:       { code: 'invoice_reg',       layout: 'metadata' },
  kanizei:           { code: 'kanizei',           layout: 'metadata' },
  tanaoroshi_method: { code: 'tanaoroshi_method', layout: 'metadata' },
  shoukyaku_method:  { code: 'shoukyaku_method',  layout: 'metadata' },
  chintai:           { code: 'chintai',           layout: 'metadata' },
  gaichuu:           { code: 'gaichuu',           layout: 'metadata' },
  fudosan_contract:  { code: 'fudosan_contract',  layout: 'metadata' },
  lease:             { code: 'lease',             layout: 'metadata' },
  shaken:            { code: 'shaken',            layout: 'metadata' },
  id_card:           { code: 'id_card',           layout: 'metadata' },
  contract:          { code: 'contract',          layout: 'metadata' },
  estimate:          { code: 'estimate',          layout: 'metadata' },
  purchase_order:    { code: 'purchase_order',    layout: 'metadata' },
  delivery_note:     { code: 'delivery_note',     layout: 'metadata' },
  insurance_policy:  { code: 'insurance_policy',  layout: 'metadata' },
  registry:          { code: 'registry',          layout: 'metadata' },
  minutes:           { code: 'minutes',           layout: 'metadata' },

  // ========== 保管のみ ==========
  other_ref:         { code: 'other_ref',         layout: 'archive' },

  // ========== フォールバック ==========
  other_journal:     { code: 'other_journal',     layout: 'single' },
};

const FALLBACK_CONFIG: DocTypeConfig = { code: 'other_journal', layout: 'single' };

export function getDocTypeConfig(code?: string | null): DocTypeConfig {
  if (!code) return FALLBACK_CONFIG;
  return DOC_TYPE_REGISTRY[code] || FALLBACK_CONFIG;
}
