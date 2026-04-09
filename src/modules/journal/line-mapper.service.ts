/**
 * @module 仕訳行マッピングサービス
 * @description AI/ルールが返した科目名・取引先名を DB の UUID にマッピングする。
 *              完全一致 → 部分一致 → エイリアスの3段階で名寄せを行う。
 */

import { normalizeJapanese } from '../../shared/utils/normalize-japanese.js';
import type { GeneratedJournalLine, AccountItemRef, TaxCategoryRef } from './journal.types.js';

/**
 * AI/ルールが生成した仕訳行を DB 保存用の UUID 形式に変換する。
 * 科目名・取引先名・品目名をそれぞれマスタと照合し、UUID を解決する。
 *
 * @param lines - AI/ルールが生成した仕訳行（名前ベース）
 * @param accountItems - 勘定科目マスタ
 * @param taxCategories - 税区分マスタ
 * @param fallbackAccountId - 科目が見つからない場合のフォールバック UUID（雑費）
 * @param suppliers - 取引先マスタ
 * @param supplierAliases - 取引先エイリアス
 * @param items - 品目マスタ
 */
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
    // AI が返す科目名は表記ゆれがあるため、完全一致 → 部分一致でフォールバック
    const account =
      accountItems.find((a) => a.name === line.account_item_name) ||
      accountItems.find((a) =>
        line.account_item_name.includes(a.name) || a.name.includes(line.account_item_name)
      );

    const taxCategory = line.tax_category_name
      ? taxCategories.find((t) => t.name === line.tax_category_name) ||
        taxCategories.find((t) =>
          line.tax_category_name!.includes(t.name) || t.name.includes(line.tax_category_name!)
        )
      : null;

    // 取引先名寄せ: 完全一致 → 部分一致 → エイリアスの3段階
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
