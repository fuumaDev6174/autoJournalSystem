import { ai, GEMINI_MODEL_OCR, GEMINI_MODEL_JOURNAL, callGeminiWithRetry } from '../../adapters/gemini/gemini.client.js';

// ============================================
// OCRサービス - 画像から文字を抽出
// ============================================

/** OCR で抽出する各取引の型 */
export interface OCRTransaction {
  date: string | null;
  supplier: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  tax_details: {
    rate_10_amount: number | null;
    rate_10_tax: number | null;
    rate_8_amount: number | null;
    rate_8_tax: number | null;
    exempt_amount: number | null;
  } | null;
  tax_included: boolean;
  payment_method: string | null;
  invoice_number: string | null;
  reference_number: string | null;
  items: Array<{
    name: string;
    quantity: number | null;
    unit_price: number | null;
    amount: number;
    tax_rate: number | null;
  }>;
  // 追加フィールド（6項目）
  tategaki: string | null;                                        // 但書き「但し、〇〇代として」
  withholding_tax_amount: number | null;                          // 源泉徴収税額
  invoice_qualification: 'qualified' | 'kubun_kisai' | null;     // 適格請求書 / 区分記載請求書
  addressee: string | null;                                       // 宛名（〇〇様、〇〇御中）
  transaction_type: 'purchase' | 'expense' | 'asset' | 'sales' | 'fee' | null;  // 取引種類
  transfer_fee_bearer: 'sender' | 'receiver' | null;             // 振込手数料負担
}

export interface OCRResult {
  raw_text: string;
  document_type: 'receipt' | 'invoice' | 'bank_statement' | 'credit_card' | 'other';
  transactions: OCRTransaction[];
  // 後続処理との互換性のため、先頭取引の代表値も保持
  extracted_date: string | null;
  extracted_supplier: string | null;
  extracted_amount: number | null;
  extracted_tax_amount: number | null;
  extracted_items: Array<{
    name: string;
    quantity?: number;
    unit_price?: number;
    amount: number;
    tax_rate?: number;
  }> | null;
  extracted_payment_method: string | null;
  extracted_invoice_number: string | null;
  // 追加の代表値（6項目）
  extracted_tategaki: string | null;
  extracted_withholding_tax: number | null;
  extracted_invoice_qualification: string | null;
  extracted_addressee: string | null;
  extracted_transaction_type: string | null;
  extracted_transfer_fee_bearer: string | null;
  confidence_score: number;
}

/**
 * Step 1: 証憑種別の自動判定（Gemini Flash）
 * 証憑画像をGemini Flashに送り、document_typesの25種別から最適なものを判定。
 * confidence >= 0.8 かつ requires_journal=false なら、Step 2（フルOCR）をスキップ可能。
 */
export async function classifyDocument(
  imageBase64: string,
  mimeType: string
): Promise<{
  document_type_code: string;
  confidence: number;
  estimated_lines: number;
  description: string;
}> {
  const prompt = `あなたは日本の税理士事務所で使われる証憑分類AIです。
以下の画像を分析し、証憑の種別を判定してください。

選択肢（codeで回答）:
【仕訳対象】
receipt: レシート/領収書
invoice: 請求書
bank_statement: 銀行通帳
credit_card: クレカ明細
etc_statement: ETC利用明細
e_money_statement: 電子マネー/QR決済
expense_report: 経費精算書
payroll: 給与明細
sales_report: 売上集計表/レジ日報
payment_notice: 支払通知書
other_journal: その他仕訳対象

【非仕訳対象】
medical: 医療費
deduction_cert: 控除証明書
housing_loan: 住宅ローン
mynumber: マイナンバー
id_card: 免許証/保険証
other_deduction: その他控除
contract: 契約書
estimate: 見積書
purchase_order: 発注書
delivery_note: 納品書
insurance_policy: 保険証券
registry: 登記簿謄本
minutes: 議事録
other_ref: その他書類

以下のJSON形式で回答してください（JSON以外は出力しないでください）:
{
  "document_type_code": "receipt",
  "confidence": 0.95,
  "estimated_lines": 1,
  "description": "コンビニのレシート"
}

- confidence: 0.0〜1.0の確信度
- estimated_lines: 推定取引行数（レシート=1、通帳=複数行）
- description: 簡潔な説明`;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: GEMINI_MODEL_OCR,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: prompt },
          ],
        },
      ],
    }), '証憑分類');

    const text = response.text?.replace(/```json\n?|```\n?/g, '').trim() || '';
    const parsed = JSON.parse(text);
    return {
      document_type_code: parsed.document_type_code || 'other_ref',
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
      estimated_lines: parsed.estimated_lines || 1,
      description: parsed.description || '',
    };
  } catch (error) {
    console.error('[classifyDocument] 証憑種別判定エラー:', error);
    return {
      document_type_code: 'other_journal',
      confidence: 0.3,
      estimated_lines: 1,
      description: 'AI判定失敗',
    };
  }
}

export async function processOCR(imageUrl: string): Promise<OCRResult> {
  try {
    // URL から画像を取得して Base64 エンコード
    const fetchRes = await fetch(imageUrl);
    if (!fetchRes.ok) {
      throw new Error(`画像の取得に失敗しました: ${fetchRes.status}`);
    }
    const arrayBuffer = await fetchRes.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';

    // MIMEタイプを URL または Content-Type から推定
    const ext = imageUrl.split('?')[0].split('.').pop()?.toLowerCase();
    const mimeType =
      ext === 'pdf' || contentType.includes('pdf')
        ? 'application/pdf'
        : ext === 'png' || contentType.includes('png')
        ? 'image/png'
        : ext === 'webp' || contentType.includes('webp')
        ? 'image/webp'
        : 'image/jpeg';

    const prompt = `あなたは日本の経理書類を読み取る専門AIです。
この画像はレシート、領収書、請求書、通帳、またはクレジットカード明細です。
以下の情報を正確に抽出してJSON形式で返してください。

【重要ルール】
- 通帳・クレジットカード明細など複数の取引が含まれる場合は、transactions 配列に各取引を個別のオブジェクトとして列挙してください。
- レシート・領収書など単一取引の場合も transactions 配列に1件として格納してください。
- 日付は必ず YYYY-MM-DD 形式に変換してください（和暦は西暦に変換）。
- 金額は数値のみ（カンマなし）で返してください。
- 消費税が記載されていない場合は null にしてください（逆算不要）。
- 品目が読み取れない場合は items を空配列にしてください。
- JSONのみを返し、他の説明文やマークダウンのコードブロックは含めないでください。

{
  "document_type": "receipt" | "invoice" | "bank_statement" | "credit_card" | "other",
  "confidence": 0.0〜1.0（読み取り全体の確信度。鮮明なら0.9以上、不鮮明なら0.5以下）,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "supplier": "取引先名・店舗名（正式名称で）",
      "total_amount": 合計金額（数値のみ）,
      "tax_amount": 消費税額合計（数値のみ、不明ならnull）,
      "tax_details": {
        "rate_10_amount": 10%対象の税抜金額（不明ならnull）,
        "rate_10_tax": 10%の消費税額（不明ならnull）,
        "rate_8_amount": 8%対象の税抜金額（不明ならnull）,
        "rate_8_tax": 8%の消費税額（不明ならnull）,
        "exempt_amount": 非課税金額（不明ならnull）
      },
      "tax_included": true（内税）またはfalse（外税）,
      "payment_method": "cash" | "credit_card" | "bank_transfer" | "e_money" | "other" | null,
      "invoice_number": "インボイス登録番号（Tから始まる番号、なければnull）",
      "reference_number": "伝票番号・取引番号（なければnull）",
      "tategaki": "但書き（領収書の「但し、〇〇代として」の部分。なければnull）",
      "withholding_tax_amount": 源泉徴収税額（報酬請求書に「源泉徴収税額」「源泉所得税」として記載されている金額。数値のみ。なければnull）,
      "invoice_qualification": "qualified"（「適格請求書」と明記 or T+13桁番号あり）| "kubun_kisai"（「区分記載請求書」と明記）| null,
      "addressee": "宛名（「〇〇様」「〇〇御中」の部分。なければnull）",
      "transaction_type": "purchase"（仕入）| "expense"（経費）| "asset"（10万円以上の備品・機器等の資産取得）| "sales"（売上）| "fee"（報酬・委託料）| null,
      "transfer_fee_bearer": "sender"（「振込手数料は差し引いてお支払い」等→先方負担）| "receiver"（「振込手数料はご負担ください」等→当方負担）| null,
      "items": [
        {
          "name": "商品名・摘要",
          "quantity": 数量（不明ならnull）,
          "unit_price": 単価（不明ならnull）,
          "amount": 金額（数値のみ）,
          "tax_rate": 0.10 | 0.08 | 0（税率。※マークがあれば0.08、不明ならnull）
        }
      ]
    }
  ]
}

【判定のヒント】
- レシートに「※」や「＊」マークがある品目は軽減税率8%対象（食品・飲料）
- 「T」で始まる13桁の番号はインボイス登録番号
- 「内税」「税込」表記があれば tax_included: true
- 「外税」「税抜」表記があれば tax_included: false
- 支払方法は「現金」「カード」「振込」「電子マネー」等の記載から判定
- 「但し」「但」に続く文言は但書き（tategaki）として抽出
- 報酬の請求書に「源泉徴収税額」「源泉所得税」の記載がある場合はその金額を withholding_tax_amount に設定
- 「適格請求書」と明記されているか、T+13桁の番号がある場合は invoice_qualification: "qualified"
- 「区分記載請求書」と明記されている場合は invoice_qualification: "kubun_kisai"
- 「振込手数料はご負担ください」「手数料貴社負担」→ transfer_fee_bearer: "receiver"
- 「振込手数料を差し引いてお振込みください」「手数料弊社負担」→ transfer_fee_bearer: "sender"
- 10万円以上の備品・機器・ソフトウェア等は transaction_type: "asset"
- 外注費・業務委託料は transaction_type: "fee"
- 仕入（商品購入・材料費）は transaction_type: "purchase"
- 上記以外の経費は transaction_type: "expense"
- 売上・請求（自社が発行した請求書）は transaction_type: "sales"`;

    // 【編集】リトライ+スロットリング付きでGemini呼び出し
    const result = await callGeminiWithRetry(() => ai.models.generateContent({
      model: GEMINI_MODEL_OCR,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
    }), 'OCR');

    const text = result.text ?? '';

    // JSONを抽出（マークダウンコードブロックを除去）
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/) || text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;

    let extracted;
    try {
      extracted = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[OCR] JSON parse失敗。Geminiの生レスポンス:', text.slice(0, 500));
      throw new Error(`Gemini応答のJSON解析に失敗: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // transactions 配列の正規化
    const transactions: OCRTransaction[] = (extracted.transactions || []).map((tx: any) => ({
      date: tx.date || null,
      supplier: tx.supplier || null,
      total_amount: tx.total_amount != null ? Number(tx.total_amount) : null,
      tax_amount: tx.tax_amount != null ? Number(tx.tax_amount) : null,
      tax_details: tx.tax_details || null,
      tax_included: tx.tax_included ?? true,
      payment_method: tx.payment_method || null,
      invoice_number: tx.invoice_number || null,
      reference_number: tx.reference_number || null,
      items: (tx.items || []).map((item: any) => ({
        name: item.name || '',
        quantity: item.quantity ?? null,
        unit_price: item.unit_price ?? null,
        amount: Number(item.amount) || 0,
        tax_rate: item.tax_rate ?? null,
      })),
      tategaki: tx.tategaki || null,
      withholding_tax_amount: tx.withholding_tax_amount != null ? Number(tx.withholding_tax_amount) : null,
      invoice_qualification: tx.invoice_qualification || null,
      addressee: tx.addressee || null,
      transaction_type: tx.transaction_type || null,
      transfer_fee_bearer: tx.transfer_fee_bearer || null,
    }));

    // 先頭取引を代表値として使用
    const firstTx = transactions[0] || ({} as OCRTransaction);

    return {
      raw_text: text,
      document_type: extracted.document_type || 'other',
      transactions,
      extracted_date: firstTx.date || null,
      extracted_supplier: firstTx.supplier || null,
      extracted_amount: firstTx.total_amount ?? null,
      extracted_tax_amount: firstTx.tax_amount ?? null,
      extracted_items: firstTx.items?.length
        ? firstTx.items.map((i) => ({
            name: i.name,
            quantity: i.quantity ?? undefined,
            unit_price: i.unit_price ?? undefined,
            amount: i.amount,
            tax_rate: i.tax_rate ?? undefined,
          }))
        : null,
      extracted_payment_method: firstTx.payment_method || null,
      extracted_invoice_number: firstTx.invoice_number || null,
      extracted_tategaki: firstTx.tategaki || null,
      extracted_withholding_tax: firstTx.withholding_tax_amount ?? null,
      extracted_invoice_qualification: firstTx.invoice_qualification || null,
      extracted_addressee: firstTx.addressee || null,
      extracted_transaction_type: firstTx.transaction_type || null,
      extracted_transfer_fee_bearer: firstTx.transfer_fee_bearer || null,
      confidence_score: extracted.confidence ?? 0.85,
    };
  } catch (error) {
    console.error('OCR処理エラー:', error);
    throw new Error(`OCR処理に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================
// 明細分割エンジン: statement_extract パターン
// ============================================

/**
 * 明細分割エンジン: statement_extract パターンの証憑から複数取引を抽出
 * 通帳、クレカ明細、ETC明細、経費精算書等に使用。
 * Gemini Proに全ページ画像を一括送信→各行のデータを配列で返却。
 */
export async function extractMultipleEntries(
  imageBase64: string,
  mimeType: string,
  documentType: string,
  industryPath?: string
): Promise<Array<{
  date: string;
  description: string;
  amount: number;
  counterparty: string | null;
  is_income: boolean;
  suggested_account_name: string | null;
  tax_rate: number | null;
  confidence: number;
}>> {
  const typeHints: Record<string, string> = {
    bank_statement: '銀行通帳の入出金明細です。各行の日付・摘要・入金額または出金額を抽出してください。',
    credit_card: 'クレジットカードの利用明細です。各行の利用日・利用先・金額を抽出してください。',
    etc_statement: 'ETC利用明細です。各行の利用日・IC名・金額を抽出してください。',
    e_money_statement: '電子マネー/QR決済の利用明細です。各行の日付・利用先・金額を抽出してください。',
    expense_report: '経費精算書です。各行の日付・項目・金額を抽出してください。',
  };

  const hint = typeHints[documentType] || '明細書です。各行のデータを抽出してください。';
  const industryContext = industryPath ? `\n- 業種階層: ${industryPath}` : '';

  const prompt = `あなたは日本の税理士事務所のOCR解析AIです。
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

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: GEMINI_MODEL_JOURNAL,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      }],
    }), '明細分割');

    const text = response.text?.replace(/```json\n?|```\n?/g, '').trim() || '[]';
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.error('[extractMultipleEntries] 明細分割エラー:', error);
    return [];
  }
}
