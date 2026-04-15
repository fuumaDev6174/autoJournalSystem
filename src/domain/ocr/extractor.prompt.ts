/**
 * @module OCR データ抽出プロンプト
 * Gemini に画像から取引データを構造化 JSON で抽出させる。
 * buildExtractorPrompt() で書類種別に応じた追加指示を動的に注入する。
 */

const BASE_PROMPT = `あなたは日本の税理士事務所で使われる経理書類読取AIです。
この画像から取引データを正確に抽出し、JSON形式で返してください。

対象となる書類:
レシート、領収書、請求書、納品書、銀行通帳、入出金明細、
クレジットカード明細、ETC利用明細、電子マネー/QR決済明細、
経費精算書、給与明細、売上集計表、支払通知書、
振込明細・送金完了画面、水道光熱費・通信費の請求書・検針票、
税金・社会保険料の納付済領収書、支払調書、
医療費の領収書、ふるさと納税受領証、保険料控除証明書、
固定資産台帳、借入金返済予定表、その他の経理関連書類。

=== 回答ルール ===

1. 必ず以下の JSON スキーマだけを返すこと（説明文やマークダウン不要）
2. 通帳・明細など複数取引がある書類は transactions 配列に各行を列挙
3. レシートなど単一取引の書類も transactions 配列に1件として格納
4. 日付は YYYY-MM-DD 形式（和暦は西暦に変換）
5. 金額はカンマなしの数値（文字列にしない）
6. 読み取れない項目は null にする（推測で埋めない）

=== JSON スキーマ ===

{
  "document_type": "receipt | invoice | bank_statement | credit_card | payroll | sales_report | medical | deduction | fixed_asset | loan | utility_bill | tax_receipt | bank_transfer_receipt | payment_statement | other",
  "confidence": 0.0〜1.0,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "supplier": "取引先名・店舗名（正式名称で）",
      "total_amount": 合計金額,
      "tax_amount": 消費税額合計（不明なら null）,
      "tax_details": {
        "rate_10_amount": 10%対象の税抜金額,
        "rate_10_tax": 10%の消費税額,
        "rate_8_amount": 8%対象の税抜金額,
        "rate_8_tax": 8%の消費税額,
        "exempt_amount": 非課税金額
      },
      "tax_included": true（内税）/ false（外税）,
      "payment_method": "cash | credit_card | bank_transfer | e_money | other | null",
      "invoice_number": "Tから始まるインボイス登録番号（なければ null）",
      "reference_number": "伝票番号・取引番号（なければ null）",
      "tategaki": "但書き（「但し、〇〇代として」の部分。なければ null）",
      "withholding_tax_amount": 源泉徴収税額（なければ null）,
      "invoice_qualification": "qualified | kubun_kisai | null",
      "addressee": "宛名（なければ null）",
      "transaction_type": "purchase | expense | asset | sales | fee | tax_payment | null",
      "transfer_fee_bearer": "sender | receiver | null",
      "tax_payment_type": "income_tax | consumption_tax | resident_tax | property_tax | auto_tax | national_health_insurance | national_pension | business_tax | other_tax | null",
      "items": [
        {
          "name": "商品名・摘要",
          "quantity": 数量,
          "unit_price": 単価,
          "amount": 金額,
          "tax_rate": 0.10 | 0.08 | 0 | null
        }
      ]
    }
  ]
}

=== 判定ヒント ===

【消費税】
- 「※」「＊」マークがある品目 → 軽減税率 8%（食品・飲料）
- 「内税」「税込」→ tax_included: true
- 「外税」「税抜」→ tax_included: false
- 消費税の記載がなければ tax_amount: null（逆算しない）

【インボイス】
- 「T」+ 13桁の番号 → invoice_number に設定
- 「適格請求書」表記 or T番号あり → invoice_qualification: "qualified"
- 「区分記載請求書」表記 → invoice_qualification: "kubun_kisai"

【源泉徴収】
- 「源泉徴収税額」「源泉所得税」の記載 → withholding_tax_amount に金額

【振込手数料】
- 「振込手数料はご負担ください」→ transfer_fee_bearer: "receiver"
- 「振込手数料を差し引いて」→ transfer_fee_bearer: "sender"

【取引種別 (transaction_type)】
- 商品仕入 → "purchase"
- 10万円以上の備品・機器 → "asset"
- 外注費・業務委託料 → "fee"
- 売上 → "sales"
- 税金・社会保険料の支払い → "tax_payment"
- 上記以外の経費 → "expense"

【税金の納付書 (tax_receipt) — 勘定科目が種別によって異なる】
- tax_payment_type で税金の種類を特定してください:
  - 所得税/予定納税 → "income_tax"（個人事業主: 事業主貸）
  - 消費税/中間納付 → "consumption_tax"（租税公課）
  - 住民税 → "resident_tax"（個人事業主: 事業主貸 / 法人: 租税公課）
  - 固定資産税 → "property_tax"（租税公課 ※自宅兼事務所は家事按分あり）
  - 自動車税 → "auto_tax"（租税公課 ※事業割合で按分）
  - 国民健康保険料 → "national_health_insurance"（個人事業主: 事業主貸）
  - 国民年金 → "national_pension"（個人事業主: 事業主貸）
  - 事業税 → "business_tax"（租税公課）
  - その他 → "other_tax"

【水道光熱費・通信費 (utility_bill)】
- 電力会社/ガス会社/水道局/通信会社のロゴ・社名がある
- 「ご請求金額」「ご利用期間」「お客様番号」が記載
- 勘定科目は supplier（電力会社 → 水道光熱費 / 通信会社 → 通信費）で判断可能

【振込明細・送金完了画面 (bank_transfer_receipt)】
- ATMの利用明細やネットバンクの出金完了画面
- 「お振込み完了」「送金完了」「振込結果」等の文言
- 振込先の口座情報・金額・手数料が記載
- payment_method: "bank_transfer" を設定

【支払調書 (payment_statement)】
- 「報酬、料金、契約金及び賞金の支払調書」と表題
- 「支払金額」「源泉徴収税額」が記載
- withholding_tax_amount に源泉徴収税額を設定

【但書き (tategaki)】
- 「但し」「但」に続く文言を抽出`;

// ---------------------------------------------------------------------------
// 書類種別ごとの追加プロンプト
// ---------------------------------------------------------------------------

const INVOICE_SUPPLIER_RULES = `
━━━━━━━━━━━━━━━━━━━━━━━
■ 請求書の取引先判定ルール（重要）
━━━━━━━━━━━━━━━━━━━━━━━

請求書には「請求元（発行者）」と「請求先（宛先）」の2者が記載されています。
仕訳の取引先は **請求元（発行者）** です。請求先（宛先）ではありません。

【請求先（宛先）の特徴 — これは取引先ではない】
- 「御中」「様」が付いている
- 書類の左上〜中央上部に大きく記載されていることが多い
- 「下記の通りご請求申し上げます」の目的語

【請求元（発行者）の特徴 — これが取引先】
- 印鑑・社印・角印の近くに記載されている
- 振込先口座の名義と一致する
- 電話番号・FAX番号・住所が記載されている側
- インボイス番号（T+13桁）の登録者名
- 「発行者」「請求者」「請求元」というラベルの近く
- 書類の右上〜右下に記載されていることが多い

【判定の優先順位】
1. 振込先口座名義 → 最も確実な請求元の手がかり
2. インボイス番号の登録者名
3. 印鑑・社印の近くの社名
4. 「御中」「様」が付いていない側の社名
5. 電話番号・住所が記載されている側

【出力時の注意】
- supplier には請求元（発行者）の名前を入れること
- もし請求元と請求先の区別がつかない場合は、confidence を 0.6 以下にすること`;

const ISSUED_INVOICE_SUPPLIER_RULES = `
━━━━━━━━━━━━━━━━━━━━━━━
■ 発行済み請求書（issued_invoice）の取引先判定ルール
━━━━━━━━━━━━━━━━━━━━━━━

発行済み請求書の場合、自分（自社）が請求元です。
仕訳の取引先は **請求先（宛先）** です。

【取引先の特徴】
- 「御中」「様」が付いている側の社名
- 書類の左上〜中央上部に記載されている宛名

【自社の特徴 — これは取引先ではない】
- 自社の印鑑・ロゴが付いている
- 振込先口座の名義（自社口座）
- 書類の右上〜右下に記載されている発行者情報`;

const PAYMENT_NOTICE_RULES = `
━━━━━━━━━━━━━━━━━━━━━━━
■ 支払通知書（payment_notice）の取引先判定ルール
━━━━━━━━━━━━━━━━━━━━━━━

支払通知書は、取引先が「あなたにこの金額を支払います」と通知する書類です。
仕訳の取引先は **支払元（通知書の発行者）** です。`;

function getTypeSpecificInstructions(code: string): string {
  switch (code) {
    case 'recv_invoice':
    case 'pdf_invoice':
    case 'invoice':
      return INVOICE_SUPPLIER_RULES;
    case 'issued_invoice':
      return ISSUED_INVOICE_SUPPLIER_RULES;
    case 'payment_notice':
      return PAYMENT_NOTICE_RULES;
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// エクスポート
// ---------------------------------------------------------------------------

/** 後方互換: 書類種別なしの場合はベースプロンプトのみ */
export const EXTRACT_OCR_PROMPT = BASE_PROMPT;

/** 書類種別に応じた追加指示を含むプロンプトを構築する */
export function buildExtractorPrompt(documentTypeCode?: string): string {
  if (!documentTypeCode) return BASE_PROMPT;
  const extra = getTypeSpecificInstructions(documentTypeCode);
  return extra ? `${BASE_PROMPT}\n\n${extra}` : BASE_PROMPT;
}
