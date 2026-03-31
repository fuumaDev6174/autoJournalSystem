import { normalizeJapanese } from '../../shared/utils/normalize-japanese.js';
import type { AccountItemRef, TaxCategoryRef, GeneratedJournalEntry, GeneratedJournalLine } from './journal.service.js';

// ============================================
// ルールマッチングエンジン（B1）
// processing_rules テーブルから条件にマッチするルールを検索し、
// 仕訳データを生成する。マッチしなければ null を返す。
// ============================================

export interface RuleMatchInput {
  supplier: string;
  amount: number;
  description?: string;
  client_id: string;
  industry_ids: string[];           // フラット業種IDのみ（N階層廃止）
  payment_method?: string | null;
  item_name?: string | null;        // 品目名
  document_type?: string | null;    // 証憑種別コード
  has_invoice_number?: boolean | null;
  tax_rate_hint?: number | null;    // OCR読取税率
  is_internal_tax?: boolean | null;
  frequency_hint?: string | null;   // 'recurring' / 'one_time'
  // 追加フィールド（6項目）
  tategaki?: string | null;                 // 但書き
  withholding_tax_amount?: number | null;   // 源泉徴収税額
  invoice_qualification?: string | null;    // 適格/非適格区分
  addressee?: string | null;                // 宛名
  transaction_type?: string | null;         // 取引種類
  transfer_fee_bearer?: string | null;      // 振込手数料負担
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

/**
 * ルールのconditionsからルール名を自動生成する。
 * rule_nameが手動設定済み（非null）ならそちらを優先。
 *
 * 生成ロジック:
 *   1. supplier_pattern → 取引先名を先頭に
 *   2. item_pattern → (品目名) を追加
 *   3. amount_min/max → 金額範囲を追加
 *   4. payment_method → 支払方法を追加
 *   5. document_type → 証憑種別を追加
 *   6. → 勘定科目名 で締める
 */
export function generateRuleName(
  conditions: {
    supplier_pattern?: string | null;
    transaction_pattern?: string | null;
    amount_min?: number | null;
    amount_max?: number | null;
    item_pattern?: string | null;
    payment_method?: string | null;
    document_type?: string | null;
    has_invoice_number?: boolean | null;
  },
  accountItemName?: string | null
): string {
  const parts: string[] = [];

  // 取引先
  if (conditions.supplier_pattern) {
    parts.push(conditions.supplier_pattern);
  }

  // 品目
  if (conditions.item_pattern) {
    parts.push(`(${conditions.item_pattern})`);
  }

  // 摘要パターン（取引先も品目もない場合のフォールバック）
  if (!conditions.supplier_pattern && !conditions.item_pattern && conditions.transaction_pattern) {
    parts.push(conditions.transaction_pattern);
  }

  // 金額範囲
  if (conditions.amount_min != null && conditions.amount_max != null) {
    parts.push(`¥${conditions.amount_min.toLocaleString()}〜¥${conditions.amount_max.toLocaleString()}`);
  } else if (conditions.amount_min != null) {
    parts.push(`¥${conditions.amount_min.toLocaleString()}以上`);
  } else if (conditions.amount_max != null) {
    parts.push(`¥${conditions.amount_max.toLocaleString()}以下`);
  }

  // 支払方法
  if (conditions.payment_method) {
    const methodNames: Record<string, string> = {
      cash: '現金', card: 'カード', credit_card: 'カード',
      bank_transfer: '振込', e_money: '電子マネー',
    };
    parts.push(methodNames[conditions.payment_method] || conditions.payment_method);
  }

  // 証憑種別
  if (conditions.document_type) {
    parts.push(`[${conditions.document_type}]`);
  }

  // 勘定科目名で締める
  if (accountItemName) {
    parts.push(`→ ${accountItemName}`);
  }

  // パーツがない場合のフォールバック
  if (parts.length === 0) {
    return accountItemName ? `→ ${accountItemName}` : '自動生成ルール';
  }

  return parts.join(' ');
}

/**
 * processing_rules からマッチするルールを検索する。
 * 優先順位: client（顧客別）> industry（業種別、depth昇順）> shared（共通）
 * 同一スコープ内では priority が小さいほど優先。
 *
 * @param rules - Supabase から取得した processing_rules の配列
 * @param input - マッチング入力（取引先名、金額等）
 * @returns マッチしたルール情報、またはマッチしなければ null
 *
 * industry scopeはフラット業種IDで直接マッチ（N階層廃止）。
 */
export function matchProcessingRules(
  rules: Array<{
    id: string;
    rule_name: string;
    priority: number;
    scope: string;
    rule_type: string;
    client_id: string | null;
    industry_id: string | null;
    conditions: {
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
    };
    actions: {
      account_item_id?: string | null;
      tax_category_id?: string | null;
      description_template?: string | null;
      business_ratio?: number | null;
      business_ratio_note?: string | null;
      entry_type_hint?: string | null;
      requires_manual_review?: boolean | null;
      auto_tags?: string[] | null;
      withholding_tax_handling?: string | null;
    };
    is_active: boolean;
  }>,
  input: RuleMatchInput
): MatchedRule | null {
  const activeRules = rules.filter(r => r.is_active);

  // 1. client scope: 顧客別ルール
  const clientRules = activeRules
    .filter(r => r.scope === 'client' && r.client_id === input.client_id)
    .sort((a, b) => a.priority - b.priority);

  // 2. industry scope: 業種別ルール
  const industryRules = activeRules
    .filter(r => r.scope === 'industry' && r.industry_id && input.industry_ids.includes(r.industry_id))
    .sort((a, b) => a.priority - b.priority);

  // 3. shared scope: 汎用ルール
  const sharedRules = activeRules
    .filter(r => r.scope === 'shared')
    .sort((a, b) => a.priority - b.priority);

  // 優先順位: client > industry(depth昇順) > shared
  const orderedRules = [...clientRules, ...industryRules, ...sharedRules];

  for (const rule of orderedRules) {
    if (matchesConditions(rule.conditions, input)) {
      if (!rule.actions.account_item_id) continue;

      console.log(`[ルールマッチ] ✅ マッチ: "${rule.rule_name}" (priority=${rule.priority}, scope=${rule.scope})`);

      return {
        rule_id: rule.id,
        rule_name: rule.rule_name,
        account_item_id: rule.actions.account_item_id,
        tax_category_id: rule.actions.tax_category_id || null,
        description_template: rule.actions.description_template || null,
        business_ratio: rule.actions.business_ratio || null,
        business_ratio_note: rule.actions.business_ratio_note || null,
        entry_type_hint: rule.actions.entry_type_hint || null,
        requires_manual_review: rule.actions.requires_manual_review === true,
        withholding_tax_handling: rule.actions.withholding_tax_handling || null,
        confidence: 0.95,
      };
    }
  }

  console.log(`[ルールマッチ] ルールマッチなし → Gemini AI にフォールバック`);
  return null;
}

/**
 * ルールマッチング（候補付きバージョン）
 * 最優先のマッチルールに加えて、他にマッチしたルール候補も返す。
 */
export function matchProcessingRulesWithCandidates(
  rules: Parameters<typeof matchProcessingRules>[0],
  input: RuleMatchInput
): {
  matched: MatchedRule | null;
  candidates: Array<MatchedRule & { scope: string; priority: number }>;
} {
  const activeRules = rules.filter(r => r.is_active);
  const allMatched: Array<MatchedRule & { scope: string; priority: number }> = [];

  const clientRules = activeRules
    .filter(r => r.scope === 'client' && r.client_id === input.client_id)
    .sort((a, b) => a.priority - b.priority);
  const industryRules = activeRules
    .filter(r => r.scope === 'industry' && r.industry_id && input.industry_ids.includes(r.industry_id))
    .sort((a, b) => a.priority - b.priority);
  const sharedRules = activeRules
    .filter(r => r.scope === 'shared')
    .sort((a, b) => a.priority - b.priority);

  const orderedRules = [...clientRules, ...industryRules, ...sharedRules];

  for (const rule of orderedRules) {
    if (matchesConditions(rule.conditions, input) && rule.actions.account_item_id) {
      allMatched.push({
        rule_id: rule.id,
        rule_name: rule.rule_name,
        account_item_id: rule.actions.account_item_id,
        tax_category_id: rule.actions.tax_category_id || null,
        description_template: rule.actions.description_template || null,
        business_ratio: rule.actions.business_ratio || null,
        business_ratio_note: rule.actions.business_ratio_note || null,
        entry_type_hint: rule.actions.entry_type_hint || null,
        requires_manual_review: rule.actions.requires_manual_review === true,
        withholding_tax_handling: rule.actions.withholding_tax_handling || null,
        confidence: 0.95,
        scope: rule.scope,
        priority: rule.priority,
      });
    }
  }

  return {
    matched: allMatched.length > 0 ? allMatched[0] : null,
    candidates: allMatched.slice(1),
  };
}

/**
 * ルールの conditions が入力にマッチするか判定。
 * 全ての指定された条件がANDで一致する必要がある。
 * 条件が一つも指定されていないルールはマッチしない（全一致防止）。
 */
function matchesConditions(
  conditions: {
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
  },
  input: RuleMatchInput
): boolean {
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

/**
 * ルールマッチ結果から GeneratedJournalEntry 互換の仕訳データを生成
 */
export function buildEntryFromRule(
  matched: MatchedRule,
  input: {
    supplier: string;
    amount: number;
    tax_amount: number | null;
    payment_method: string | null;
    date: string;
  },
  accountItems: AccountItemRef[],
  taxCategories: TaxCategoryRef[]
): GeneratedJournalEntry {
  const account = accountItems.find(a => a.id === matched.account_item_id);
  const taxCat = matched.tax_category_id ? taxCategories.find(t => t.id === matched.tax_category_id) : null;

  // 摘要テンプレート展開
  const description = matched.description_template
    ? matched.description_template.replace('{supplier}', input.supplier)
    : input.supplier;

  // 税率を税区分から推定
  const taxRate = taxCat?.rate ?? (input.tax_amount ? 0.10 : null);

  // 貸方の勘定科目を支払方法から決定
  const creditAccountName = (() => {
    switch (input.payment_method) {
      case 'credit_card': return '未払金';
      case 'bank_transfer': return '普通預金';
      case 'e_money': return '未払金';
      default: return '現金';
    }
  })();

  // 家事按分がある場合
  if (matched.business_ratio != null && matched.business_ratio < 1) {
    const businessAmount = Math.round(input.amount * matched.business_ratio);
    const personalAmount = input.amount - businessAmount;
    const businessTax = input.tax_amount ? Math.round(input.tax_amount * matched.business_ratio) : null;
    const personalTax = input.tax_amount ? (input.tax_amount - (businessTax || 0)) : null;

    return {
      category: '事業用',
      notes: description,
      confidence: matched.confidence,
      reasoning: `ルール「${matched.rule_name}」に基づく自動仕訳（家事按分${Math.round(matched.business_ratio * 100)}%）`,
      lines: [
        {
          line_number: 1,
          debit_credit: 'debit',
          account_item_name: account?.name || '雑費',
          tax_category_name: taxCat?.name || null,
          amount: businessAmount,
          tax_rate: taxRate,
          tax_amount: businessTax,
          description: `${description}（事業用${Math.round(matched.business_ratio * 100)}%）`,
        },
        {
          line_number: 2,
          debit_credit: 'debit',
          account_item_name: '事業主貸',
          tax_category_name: '対象外',
          amount: personalAmount,
          tax_rate: null,
          tax_amount: null,
          description: `${description}（私用${Math.round((1 - matched.business_ratio) * 100)}%）`,
        },
        {
          line_number: 3,
          debit_credit: 'credit',
          account_item_name: creditAccountName,
          tax_category_name: null,
          amount: input.amount,
          tax_rate: null,
          tax_amount: null,
          description: description,
        },
      ],
    };
  }

  // 通常（按分なし）
  return {
    category: '事業用',
    notes: description,
    confidence: matched.confidence,
    reasoning: `ルール「${matched.rule_name}」に基づく自動仕訳`,
    lines: [
      {
        line_number: 1,
        debit_credit: 'debit',
        account_item_name: account?.name || '雑費',
        tax_category_name: taxCat?.name || null,
        amount: input.amount,
        tax_rate: taxRate,
        tax_amount: input.tax_amount,
        description: description,
      },
      {
        line_number: 2,
        debit_credit: 'credit',
        account_item_name: creditAccountName,
        tax_category_name: null,
        amount: input.amount,
        tax_rate: null,
        tax_amount: null,
        description: description,
      },
    ],
  };
}

// ============================================
// ユーティリティ: AI出力の名前 → DB UUID マッピング
// ============================================

export function mapLinesToDBFormat(
  lines: GeneratedJournalLine[],
  accountItems: AccountItemRef[],
  taxCategories: TaxCategoryRef[],
  fallbackAccountId: string,
  suppliers?: Array<{ id: string; name: string }>,
  supplierAliases?: Array<{ supplier_id: string; alias_name: string }>,
  items?: Array<{ id: string; name: string }>,
): Array<{
  line_number: number;
  debit_credit: 'debit' | 'credit';
  account_item_id: string;
  tax_category_id: string | null;
  amount: number;
  tax_rate: number | null;
  tax_amount: number | null;
  description: string | null;
  supplier_id: string | null;
  item_id: string | null;
  supplier_name_text: string | null;
  item_name_text: string | null;
}> {
  return lines.map((line) => {
    // 勘定科目名で検索（完全一致 → 部分一致フォールバック）
    const account =
      accountItems.find((a) => a.name === line.account_item_name) ||
      accountItems.find((a) =>
        line.account_item_name.includes(a.name) || a.name.includes(line.account_item_name)
      );

    // 税区分名で検索
    const taxCategory = line.tax_category_name
      ? taxCategories.find((t) => t.name === line.tax_category_name) ||
        taxCategories.find((t) =>
          line.tax_category_name!.includes(t.name) || t.name.includes(line.tax_category_name!)
        )
      : null;

    // 取引先マッチング（正規化→完全一致→部分一致→エイリアス）
    let supplierId: string | null = null;
    const sName = line.supplier_name;
    if (sName && suppliers) {
      const normName = normalizeJapanese(sName).toLowerCase();
      const exact = suppliers.find(s => normalizeJapanese(s.name).toLowerCase() === normName);
      if (exact) { supplierId = exact.id; }
      else {
        const partial = suppliers.find(s => {
          const norm = normalizeJapanese(s.name).toLowerCase();
          return normName.includes(norm) || norm.includes(normName);
        });
        if (partial) { supplierId = partial.id; }
        else if (supplierAliases) {
          const alias = supplierAliases.find(a => {
            const normAlias = normalizeJapanese(a.alias_name).toLowerCase();
            return normName.includes(normAlias) || normAlias.includes(normName);
          });
          if (alias) supplierId = alias.supplier_id;
        }
      }
    }

    // 品目マッチング（名前→完全一致→部分一致）
    let itemId: string | null = null;
    const iName = line.item_name;
    if (iName && items) {
      const exact = items.find(it => it.name === iName);
      if (exact) { itemId = exact.id; }
      else {
        const partial = items.find(it => iName.includes(it.name) || it.name.includes(iName));
        if (partial) itemId = partial.id;
      }
    }

    if (!account) {
      console.warn(`勘定科目が見つかりません: "${line.account_item_name}" → 雑費にフォールバック`);
    }

    return {
      line_number: line.line_number,
      debit_credit: line.debit_credit,
      account_item_id: account?.id || fallbackAccountId,
      tax_category_id: taxCategory?.id || null,
      amount: line.amount,
      tax_rate: line.tax_rate,
      tax_amount: line.tax_amount,
      description: line.description || null,
      supplier_id: supplierId,
      item_id: itemId,
      supplier_name_text: sName || null,
      item_name_text: iName || null,
    };
  });
}
