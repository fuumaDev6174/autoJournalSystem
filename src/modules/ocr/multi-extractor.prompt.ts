export const MULTI_EXTRACT_TYPE_HINTS: Record<string, string> = {
  bank_statement: '銀行通帳の入出金明細です。各行の日付・摘要・入金額または出金額を抽出してください。',
  credit_card: 'クレジットカードの利用明細です。各行の利用日・利用先・金額を抽出してください。',
  etc_statement: 'ETC利用明細です。各行の利用日・IC名・金額を抽出してください。',
  e_money_statement: '電子マネー/QR決済の利用明細です。各行の日付・利用先・金額を抽出してください。',
  expense_report: '経費精算書です。各行の日付・項目・金額を抽出してください。',
};

export function buildMultiExtractPrompt(documentType: string, industryPath?: string): string {
  const hint = MULTI_EXTRACT_TYPE_HINTS[documentType] || '明細書です。各行のデータを抽出してください。';
  const industryContext = industryPath ? `\n- 業種階層: ${industryPath}` : '';

  return `あなたは日本の税理士事務所のOCR解析AIです。
${hint}
${industryContext}

各取引行を以下のJSON配列で返してください（JSON以外は出力しないでください）:
[
  {
    "date": "2024-03-15",
    "description": "摘要/利用先",
    "amount": 1500,
    "counterparty": "取引先名（不明ならnull）",
    "is_income": false,
    "suggested_account_name": "推定される勘定科目名（不明ならnull）",
    "tax_rate": 0.10,
    "confidence": 0.85
  }
]

- date: YYYY-MM-DD形式
- amount: 正の数値（円単位、税込）
- is_income: 入金/売上ならtrue、出金/支出ならfalse
- suggested_account_name: 日本の勘定科目名（例: 旅費交通費、消耗品費、売上高）
- confidence: 各行の抽出確信度（0.0〜1.0）
- 読み取れない行はconfidence=0.3以下で含める`;
}
