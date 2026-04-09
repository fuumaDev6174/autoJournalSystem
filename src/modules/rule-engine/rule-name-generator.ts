/**
 * @module ルール名自動生成
 * @description ルールの条件から人間が読みやすいルール名を自動生成する。
 */

/**
 * ルール条件と勘定科目名から表示用ルール名を生成する。
 * 例: "イオン (食品) ¥1,000以上 カード → 消耗品費"
 *
 * @param conditions - ルール条件
 * @param accountItemName - マッチ先の勘定科目名
 * @returns 生成されたルール名
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

  if (conditions.supplier_pattern) {
    parts.push(conditions.supplier_pattern);
  }

  if (conditions.item_pattern) {
    parts.push(`(${conditions.item_pattern})`);
  }

  if (!conditions.supplier_pattern && !conditions.item_pattern && conditions.transaction_pattern) {
    parts.push(conditions.transaction_pattern);
  }

  if (conditions.amount_min != null && conditions.amount_max != null) {
    parts.push(`¥${conditions.amount_min.toLocaleString()}〜¥${conditions.amount_max.toLocaleString()}`);
  } else if (conditions.amount_min != null) {
    parts.push(`¥${conditions.amount_min.toLocaleString()}以上`);
  } else if (conditions.amount_max != null) {
    parts.push(`¥${conditions.amount_max.toLocaleString()}以下`);
  }

  if (conditions.payment_method) {
    const methodNames: Record<string, string> = {
      cash: '現金', card: 'カード', credit_card: 'カード',
      bank_transfer: '振込', e_money: '電子マネー',
    };
    parts.push(methodNames[conditions.payment_method] || conditions.payment_method);
  }

  if (conditions.document_type) {
    parts.push(`[${conditions.document_type}]`);
  }

  if (accountItemName) {
    parts.push(`→ ${accountItemName}`);
  }

  if (parts.length === 0) {
    return accountItemName ? `→ ${accountItemName}` : '自動生成ルール';
  }

  return parts.join(' ');
}
