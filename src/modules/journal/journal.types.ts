import type { OCRTransaction } from '@/modules/ocr/ocr.types';

export interface AccountItemRef {
  id: string;
  code: string;
  name: string;
  category: string;
}

export interface TaxCategoryRef {
  id: string;
  code: string;
  name: string;
  rate: number;
}

export interface JournalEntryInput {
  date: string;
  supplier: string;
  amount: number;
  tax_amount: number | null;
  tax_details: OCRTransaction['tax_details'];
  items: Array<{ name: string; amount: number; tax_rate?: number | null }> | null;
  payment_method: string | null;
  invoice_number: string | null;
  industry?: string;
  account_items: AccountItemRef[];
  tax_categories: TaxCategoryRef[];
  tategaki?: string | null;
  withholding_tax_amount?: number | null;
  invoice_qualification?: string | null;
  transaction_type?: string | null;
  transfer_fee_bearer?: string | null;
  correction_hints?: Array<{ supplier: string; original: string; corrected: string; count: number }>;
}

export interface GeneratedJournalLine {
  line_number: number;
  debit_credit: 'debit' | 'credit';
  account_item_name: string;
  tax_category_name: string | null;
  amount: number;
  tax_rate: number | null;
  tax_amount: number | null;
  description: string;
  supplier_name?: string | null;
  item_name?: string | null;
}

export interface GeneratedJournalEntry {
  category: '事業用' | 'プライベート';
  notes: string;
  confidence: number;
  reasoning: string;
  lines: GeneratedJournalLine[];
}
