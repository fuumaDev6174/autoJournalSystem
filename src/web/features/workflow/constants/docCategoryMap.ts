/**
 * @module 書類カテゴリマッピング
 * ReviewPage の第2階層サブタブで使用する、document_type_code → カテゴリ の対応表。
 */

export type DocCategory =
  | 'journal_income'
  | 'journal_expense'
  | 'journal_compound'
  | 'journal_asset'
  | 'deduction'
  | 'metadata'
  | 'archive';

export type DocCategoryGroup = 'all' | 'journal' | 'deduction' | 'metadata' | 'archive';

export interface SubCategoryDef {
  key: DocCategory;
  label: string;
}

export interface CategoryTabDef {
  key: DocCategoryGroup;
  label: string;
  subCategories?: SubCategoryDef[];
}

export const DOC_CATEGORY_TABS: CategoryTabDef[] = [
  { key: 'all', label: '全種別' },
  {
    key: 'journal',
    label: '仕訳対象',
    subCategories: [
      { key: 'journal_income', label: '収入系' },
      { key: 'journal_expense', label: '経費系' },
      { key: 'journal_compound', label: '複合仕訳' },
      { key: 'journal_asset', label: '資産・償却' },
    ],
  },
  { key: 'deduction', label: '控除・申告' },
  { key: 'metadata', label: '届出・契約' },
  { key: 'archive', label: '保管' },
];

export const DOC_TYPE_TO_CATEGORY: Record<string, DocCategory> = {
  // ── 収入系 ──
  issued_invoice: 'journal_income',
  payment_record: 'journal_income',
  payment_statement: 'journal_income',
  platform_csv: 'journal_income',
  bank_statement: 'journal_income',
  salary_cert: 'journal_income',
  stock_report: 'journal_income',
  crypto_history: 'journal_income',
  pension_cert: 'journal_income',
  realestate_inc: 'journal_income',
  insurance_mat: 'journal_income',

  // ── 経費系 ──
  receipt: 'journal_expense',
  pdf_invoice: 'journal_expense',
  recv_invoice: 'journal_expense',
  invoice: 'journal_expense',
  credit_card: 'journal_expense',
  e_money_statement: 'journal_expense',
  etc_statement: 'journal_expense',
  expense_report: 'journal_expense',
  inventory: 'journal_expense',
  tax_interim: 'journal_expense',
  payment_notice: 'journal_expense',
  bank_transfer_receipt: 'journal_expense',
  utility_bill: 'journal_expense',
  tax_receipt: 'journal_expense',

  // ── 複合仕訳 ──
  payroll: 'journal_compound',
  sales_report: 'journal_compound',

  // ── 資産・償却 ──
  fixed_asset: 'journal_asset',
  loan_schedule: 'journal_asset',

  // ── 所得控除系 ──
  kokuho: 'deduction',
  nenkin: 'deduction',
  shokibo: 'deduction',
  ideco: 'deduction',
  life_insurance: 'deduction',
  earthquake_ins: 'deduction',
  medical: 'deduction',
  furusato: 'deduction',
  housing_loan: 'deduction',
  deduction_cert: 'deduction',
  other_deduction: 'deduction',
  prev_return: 'deduction',

  // ── メタデータ系 ──
  mynumber: 'metadata',
  kaigyo: 'metadata',
  aoiro: 'metadata',
  senjusha: 'metadata',
  invoice_reg: 'metadata',
  kanizei: 'metadata',
  tanaoroshi_method: 'metadata',
  shoukyaku_method: 'metadata',
  chintai: 'metadata',
  gaichuu: 'metadata',
  fudosan_contract: 'metadata',
  lease: 'metadata',
  shaken: 'metadata',
  id_card: 'metadata',
  contract: 'metadata',
  estimate: 'metadata',
  purchase_order: 'metadata',
  delivery_note: 'metadata',
  insurance_policy: 'metadata',
  registry: 'metadata',
  minutes: 'metadata',

  // ── 保管 ──
  other_ref: 'archive',

  // ── フォールバック ──
  other_journal: 'journal_expense',
};

const CATEGORY_LABELS: Record<DocCategory, string> = {
  journal_income: '収入',
  journal_expense: '経費',
  journal_compound: '複合',
  journal_asset: '資産',
  deduction: '控除',
  metadata: '届出',
  archive: '保管',
};

const CATEGORY_COLORS: Record<DocCategory, string> = {
  journal_income: 'bg-blue-100 text-blue-700',
  journal_expense: 'bg-green-100 text-green-700',
  journal_compound: 'bg-purple-100 text-purple-700',
  journal_asset: 'bg-orange-100 text-orange-700',
  deduction: 'bg-yellow-100 text-yellow-700',
  metadata: 'bg-gray-100 text-gray-700',
  archive: 'bg-gray-50 text-gray-500',
};

export function getCategoryLabel(code: string | undefined | null): string {
  if (!code) return '';
  const cat = DOC_TYPE_TO_CATEGORY[code];
  return cat ? CATEGORY_LABELS[cat] : '';
}

export function getCategoryColor(code: string | undefined | null): string {
  if (!code) return 'bg-gray-100 text-gray-500';
  const cat = DOC_TYPE_TO_CATEGORY[code];
  return cat ? CATEGORY_COLORS[cat] : 'bg-gray-100 text-gray-500';
}

export function matchesCategoryFilter(
  docTypeCode: string | undefined | null,
  groupFilter: DocCategoryGroup,
  subFilter: DocCategory | null,
): boolean {
  if (groupFilter === 'all') return true;
  const cat = docTypeCode ? DOC_TYPE_TO_CATEGORY[docTypeCode] : undefined;
  if (!cat) return false;
  if (subFilter) return cat === subFilter;
  if (groupFilter === 'journal') return cat.startsWith('journal_');
  return cat === groupFilter;
}
