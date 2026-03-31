/**
 * ルールの conditions が入力にマッチするか判定。
 * 全ての指定条件がANDで一致する必要がある。
 * 条件が1つもないルールはマッチしない。
 */

export interface ConditionSet {
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
}

export interface MatchInput {
  supplier: string;
  amount: number;
  description?: string;
  item_name?: string | null;
  payment_method?: string | null;
  document_type?: string | null;
  has_invoice_number?: boolean | null;
  tax_rate_hint?: number | null;
  is_internal_tax?: boolean | null;
  frequency_hint?: string | null;
  tategaki?: string | null;
  invoice_qualification?: string | null;
  addressee?: string | null;
  transaction_type?: string | null;
  transfer_fee_bearer?: string | null;
}

export function evaluateConditions(conditions: ConditionSet, input: MatchInput): boolean {
  let hasAnyCondition = false;

  // 取引先パターン（部分一致、大文字小文字無視）
  if (conditions.supplier_pattern) {
    hasAnyCondition = true;
    const pattern = conditions.supplier_pattern.toLowerCase();
    const supplier = input.supplier.toLowerCase();
    if (!supplier.includes(pattern)) return false;
  }

  // 摘要パターン（部分一致）
  if (conditions.transaction_pattern) {
    hasAnyCondition = true;
    const pattern = conditions.transaction_pattern.toLowerCase();
    const desc = (input.description || '').toLowerCase();
    const supplier = input.supplier.toLowerCase();
    if (!desc.includes(pattern) && !supplier.includes(pattern)) return false;
  }

  // 金額範囲
  if (conditions.amount_min != null) {
    hasAnyCondition = true;
    if (input.amount < conditions.amount_min) return false;
  }
  if (conditions.amount_max != null) {
    hasAnyCondition = true;
    if (input.amount > conditions.amount_max) return false;
  }

  // 品目パターン（部分一致）
  if (conditions.item_pattern) {
    hasAnyCondition = true;
    const pattern = conditions.item_pattern.toLowerCase();
    const itemName = (input.item_name || '').toLowerCase();
    if (!itemName.includes(pattern)) return false;
  }

  // 支払方法（完全一致）
  if (conditions.payment_method) {
    hasAnyCondition = true;
    if (input.payment_method !== conditions.payment_method) return false;
  }

  // 証憑種別（完全一致）
  if (conditions.document_type) {
    hasAnyCondition = true;
    if (input.document_type !== conditions.document_type) return false;
  }

  // インボイス番号有無
  if (conditions.has_invoice_number != null) {
    hasAnyCondition = true;
    if (input.has_invoice_number !== conditions.has_invoice_number) return false;
  }

  // OCR読取税率（許容誤差0.001）
  if (conditions.tax_rate_hint != null) {
    hasAnyCondition = true;
    if (input.tax_rate_hint == null) return false;
    if (Math.abs(input.tax_rate_hint - conditions.tax_rate_hint) > 0.001) return false;
  }

  // 内税/外税
  if (conditions.is_internal_tax != null) {
    hasAnyCondition = true;
    if (input.is_internal_tax !== conditions.is_internal_tax) return false;
  }

  // 取引頻度
  if (conditions.frequency_hint) {
    hasAnyCondition = true;
    if (input.frequency_hint !== conditions.frequency_hint) return false;
  }

  // 但書きパターン（部分一致、大文字小文字無視）
  if (conditions.tategaki_pattern) {
    hasAnyCondition = true;
    const pattern = conditions.tategaki_pattern.toLowerCase();
    const tategaki = (input.tategaki || '').toLowerCase();
    if (!tategaki.includes(pattern)) return false;
  }

  // 適格/非適格区分（完全一致）
  if (conditions.invoice_qualification) {
    hasAnyCondition = true;
    if (input.invoice_qualification !== conditions.invoice_qualification) return false;
  }

  // 宛名パターン（部分一致、大文字小文字無視）
  if (conditions.addressee_pattern) {
    hasAnyCondition = true;
    const pattern = conditions.addressee_pattern.toLowerCase();
    const addressee = (input.addressee || '').toLowerCase();
    if (!addressee.includes(pattern)) return false;
  }

  // 取引種類（完全一致）
  if (conditions.transaction_type) {
    hasAnyCondition = true;
    if (input.transaction_type !== conditions.transaction_type) return false;
  }

  // 振込手数料負担（完全一致）
  if (conditions.transfer_fee_bearer) {
    hasAnyCondition = true;
    if (input.transfer_fee_bearer !== conditions.transfer_fee_bearer) return false;
  }

  // 条件が一つもない場合はマッチしない（全一致防止）
  if (!hasAnyCondition) return false;

  return true;
}
