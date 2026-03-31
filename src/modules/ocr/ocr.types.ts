/** OCR で抽出する各取引の型 */
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
  transaction_type: 'purchase' | 'expense' | 'asset' | 'sales' | 'fee' | null;
  transfer_fee_bearer: 'sender' | 'receiver' | null;
}

export interface OCRResult {
  raw_text: string;
  document_type: 'receipt' | 'invoice' | 'bank_statement' | 'credit_card' | 'other';
  transactions: OCRTransaction[];
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
  confidence_score: number;
}
