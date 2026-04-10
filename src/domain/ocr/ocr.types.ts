/**
 * @module OCR 型定義
 * @description OCR 関連の全型を一元管理。分類結果・抽出データ・明細分割の型を定義。
 */

/** classifyDocument() の戻り値 */
export interface ClassificationResult {
  document_type_code: string;   // VALID_DOC_CODES のいずれか
  confidence: number;           // 0.0〜1.0
  estimated_lines: number;      // 1以上の整数
  description: string;          // 日本語の簡潔な説明
}

/** 1つの取引行（レシート=1行、通帳=複数行） */
export interface OCRTransaction {
  date: string | null;
  supplier: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  tax_details: {
    rate_10_amount: number | null;
    rate_10_tax: number | null;
    rate_8_amount: number | null;
    rate_8_tax: number | null;
    exempt_amount: number | null;
  } | null;
  tax_included: boolean;
  payment_method: string | null;
  invoice_number: string | null;
  reference_number: string | null;
  items: Array<{
    name: string;
    quantity: number | null;
    unit_price: number | null;
    amount: number;
    tax_rate: number | null;
  }>;
  tategaki: string | null;
  withholding_tax_amount: number | null;
  invoice_qualification: 'qualified' | 'kubun_kisai' | null;
  addressee: string | null;
  transaction_type: 'purchase' | 'expense' | 'asset' | 'sales' | 'fee' | 'tax_payment' | null;
  transfer_fee_bearer: 'sender' | 'receiver' | null;
  tax_payment_type: 'income_tax' | 'consumption_tax' | 'resident_tax' | 'property_tax' | 'auto_tax' | 'national_health_insurance' | 'national_pension' | 'business_tax' | 'other_tax' | null;
}

/** processOCR() の戻り値。先頭取引の主要フィールドをフラットに展開している */
export interface OCRResult {
  raw_text: string;
  document_type: string;
  transactions: OCRTransaction[];

  // 先頭取引から展開（後段の仕訳生成で使う）
  extracted_date: string | null;
  extracted_supplier: string | null;
  extracted_amount: number | null;
  extracted_tax_amount: number | null;
  extracted_items: Array<{
    name: string;
    quantity?: number;
    unit_price?: number;
    amount: number;
    tax_rate?: number;
  }> | null;
  extracted_payment_method: string | null;
  extracted_invoice_number: string | null;
  extracted_tategaki: string | null;
  extracted_withholding_tax: number | null;
  extracted_invoice_qualification: string | null;
  extracted_addressee: string | null;
  extracted_transaction_type: string | null;
  extracted_transfer_fee_bearer: string | null;
  extracted_tax_payment_type: string | null;
  confidence_score: number;
}

/** extractMultipleEntries() が返す1取引行 */
export interface ExtractedLine {
  date: string | null;
  description: string;
  amount: number;
  counterparty: string | null;
  is_income: boolean;
  suggested_account_name: string | null;
  tax_rate: number | null;
  confidence: number;
}
