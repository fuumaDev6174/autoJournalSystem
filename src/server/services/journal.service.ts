import { ai, GEMINI_MODEL_JOURNAL, callGeminiWithRetry } from '../../adapters/gemini/gemini.client.js';
import type { OCRTransaction } from './ocr.service.js';

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
  // 追加フィールド（5項目 — addresseeは仕訳生成に不要なので除外）
  tategaki?: string | null;
  withholding_tax_amount?: number | null;
  invoice_qualification?: string | null;
  transaction_type?: string | null;
  transfer_fee_bearer?: string | null;
  correction_hints?: Array<{ supplier: string; original: string; corrected: string; count: number }>;
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
9. 源泉徴収税額がある場合、以下の複合仕訳を生成すること:
   借方: 外注費（税込本体額）
   貸方: 普通預金（源泉徴収税額を差し引いた振込額）+ 預り金（源泉徴収税額）
   ※ 源泉徴収税額 = withholding_tax_amount の値をそのまま使用。逆算しないこと。
10. 区分記載請求書（invoice_qualification が kubun_kisai）の場合は、仕入税額控除の経過措置を考慮し、適切な税区分（非適格80%控除等）を選ぶこと。適格請求書なら通常の課税仕入の税区分を選ぶこと。
11. 振込手数料が当方負担（transfer_fee_bearer が receiver）の場合は、支払手数料の仕訳行を追加すること（通常440円〜660円程度）。先方負担の場合は請求額から手数料を差し引いた金額を貸方に計上すること。
12. transaction_type が asset（資産取得）の場合は、借方の勘定科目を「工具器具備品」「ソフトウェア」等の資産科目にすること。entry_type_hint を fixed_asset と判断すること。

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

    let generated;
    try {
      generated = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[仕訳生成] JSON parse失敗。Geminiの生レスポンス:', text.slice(0, 500));
      throw new Error(`Gemini応答のJSON解析に失敗: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

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
