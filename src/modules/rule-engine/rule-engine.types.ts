export interface RuleMatchInput {
  supplier: string;
  amount: number;
  description?: string;
  client_id: string;
  industry_ids: string[];
  payment_method?: string | null;
  item_name?: string | null;
  document_type?: string | null;
  has_invoice_number?: boolean | null;
  tax_rate_hint?: number | null;
  is_internal_tax?: boolean | null;
  frequency_hint?: string | null;
  tategaki?: string | null;
  withholding_tax_amount?: number | null;
  invoice_qualification?: string | null;
  addressee?: string | null;
  transaction_type?: string | null;
  transfer_fee_bearer?: string | null;
}

export interface MatchedRule {
  rule_id: string;
  rule_name: string;
  account_item_id: string;
  tax_category_id: string | null;
  description_template: string | null;
  business_ratio: number | null;
  business_ratio_note: string | null;
  entry_type_hint: string | null;
  requires_manual_review: boolean;
  withholding_tax_handling: string | null;
  confidence: number;
}
