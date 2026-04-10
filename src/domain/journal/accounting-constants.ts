/**
 * @module 会計定数
 * @description アプリケーション全体で使用するマジック文字列・コード定数を一元管理する。
 */

/** 明細分割対象の書類種別コード（registry.ts の supportsMultiLine: true と同期） */
export const STATEMENT_EXTRACT_TYPES = [
  'platform_csv', 'bank_statement', 'crypto_history', 'realestate_inc',
  'credit_card', 'e_money_statement', 'etc_statement', 'expense_report',
  'loan_schedule',
  'payroll', 'sales_report',
] as const;

/** 明細分割対象の書類種別ごとのデフォルト決済手段 */
export const STATEMENT_PAYMENT_METHOD: Record<string, string | null> = {
  bank_statement:    'bank_transfer',
  credit_card:       'credit_card',
  e_money_statement: 'e_money',
  etc_statement:     'e_money',
  platform_csv:      'bank_transfer',
  realestate_inc:    'bank_transfer',
  crypto_history:    'other',
  loan_schedule:     'bank_transfer',
  expense_report:    null,
  payroll:           null,
  sales_report:      null,
};

/** 仕訳エントリの有効ステータス */
export const VALID_JOURNAL_STATUSES = ['draft', 'pending', 'approved', 'exported', 'excluded'] as const;

/** freee 税コードマッピング（tax_categories.code → freee の tax_code） */
export const FREEE_TAX_CODE_LOOKUP: Record<string, number> = {
  'TAX_10': 116,
  'TAX_8_REDUCED': 120,
  'TAX_EXEMPT': 0,
  'NON_TAXABLE': 0,
  'NOT_APPLICABLE': 0,
  'TAX_10_PURCHASE': 133,
  'TAX_8_REDUCED_PURCHASE': 137,
};
