import { GoogleGenAI } from '@google/genai';

// Gemini APIクライアントの初期化（新SDK: @google/genai）
if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY が設定されていません。OCR・仕訳生成が動作しません。');
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// 使用モデル（用途別に分離）
// OCR: Flash（高速・低コスト・マルチモーダルに強い）
// 仕訳生成: Pro（推論・判断に強い）
const GEMINI_MODEL_OCR = process.env.GEMINI_MODEL_OCR || 'gemini-3-flash-preview';
const GEMINI_MODEL_JOURNAL = process.env.GEMINI_MODEL_JOURNAL || 'gemini-3.1-pro-preview';

// ============================================
// 【追加】Gemini API リトライ + スロットリング
// 429(レート制限)/503(過負荷)/500(内部エラー)を自動リトライ
// 指数バックオフ: 1s → 2s → 4s → 8s
// スロットリング: リクエスト間の最小間隔を保証
// ============================================

const GEMINI_MAX_RETRIES = 4;
const GEMINI_MIN_INTERVAL_MS = 150; // 150ms = 最大約400 RPM
let lastGeminiCallTime = 0;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 【追加】Gemini API呼び出しをリトライ+スロットリング付きでラップ
 * @param fn - Gemini API呼び出し関数
 * @param label - ログ用ラベル（例: "OCR", "仕訳生成"）
 */
async function callGeminiWithRetry<T>(fn: () => Promise<T>, label: string = 'Gemini'): Promise<T> {
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    // 【追加】スロットリング: 前回のリクエストからの最小間隔を保証
    const now = Date.now();
    const elapsed = now - lastGeminiCallTime;
    if (elapsed < GEMINI_MIN_INTERVAL_MS) {
      await sleep(GEMINI_MIN_INTERVAL_MS - elapsed);
    }
    lastGeminiCallTime = Date.now();

    try {
      const result = await fn();
      return result;
    } catch (error: any) {
      const status = error?.status || error?.httpStatusCode || error?.code;
      const message = error?.message || String(error);

      // 【追加】リトライ対象のエラーかどうかを判定
      const isRetryable =
        status === 429 ||  // レート制限
        status === 503 ||  // サーバー過負荷
        status === 500 ||  // 内部エラー
        status === 408 ||  // タイムアウト
        message.includes('429') ||
        message.includes('503') ||
        message.includes('RESOURCE_EXHAUSTED') ||
        message.includes('UNAVAILABLE') ||
        message.includes('INTERNAL') ||
        message.includes('rate limit') ||
        message.includes('quota');

      if (isRetryable && attempt < GEMINI_MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s
        console.warn(`[${label}] ⚠️ リトライ ${attempt + 1}/${GEMINI_MAX_RETRIES} (${delay}ms後) - ${status || ''} ${message.slice(0, 100)}`);
        await sleep(delay);
        continue;
      }

      // 【追加】リトライ不可のエラー（400等）またはリトライ回数超過
      console.error(`[${label}] ❌ Gemini APIエラー (リトライ${isRetryable ? '回数超過' : '不可'}): ${status || ''} ${message.slice(0, 200)}`);
      throw error;
    }
  }
  throw new Error(`[${label}] 最大リトライ回数(${GEMINI_MAX_RETRIES})を超えました`);
}

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
- 支払方法は「現金」「カード」「振込」「電子マネー」等の記載から判定`;

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

    const extracted = JSON.parse(jsonText);

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

// ============================================
// AI仕訳生成サービス
// ============================================

/** 勘定科目マスタの簡易型（呼び出し元から渡す） */
export interface AccountItemRef {
  id: string;
  code: string;
  name: string;
  category: string;
}

/** 税区分マスタの簡易型（呼び出し元から渡す） */
export interface TaxCategoryRef {
  id: string;
  code: string;
  name: string;
  rate: number;
}

export interface JournalEntryInput {
  date: string;
  supplier: string;
  amount: number;
  tax_amount: number | null;
  tax_details: OCRTransaction['tax_details'];
  items: Array<{ name: string; amount: number; tax_rate?: number | null }> | null;
  payment_method: string | null;
  invoice_number: string | null;
  industry?: string;
  account_items: AccountItemRef[];
  tax_categories: TaxCategoryRef[];
}

/** AI が生成する仕訳明細行（DB構造に近い形） */
export interface GeneratedJournalLine {
  line_number: number;
  debit_credit: 'debit' | 'credit';
  account_item_name: string;
  tax_category_name: string | null;
  amount: number;
  tax_rate: number | null;
  tax_amount: number | null;
  description: string;
  supplier_name?: string | null;
  item_name?: string | null;
}

export interface GeneratedJournalEntry {
  category: '事業用' | 'プライベート';
  notes: string;
  confidence: number;
  reasoning: string;
  lines: GeneratedJournalLine[];
}

export async function generateJournalEntry(
  input: JournalEntryInput
): Promise<GeneratedJournalEntry> {
  try {
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

    const prompt = `あなたは日本の税理士のアシスタントAIです。以下の取引情報から適切な仕訳を生成してください。

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

【使用可能な勘定科目（この中から選んでください）】
${accountList}

【使用可能な税区分（この中から選んでください）】
${taxCategoryList}

【出力形式】
以下のJSON形式で返してください。JSONのみを返し、コードブロックや説明文は不要です。

{
  "category": "事業用" または "プライベート",
  "notes": "摘要（取引先名と品目を含める。例：ENEOS セルフ神戸北 ガソリン）",
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
      "supplier_name": "取引先名（証憑に記載されている企業名・店舗名）",
      "item_name": "品目名（取引の内容を表す品目。例: 駐車場代、ガソリン、携帯電話料金）"
    }
  ]
}

【仕訳ルール】
1. 借方（debit）と貸方（credit）の合計金額は必ず一致させること。
2. ${paymentHint}。
3. 品目ごとに勘定科目が異なる場合は、借方を複数行に分けること。
4. 軽減税率8%の品目（食品・飲料等）は8%用の税区分を選ぶこと。
5. インボイス番号がない場合、仕入税額控除の対象外となる可能性があるため、税区分の選択に注意すること。
6. 摘要は「取引先名 品目」の形式で、事務所の税理士が見て一目でわかるように書くこと。
7. 事業用かプライベートかは、取引先名・品目・業種から総合的に判断すること。
8. プライベートと判断した場合は、借方を「事業主貸」にすること。

【複合仕訳パターン】
複合仕訳が必要な場合は、以下のパターンを参考にlines配列に3行以上を含めてください:

パターンA（源泉所得税あり）:
  借方: 外注費 + 仮払消費税
  貸方: 普通預金 + 預り金（源泉所得税）

パターンB（家事按分）:
  借方: 該当科目（事業用分） + 事業主貸（私用分）
  貸方: 現金/未払金

パターンC（借入金返済）:
  借方: 借入金 + 支払利息
  貸方: 普通預金

パターンD（給与支払い）:
  借方: 給与手当
  貸方: 普通預金 + 預り金（所得税） + 預り金（住民税） + 預り金（社会保険料）

パターンE（報酬受取）:
  借方: 普通預金 + 事業主貸（源泉徴収分）
  貸方: 売上高 + 仮受消費税

パターンF（カード引落し精算）:
  借方: 未払金
  貸方: 普通預金

重要: 借方合計 = 貸方合計 を必ず守ること。
1円以上の差異がある場合は貸方最終行で調整し、requires_manual_review: true を設定すること。

JSONのみを返してください。`;

    // 【編集】リトライ+スロットリング付きでGemini呼び出し
    const result = await callGeminiWithRetry(() => ai.models.generateContent({
      model: GEMINI_MODEL_JOURNAL,
      contents: prompt,
    }), '仕訳生成');

    const text = result.text ?? '';

    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/) || text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;

    const generated = JSON.parse(jsonText);

    const lines: GeneratedJournalLine[] = (generated.lines || []).map((line: any, idx: number) => ({
      line_number: line.line_number ?? idx + 1,
      debit_credit: line.debit_credit || 'debit',
      account_item_name: line.account_item_name || '雑費',
      tax_category_name: line.tax_category_name || null,
      amount: Number(line.amount) || 0,
      tax_rate: line.tax_rate ?? null,
      tax_amount: line.tax_amount != null ? Number(line.tax_amount) : null,
      description: line.description || '',
      supplier_name: line.supplier_name || null,
      item_name: line.item_name || null,
    }));

    if (lines.length === 0) {
      lines.push(
        {
          line_number: 1,
          debit_credit: 'debit',
          account_item_name: '雑費',
          tax_category_name: input.tax_amount ? '課対仕入10%' : null,
          amount: input.amount,
          tax_rate: input.tax_amount ? 0.10 : null,
          tax_amount: input.tax_amount,
          description: `${input.supplier}`,
        },
        {
          line_number: 2,
          debit_credit: 'credit',
          account_item_name: input.payment_method === 'credit_card' ? '未払金' : '現金',
          tax_category_name: null,
          amount: input.amount,
          tax_rate: null,
          tax_amount: null,
          description: `${input.supplier}`,
        }
      );
    }

    return {
      category: generated.category || '事業用',
      notes: generated.notes || `${input.supplier}`,
      confidence: generated.confidence ?? 0.7,
      reasoning: generated.reasoning || '自動判定',
      lines,
    };
  } catch (error) {
    console.error('仕訳生成エラー:', error);

    return {
      category: '事業用',
      notes: `${input.supplier}`,
      confidence: 0.3,
      reasoning: `AI判定失敗 - デフォルト値を使用（${error instanceof Error ? error.message : String(error)}）`,
      lines: [
        {
          line_number: 1,
          debit_credit: 'debit',
          account_item_name: '雑費',
          tax_category_name: input.tax_amount ? '課対仕入10%' : null,
          amount: input.amount,
          tax_rate: input.tax_amount ? 0.10 : null,
          tax_amount: input.tax_amount,
          description: `${input.supplier}`,
        },
        {
          line_number: 2,
          debit_credit: 'credit',
          account_item_name: input.payment_method === 'credit_card' ? '未払金' : '現金',
          tax_category_name: null,
          amount: input.amount,
          tax_rate: null,
          tax_amount: null,
          description: `${input.supplier}`,
        },
      ],
    };
  }
}

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
  industry_ids: string[];           // クライアントに紐づく業種ID一覧
  industry_ids_with_ancestors: string[];  // 業種ID + 全祖先ID（industry_closureから取得）
  industry_depths: Map<string, number>;   // industry_id → depth（0=自身, 1=親, 2=祖父...）
  payment_method?: string | null;
  item_name?: string | null;        // 品目名
  document_type?: string | null;    // 証憑種別コード
  has_invoice_number?: boolean | null;
  tax_rate_hint?: number | null;    // OCR読取税率
  is_internal_tax?: boolean | null;
  frequency_hint?: string | null;   // 'recurring' / 'one_time'
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
 * industry scopeの階層遡り:
 *   industry_closureで取得した全祖先IDリストを使い、
 *   depthの昇順（最も具体的な階層が先）でルールを検索。
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

  // 2. industry scope: 業種別ルール（depth昇順 = 具体的な階層が先）
  const industryRules = activeRules
    .filter(r => r.scope === 'industry' && r.industry_id && input.industry_ids_with_ancestors.includes(r.industry_id))
    .sort((a, b) => {
      // depthが小さい（=より具体的）方を優先
      const depthA = input.industry_depths.get(a.industry_id!) ?? 999;
      const depthB = input.industry_depths.get(b.industry_id!) ?? 999;
      if (depthA !== depthB) return depthA - depthB;
      // 同一depth内ではpriorityで比較
      return a.priority - b.priority;
    });

  // 3. shared scope: 汎用ルール
  const sharedRules = activeRules
    .filter(r => r.scope === 'shared')
    .sort((a, b) => a.priority - b.priority);

  // 優先順位: client > industry(depth昇順) > shared
  const orderedRules = [...clientRules, ...industryRules, ...sharedRules];

  for (const rule of orderedRules) {
    if (matchesConditions(rule.conditions, input)) {
      if (!rule.actions.account_item_id) continue;

      console.log(`[ルールマッチ] ✅ マッチ: "${rule.rule_name}" (priority=${rule.priority}, scope=${rule.scope}, industry_depth=${rule.industry_id ? input.industry_depths.get(rule.industry_id) : 'N/A'})`);

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
        confidence: 0.95,
      };
    }
  }

  console.log(`[ルールマッチ] ルールマッチなし → Gemini AI にフォールバック`);
  return null;
}

/**
 * ルールの conditions が入力にマッチするか判定
 */
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

    // 取引先マッチング（名前→完全一致→部分一致→エイリアス）
    let supplierId: string | null = null;
    const sName = line.supplier_name;
    if (sName && suppliers) {
      const exact = suppliers.find(s => s.name === sName);
      if (exact) { supplierId = exact.id; }
      else {
        const partial = suppliers.find(s => sName.includes(s.name) || s.name.includes(sName));
        if (partial) { supplierId = partial.id; }
        else if (supplierAliases) {
          const alias = supplierAliases.find(a => sName.includes(a.alias_name) || a.alias_name.includes(sName));
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
};

// ============================================
// freee連携サービス（スタブ）
// ============================================

export interface FreeeTransaction {
  issue_date: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  account_item_id: number;
  tax_code: number;
}

export async function exportToFreee(transactions: FreeeTransaction[]): Promise<{
  success: boolean;
  message: string;
  exported_count: number;
}> {
  // TODO: 実際のfreee API連携を実装
  console.log('freeeエクスポート（スタブ）:', transactions.length, '件');

  return {
    success: true,
    message: 'freee連携は実装予定です',
    exported_count: transactions.length,
  };
}