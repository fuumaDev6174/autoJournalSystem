import { splitByHouseholdRatio } from '../../core/accounting/household-ratio.js';
import type { AccountItemRef, TaxCategoryRef, GeneratedJournalEntry } from './journal.types';
import type { MatchedRule } from '../rule-engine/rule-engine.types.js';

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

  const description = matched.description_template
    ? matched.description_template.replace('{supplier}', input.supplier)
    : input.supplier;

  const taxRate = taxCat?.rate ?? (input.tax_amount ? 0.10 : null);

  const creditAccountName = (() => {
    switch (input.payment_method) {
      case 'credit_card': return '未払金';
      case 'bank_transfer': return '普通預金';
      case 'e_money': return '未払金';
      default: return '現金';
    }
  })();

  if (matched.business_ratio != null && matched.business_ratio < 1) {
    const split = splitByHouseholdRatio(input.amount, input.tax_amount, matched.business_ratio);

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
          amount: split.businessAmount,
          tax_rate: taxRate,
          tax_amount: split.businessTax,
          description: `${description}（事業用${Math.round(matched.business_ratio * 100)}%）`,
        },
        {
          line_number: 2,
          debit_credit: 'debit',
          account_item_name: '事業主貸',
          tax_category_name: '対象外',
          amount: split.personalAmount,
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
