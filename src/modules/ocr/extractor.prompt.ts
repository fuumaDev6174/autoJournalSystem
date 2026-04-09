// ============================================
// OCR データ抽出プロンプト
//
// Gemini に画像を送り、取引データを構造化 JSON で返させる。
// classifier.service.ts の分類結果とは別に、
// ここでは「金額・日付・取引先・品目」などの定量データを抽出する。
//
// 【更新時の注意】
// - JSON スキーマを変えたら ocr.types.ts の型も合わせること
// - extractor.service.ts の normalize 処理にも反映すること
// ============================================

export const EXTRACT_OCR_PROMPT = `あなたは日本の税理士事務所で使われる経理書類読取AIです。
この画像から取引データを正確に抽出し、JSON形式で返してください。

対象となる書類:
レシート、領収書、請求書、納品書、銀行通帳、入出金明細、
クレジットカード明細、ETC利用明細、電子マネー/QR決済明細、
経費精算書、給与明細、売上集計表、支払通知書、
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
  "document_type": "receipt | invoice | bank_statement | credit_card | payroll | sales_report | medical | deduction | fixed_asset | loan | other",
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
      "transaction_type": "purchase | expense | asset | sales | fee | null",
      "transfer_fee_bearer": "sender | receiver | null",
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
- 上記以外の経費 → "expense"

【但書き (tategaki)】
- 「但し」「但」に続く文言を抽出`;
