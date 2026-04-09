/**
 * @module ルール条件評価
 * @description ルールの conditions が入力にマッチするか判定する。
 *              全条件を AND で評価し、1つでも不一致なら false。
 *              条件が1つもないルールはマッチしない（全一致防止）。
 */

/** ルールの条件セット */
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

/** 条件評価への入力（OCR 抽出データから構築） */
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

/**
 * 全条件を AND で評価する。パターン系は部分一致（大文字小文字無視）、
 * enum 系は完全一致、数値系は範囲チェック。
 *
 * @param conditions - ルール条件
 * @param input - OCR 抽出データ
 * @returns すべての条件にマッチすれば true
 */
export function evaluateConditions(conditions: ConditionSet, input: MatchInput): boolean {
  let hasAnyCondition = false;

  if (conditions.supplier_pattern) {
    hasAnyCondition = true;
    const pattern = conditions.supplier_pattern.toLowerCase();
    const supplier = input.supplier.toLowerCase();
    if (!supplier.includes(pattern)) return false;
  }

  if (conditions.transaction_pattern) {
    hasAnyCondition = true;
    const pattern = conditions.transaction_pattern.toLowerCase();
    const desc = (input.description || '').toLowerCase();
    const supplier = input.supplier.toLowerCase();
    if (!desc.includes(pattern) && !supplier.includes(pattern)) return false;
  }

  if (conditions.amount_min != null) {
    hasAnyCondition = true;
    if (input.amount < conditions.amount_min) return false;
  }
  if (conditions.amount_max != null) {
    hasAnyCondition = true;
    if (input.amount > conditions.amount_max) return false;
  }

  if (conditions.item_pattern) {
    hasAnyCondition = true;
    const pattern = conditions.item_pattern.toLowerCase();
    const itemName = (input.item_name || '').toLowerCase();
    if (!itemName.includes(pattern)) return false;
  }

  if (conditions.payment_method) {
    hasAnyCondition = true;
    if (input.payment_method !== conditions.payment_method) return false;
  }

  if (conditions.document_type) {
    hasAnyCondition = true;
    if (input.document_type !== conditions.document_type) return false;
  }

  if (conditions.has_invoice_number != null) {
    hasAnyCondition = true;
    if (input.has_invoice_number !== conditions.has_invoice_number) return false;
  }

  if (conditions.tax_rate_hint != null) {
    hasAnyCondition = true;
    if (input.tax_rate_hint == null) return false;
    // 浮動小数点の比較誤差を許容
    if (Math.abs(input.tax_rate_hint - conditions.tax_rate_hint) > 0.001) return false;
  }

  if (conditions.is_internal_tax != null) {
    hasAnyCondition = true;
    if (input.is_internal_tax !== conditions.is_internal_tax) return false;
  }

  if (conditions.frequency_hint) {
    hasAnyCondition = true;
    if (input.frequency_hint !== conditions.frequency_hint) return false;
  }

  if (conditions.tategaki_pattern) {
    hasAnyCondition = true;
    const pattern = conditions.tategaki_pattern.toLowerCase();
    const tategaki = (input.tategaki || '').toLowerCase();
    if (!tategaki.includes(pattern)) return false;
  }

  if (conditions.invoice_qualification) {
    hasAnyCondition = true;
    if (input.invoice_qualification !== conditions.invoice_qualification) return false;
  }

  if (conditions.addressee_pattern) {
    hasAnyCondition = true;
    const pattern = conditions.addressee_pattern.toLowerCase();
    const addressee = (input.addressee || '').toLowerCase();
    if (!addressee.includes(pattern)) return false;
  }

  if (conditions.transaction_type) {
    hasAnyCondition = true;
    if (input.transaction_type !== conditions.transaction_type) return false;
  }

  if (conditions.transfer_fee_bearer) {
    hasAnyCondition = true;
    if (input.transfer_fee_bearer !== conditions.transfer_fee_bearer) return false;
  }

  if (!hasAnyCondition) return false;

  return true;
}
