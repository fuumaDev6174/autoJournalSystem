/**
 * @module 明細分割プロンプト
 * @description 複数取引書類から各行を個別に切り出す Gemini プロンプト。
 */

/** 書類種別ごとの抽出ヒント */
export const MULTI_EXTRACT_TYPE_HINTS: Record<string, string> = {
  // --- 収入系 ---
  bank_statement:
    '銀行通帳または入出金明細です。' +
    '各行の「日付・摘要（振込人名 or 引落先）・入金額または出金額」を抽出してください。' +
    '入金行は is_income: true、出金行は is_income: false にしてください。',

  platform_csv:
    'ECプラットフォーム（Amazon・楽天・メルカリ等）の売上明細です。' +
    '各行の「日付・商品名 or 注文番号・売上金額・手数料」を抽出してください。' +
    '手数料がある場合は別行として is_income: false で出力してください。',

  crypto_history:
    '暗号資産（仮想通貨）の取引履歴です。' +
    '各行の「日付・通貨ペア・売買区分・数量・金額（円換算）」を抽出してください。' +
    '売却は is_income: true、購入は is_income: false にしてください。',

  realestate_inc:
    '不動産収入の明細（家賃管理表等）です。' +
    '各行の「対象月・物件名/部屋番号・家賃・共益費・入金額」を抽出してください。',

  // --- 経費系 ---
  credit_card:
    'クレジットカードの利用明細です。' +
    '各行の「利用日・利用先・金額」を抽出してください。' +
    'すべて出金（is_income: false）として扱ってください。',

  e_money_statement:
    '電子マネー/QR決済（PayPay・Suica等）の利用明細です。' +
    '各行の「日付・利用先・金額」を抽出してください。' +
    'チャージ行は is_income: true（残高増）、利用行は is_income: false にしてください。',

  etc_statement:
    'ETC利用明細です。' +
    '各行の「利用日・入口IC〜出口IC・金額」を抽出してください。' +
    'description には「入口IC → 出口IC」の形式で記載してください。',

  expense_report:
    '経費精算書です。' +
    '各行の「日付・項目名・金額・経費区分」を抽出してください。' +
    'suggested_account_name には申請者が記載した勘定科目をそのまま設定してください。',

  // --- 資産・償却系 ---
  loan_schedule:
    '借入金の返済予定表です。' +
    '各行の「返済日・元金・利息・返済額合計」を抽出してください。' +
    '元金返済と利息支払いは別行にし、suggested_account_name をそれぞれ設定してください。',

  // --- 複合仕訳 ---
  payroll:
    '給与明細または賃金台帳です。' +
    '以下の項目をそれぞれ別行として抽出してください:' +
    '支給額（基本給・残業代等）、控除額（社会保険料・所得税・住民税等）、差引支給額。' +
    '支給項目は is_income: false（会社から見て支出）、' +
    '預り金（社会保険・税金）は別行で suggested_account_name: "預り金" にしてください。',

  sales_report:
    '売上集計表/レジ日報/POSレポートです。' +
    '各行の「日付（または時間帯）・売上区分・金額」を抽出してください。' +
    '現金売上・カード売上・電子マネー売上など決済手段別に分けてください。',
};

/**
 * 書類種別と業種情報からプロンプトを組み立てる。
 *
 * @param documentType - classifier が返した書類種別コード
 * @param industryPath - 業種階層パス（例: "サービス業 > IT"）。あれば勘定科目推定の精度が上がる
 */
export function buildMultiExtractPrompt(documentType: string, industryPath?: string): string {
  const hint = MULTI_EXTRACT_TYPE_HINTS[documentType]
    || '明細書類です。各行の日付・摘要・金額を抽出してください。';

  const industryLine = industryPath
    ? `\n- 業種: ${industryPath}（勘定科目の推定に活用してください）`
    : '';

  return `あなたは日本の税理士事務所で使われる明細読取AIです。
${hint}
${industryLine}

=== 回答ルール ===
1. 以下の JSON 配列だけを返すこと（説明文やマークダウン不要）
2. 日付は YYYY-MM-DD 形式（和暦は西暦に変換）
3. 金額は正の数値（カンマなし・円単位・税込）
4. 読み取れない項目は null にする（推測で埋めない）
5. 読み取りが不鮮明な行も含める（confidence を低くする）

=== JSON スキーマ ===
[
  {
    "date": "YYYY-MM-DD",
    "description": "摘要/利用先/項目名",
    "amount": 1500,
    "counterparty": "取引先名（不明なら null）",
    "is_income": false,
    "suggested_account_name": "推定される勘定科目名（不明なら null）",
    "tax_rate": 0.10,
    "confidence": 0.85
  }
]

=== フィールド説明 ===
- date: 取引日。年が省略されている場合は書類の年度から補完
- description: 摘要・利用先・品目名など、その行の内容を示す文言
- amount: 税込金額（正の数値）。入出金の区別は is_income で表現
- counterparty: 取引先名。通帳なら振込人名/引落先、クレカなら利用先
- is_income: 入金/売上なら true、出金/支出なら false
- suggested_account_name: 日本の勘定科目名（例: 旅費交通費、消耗品費、売上高、預り金）
- tax_rate: 消費税率（0.10 / 0.08 / 0）。不明なら null
- confidence: 各行の読取確信度（0.0〜1.0）。不鮮明なら 0.3 以下`;
}
