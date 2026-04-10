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

// --- テーブル駆動の条件定義 ---

type ConditionDef =
  | { type: 'pattern'; condKey: keyof ConditionSet; inputKey: keyof MatchInput; altInputKey?: keyof MatchInput }
  | { type: 'exact'; condKey: keyof ConditionSet; inputKey: keyof MatchInput }
  | { type: 'boolean'; condKey: keyof ConditionSet; inputKey: keyof MatchInput }
  | { type: 'range_min'; condKey: keyof ConditionSet; inputKey: keyof MatchInput }
  | { type: 'range_max'; condKey: keyof ConditionSet; inputKey: keyof MatchInput }
  | { type: 'float_eq'; condKey: keyof ConditionSet; inputKey: keyof MatchInput; tolerance: number };

/**
 * 条件テーブル: 新しい条件を追加するにはここに1行追加するだけ。
 * type の意味:
 *   pattern   — 部分一致（大文字小文字無視）。altInputKey があれば OR で代替フィールドも検索
 *   exact     — 文字列完全一致
 *   boolean   — boolean 完全一致
 *   range_min — input >= condition
 *   range_max — input <= condition
 *   float_eq  — 浮動小数点の近似一致（tolerance 以内）
 */
const CONDITIONS: ConditionDef[] = [
  { type: 'pattern',   condKey: 'supplier_pattern',      inputKey: 'supplier' },
  { type: 'pattern',   condKey: 'transaction_pattern',   inputKey: 'description', altInputKey: 'supplier' },
  { type: 'range_min', condKey: 'amount_min',            inputKey: 'amount' },
  { type: 'range_max', condKey: 'amount_max',            inputKey: 'amount' },
  { type: 'pattern',   condKey: 'item_pattern',          inputKey: 'item_name' },
  { type: 'exact',     condKey: 'payment_method',        inputKey: 'payment_method' },
  { type: 'exact',     condKey: 'document_type',         inputKey: 'document_type' },
  { type: 'boolean',   condKey: 'has_invoice_number',    inputKey: 'has_invoice_number' },
  { type: 'float_eq',  condKey: 'tax_rate_hint',         inputKey: 'tax_rate_hint', tolerance: 0.001 },
  { type: 'boolean',   condKey: 'is_internal_tax',       inputKey: 'is_internal_tax' },
  { type: 'exact',     condKey: 'frequency_hint',        inputKey: 'frequency_hint' },
  { type: 'pattern',   condKey: 'tategaki_pattern',      inputKey: 'tategaki' },
  { type: 'exact',     condKey: 'invoice_qualification', inputKey: 'invoice_qualification' },
  { type: 'pattern',   condKey: 'addressee_pattern',     inputKey: 'addressee' },
  { type: 'exact',     condKey: 'transaction_type',      inputKey: 'transaction_type' },
  { type: 'exact',     condKey: 'transfer_fee_bearer',   inputKey: 'transfer_fee_bearer' },
];

/**
 * 全条件を AND で評価する。
 */
export function evaluateConditions(conditions: ConditionSet, input: MatchInput): boolean {
  let hasAnyCondition = false;

  for (const def of CONDITIONS) {
    const condValue = conditions[def.condKey];
    if (condValue == null) continue;

    hasAnyCondition = true;

    switch (def.type) {
      case 'pattern': {
        const pattern = String(condValue).toLowerCase();
        const primary = String(input[def.inputKey] ?? '').toLowerCase();
        const alt = def.altInputKey ? String(input[def.altInputKey] ?? '').toLowerCase() : '';
        if (!primary.includes(pattern) && (!alt || !alt.includes(pattern))) return false;
        break;
      }
      case 'exact': {
        if (input[def.inputKey] !== condValue) return false;
        break;
      }
      case 'boolean': {
        if (input[def.inputKey] !== condValue) return false;
        break;
      }
      case 'range_min': {
        if ((input[def.inputKey] as number) < (condValue as number)) return false;
        break;
      }
      case 'range_max': {
        if ((input[def.inputKey] as number) > (condValue as number)) return false;
        break;
      }
      case 'float_eq': {
        const inputVal = input[def.inputKey] as number | null | undefined;
        if (inputVal == null) return false;
        if (Math.abs(inputVal - (condValue as number)) > def.tolerance) return false;
        break;
      }
    }
  }

  return hasAnyCondition;
}
