/**
 * @module AI 仕訳生成プロンプト
 * @description Gemini に送る仕訳生成プロンプトを組み立てる。
 *              取引情報 + 勘定科目/税区分マスタ → プロンプト文字列。
 */

import type { JournalEntryInput } from './journal.types.js';

/**
 * 取引情報とマスタデータから Gemini 仕訳生成プロンプトを構築する。
 *
 * @param input - OCR 抽出データ + 勘定科目・税区分マスタ
 * @returns Gemini に送るプロンプト文字列
 */
export function buildJournalGenerationPrompt(input: JournalEntryInput): string {
  const accountList = input.account_items
    .map((a) => `${a.name}(${a.code}/${a.category})`)
    .join(', ');

  const taxCategoryList = input.tax_categories
    .map((t) => `${t.name}(税率${(t.rate * 100).toFixed(0)}%)`)
    .join(', ');

  const paymentHint = (() => {
    switch (input.payment_method) {
      case 'credit_card': return '貸方は「未払金」または「クレジットカード」を使用';
      case 'bank_transfer': return '貸方は「普通預金」を使用';
      case 'e_money': return '貸方は「普通預金」または「未払金」を使用';
      case 'cash':
      default: return '貸方は「現金」を使用';
    }
  })();

  return `あなたは日本の税理士のアシスタントAIです。以下の取引情報から適切な仕訳を生成してください。

【取引情報】
- 取引日: ${input.date}
- 取引先: ${input.supplier}
- 合計金額: ${input.amount}円
- 消費税: ${input.tax_amount !== null ? input.tax_amount + '円' : '不明'}
${input.tax_details ? `- 税率内訳: 10%対象=${input.tax_details.rate_10_amount ?? '不明'}円(税${input.tax_details.rate_10_tax ?? '不明'}円), 8%対象=${input.tax_details.rate_8_amount ?? '不明'}円(税${input.tax_details.rate_8_tax ?? '不明'}円), 非課税=${input.tax_details.exempt_amount ?? '不明'}円` : ''}
- 品目: ${input.items && input.items.length > 0 ? input.items.map((i) => `${i.name}(${i.amount}円${i.tax_rate != null ? '/税率' + (i.tax_rate * 100) + '%' : ''})`).join(', ') : '不明'}
- 支払方法: ${input.payment_method || '不明'}
${input.invoice_number ? `- インボイス登録番号: ${input.invoice_number}` : '- インボイス番号: なし'}
${input.industry ? `- 業種: ${input.industry}` : ''}
${input.tategaki ? `- 但書き: ${input.tategaki}` : ''}
${input.withholding_tax_amount != null ? `- 源泉徴収税額: ${input.withholding_tax_amount}円` : ''}
${input.invoice_qualification ? `- 請求書区分: ${input.invoice_qualification === 'qualified' ? '適格請求書（仕入税額控除100%）' : '区分記載請求書（経過措置: 仕入税額控除80%）'}` : ''}
${input.transaction_type ? `- 取引種類: ${{purchase:'仕入',expense:'経費',asset:'資産取得',sales:'売上',fee:'報酬・委託料'}[input.transaction_type] || input.transaction_type}` : ''}
${input.transfer_fee_bearer ? `- 振込手数料: ${input.transfer_fee_bearer === 'sender' ? '先方負担（支払金額から差し引く）' : '当方負担（支払手数料を別途計上）'}` : ''}
${input.correction_hints && input.correction_hints.length > 0 ? `
【過去の修正履歴（参考にしてください）】
${input.correction_hints.map(h => `- 「${h.supplier}」: ${h.original} → ${h.corrected}（${h.count}回修正）`).join('\n')}
` : ''}
【使用可能な勘定科目（この中から選んでください）】
${accountList}

【使用可能な税区分（この中から選んでください）】
${taxCategoryList}

【出力形式】
以下のJSON形式で返してください。JSONのみを返し、コードブロックや説明文は不要です。

{
  "category": "事業用" または "プライベート",
  "notes": "摘要（取引先名と品目を含める）",
  "confidence": 0.0〜1.0の信頼度,
  "reasoning": "判断理由（日本語で簡潔に）",
  "lines": [
    {
      "line_number": 1,
      "debit_credit": "debit" または "credit",
      "account_item_name": "勘定科目名（上記リストから選択）",
      "tax_category_name": "税区分名（上記リストから選択。対象外ならnull）",
      "amount": 金額（数値のみ）,
      "tax_rate": 税率（0.10 または 0.08 または 0 または null）,
      "tax_amount": 消費税額（数値のみ、不明ならnull）,
      "description": "明細摘要",
      "supplier_name": "取引先名",
      "item_name": "品目名"
    }
  ]
}

【仕訳ルール】
1. 借方（debit）と貸方（credit）の合計金額は必ず一致させること。
2. ${paymentHint}。
3. 品目ごとに勘定科目が異なる場合は、借方を複数行に分けること。
4. 軽減税率8%の品目は8%用の税区分を選ぶこと。
5. インボイス番号がない場合、仕入税額控除の対象外となる可能性があるため注意。
6. 摘要は「取引先名 品目」の形式で。
7. 事業用かプライベートかは総合的に判断。プライベートなら借方を「事業主貸」に。
8. 源泉徴収税額がある場合: 借方=外注費、貸方=普通預金+預り金（源泉徴収税額）。
9. 区分記載請求書の場合は経過措置の税区分を選ぶ。
10. 振込手数料が当方負担の場合は支払手数料の行を追加。
11. transaction_type が asset の場合は資産科目を使用。

重要: 借方合計 = 貸方合計 を必ず守ること。
JSONのみを返してください。`;
}
