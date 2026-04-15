/**
 * @module 不足書類チェッカー
 * クライアント属性と提出済み書類から、必須/推奨の不足書類を判定する。
 */

import { supabaseAdmin } from '../../adapters/supabase/supabase-admin.client.js';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface MissingDoc {
  code: string;
  label: string;
  reason: string;
}

export interface MissingDocsResult {
  required: MissingDoc[];
  recommended: MissingDoc[];
  submittedCodes: string[];
}

interface ClientAttrs {
  tax_category: '原則課税' | '簡易課税' | '免税';
  invoice_registered: boolean;
  industry_code: string | null;
}

interface DocRule {
  code: string;
  label: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// 書類コード → 日本語ラベル
// ---------------------------------------------------------------------------

const CODE_LABELS: Record<string, string> = {
  bank_statement: '銀行通帳・入出金明細',
  receipt: 'レシート/領収書',
  mynumber: 'マイナンバーカード',
  kaigyo: '開業届',
  aoiro: '青色申告承認申請書',
  prev_return: '前年の確定申告書',
  invoice_reg: 'インボイス登録通知書',
  kanizei: '簡易課税届出書',
  realestate_inc: '不動産収入明細',
  payroll: '給与明細・賃金台帳',
  issued_invoice: '発行済み請求書',
  recv_invoice: '受領請求書',
  credit_card: 'クレジットカード利用明細',
  utility_bill: '水道光熱費・通信費の請求書',
  tax_receipt: '税金・社会保険料の納付済領収書',
  chintai: '賃貸借契約書',
  kokuho: '国民健康保険料納付証明書',
  nenkin: '国民年金保険料控除証明書',
  shokibo: '小規模企業共済掛金証明書',
  ideco: 'iDeCo払込証明書',
  life_insurance: '生命保険料控除証明書',
  earthquake_ins: '地震保険料控除証明書',
  medical: '医療費の領収書・通知書',
  furusato: 'ふるさと納税受領証明書',
  housing_loan: '住宅ローン控除証明書',
  payment_record: '入金記録',
  payment_statement: '支払調書',
  platform_csv: 'プラットフォーム売上CSV',
  sales_report: '売上集計表/レジ日報',
  etc_statement: 'ETC利用明細',
  expense_report: '経費精算書',
  inventory: '棚卸表',
  fixed_asset: '固定資産台帳',
  loan_schedule: '借入金返済予定表',
  senjusha: '専従者届出書',
  gaichuu: '外注契約書',
  shaken: '車検証',
  insurance_policy: '保険証券',
  fudosan_contract: '不動産売買契約書',
  tanaoroshi_method: '棚卸資産の評価方法届出書',
  shoukyaku_method: '減価償却資産の償却方法届出書',
  registry: '登記簿謄本',
};

// ---------------------------------------------------------------------------
// 経費系コード（いずれか1件あれば「経費証拠あり」とみなす）
// ---------------------------------------------------------------------------

const EXPENSE_CODES = [
  'receipt', 'pdf_invoice', 'recv_invoice', 'invoice',
  'credit_card', 'e_money_statement', 'etc_statement', 'expense_report',
];

// 不動産系の業種コード（industry.code がこれに該当すれば不動産系）
const REALESTATE_INDUSTRY_CODES = ['realestate', 'fudosan'];
// 小売・卸売・製造系
const INVENTORY_INDUSTRY_CODES = ['retail', 'wholesale', 'manufacturing'];
// 飲食・小売系（売上集計が推奨）
const SALES_REPORT_INDUSTRY_CODES = ['restaurant', 'retail', 'cafe'];
// EC/プラットフォーム系
const PLATFORM_INDUSTRY_CODES = ['ec', 'platform'];
// 運送・建設・営業系（車両保有が多い）
const VEHICLE_INDUSTRY_CODES = ['transport', 'construction', 'sales'];

// ---------------------------------------------------------------------------
// 必須書類リスト生成
// ---------------------------------------------------------------------------

function buildRequiredDocs(client: ClientAttrs, submitted: Set<string>): DocRule[] {
  const rules: DocRule[] = [];

  rules.push({ code: 'bank_statement', label: CODE_LABELS['bank_statement'], reason: '事業用口座の入出金記録は記帳の基本です' });
  rules.push({ code: 'mynumber', label: CODE_LABELS['mynumber'], reason: '確定申告書にマイナンバーの記載が必要です' });
  rules.push({ code: 'kaigyo', label: CODE_LABELS['kaigyo'], reason: '開業届の控えは事業の証明に必要です' });
  rules.push({ code: 'aoiro', label: CODE_LABELS['aoiro'], reason: '青色申告承認申請書の控えは申告種別の確認に必要です' });
  rules.push({ code: 'prev_return', label: CODE_LABELS['prev_return'], reason: '繰越損失・予定納税額の参照に必要です' });

  // 経費証拠が1件もない場合
  const hasExpense = EXPENSE_CODES.some(c => submitted.has(c));
  if (!hasExpense) {
    rules.push({ code: 'receipt', label: CODE_LABELS['receipt'], reason: '経費の証拠書類が1件も提出されていません' });
  }

  // 条件付き必須
  if (client.invoice_registered) {
    rules.push({ code: 'invoice_reg', label: CODE_LABELS['invoice_reg'], reason: 'インボイス登録済みのため登録通知書が必要です' });
  }
  if (client.tax_category === '簡易課税') {
    rules.push({ code: 'kanizei', label: CODE_LABELS['kanizei'], reason: '簡易課税選択のため届出書が必要です' });
  }
  if (isIndustry(client, REALESTATE_INDUSTRY_CODES)) {
    rules.push({ code: 'realestate_inc', label: CODE_LABELS['realestate_inc'], reason: '不動産業のため収入明細が必要です' });
  }
  // 専従者届出があるなら給与明細は必須
  if (submitted.has('senjusha')) {
    rules.push({ code: 'payroll', label: CODE_LABELS['payroll'], reason: '専従者届出が提出済みのため給与明細が必要です' });
  }

  return rules;
}

// ---------------------------------------------------------------------------
// 推奨書類リスト生成
// ---------------------------------------------------------------------------

function buildRecommendedDocs(client: ClientAttrs, submitted: Set<string>): DocRule[] {
  const rules: DocRule[] = [];

  // --- デフォルト推奨（全クライアント） ---
  rules.push({ code: 'issued_invoice', label: CODE_LABELS['issued_invoice'], reason: '売上の証拠として請求書の控えがあると安心です' });
  rules.push({ code: 'recv_invoice', label: CODE_LABELS['recv_invoice'], reason: '仕入・外注費がある場合に必要です' });
  rules.push({ code: 'credit_card', label: CODE_LABELS['credit_card'], reason: 'クレカ経費の漏れ防止に有効です' });
  rules.push({ code: 'utility_bill', label: CODE_LABELS['utility_bill'], reason: '事業用の水道光熱費・通信費の証拠になります' });
  rules.push({ code: 'tax_receipt', label: CODE_LABELS['tax_receipt'], reason: '税金・社会保険料の納付証拠として必要です' });
  rules.push({ code: 'chintai', label: CODE_LABELS['chintai'], reason: '事務所の賃貸借契約書は地代家賃の根拠になります' });

  // --- 所得控除系（全クライアント推奨） ---
  rules.push({ code: 'kokuho', label: CODE_LABELS['kokuho'], reason: '社会保険料控除の適用に必要です' });
  rules.push({ code: 'nenkin', label: CODE_LABELS['nenkin'], reason: '社会保険料控除の適用に必要です' });
  rules.push({ code: 'shokibo', label: CODE_LABELS['shokibo'], reason: '小規模企業共済等掛金控除の適用に必要です' });
  rules.push({ code: 'ideco', label: CODE_LABELS['ideco'], reason: 'iDeCo掛金控除の適用に必要です' });
  rules.push({ code: 'life_insurance', label: CODE_LABELS['life_insurance'], reason: '生命保険料控除の適用に必要です' });
  rules.push({ code: 'earthquake_ins', label: CODE_LABELS['earthquake_ins'], reason: '地震保険料控除の適用に必要です' });
  rules.push({ code: 'medical', label: CODE_LABELS['medical'], reason: '医療費控除（年間10万円超）の適用に必要です' });
  rules.push({ code: 'furusato', label: CODE_LABELS['furusato'], reason: 'ふるさと納税の寄附金控除の適用に必要です' });
  rules.push({ code: 'housing_loan', label: CODE_LABELS['housing_loan'], reason: '住宅ローン控除の適用に必要です' });

  // --- 提出済み書類から推測する条件付き推奨 ---
  if (submitted.has('issued_invoice')) {
    rules.push({ code: 'payment_record', label: CODE_LABELS['payment_record'], reason: '請求書が提出済みのため入金確認書類があると照合できます' });
  }
  if (submitted.has('recv_invoice') || submitted.has('payment_notice')) {
    rules.push({ code: 'payment_statement', label: CODE_LABELS['payment_statement'], reason: '外注費の支払調書で源泉徴収額を確認できます' });
    rules.push({ code: 'gaichuu', label: CODE_LABELS['gaichuu'], reason: '外注先がいる場合は契約書があると安心です' });
  }
  if (submitted.has('shaken')) {
    rules.push({ code: 'etc_statement', label: CODE_LABELS['etc_statement'], reason: '車両保有のためETC利用明細があれば経費計上できます' });
    rules.push({ code: 'fixed_asset', label: CODE_LABELS['fixed_asset'], reason: '車両は減価償却対象のため固定資産台帳が必要です' });
  }
  if (submitted.has('payroll')) {
    rules.push({ code: 'senjusha', label: CODE_LABELS['senjusha'], reason: '給与を支払っている場合は専従者届出が必要な場合があります' });
    rules.push({ code: 'expense_report', label: CODE_LABELS['expense_report'], reason: '従業員がいる場合は経費精算書の提出が推奨されます' });
  }
  if (submitted.has('life_insurance') || submitted.has('earthquake_ins')) {
    rules.push({ code: 'insurance_policy', label: CODE_LABELS['insurance_policy'], reason: '控除証明書と併せて保険証券があると確認がスムーズです' });
  }
  if (submitted.has('realestate_inc') || submitted.has('fudosan_contract')) {
    rules.push({ code: 'fudosan_contract', label: CODE_LABELS['fudosan_contract'], reason: '不動産収入がある場合は売買契約書が必要です' });
    rules.push({ code: 'registry', label: CODE_LABELS['registry'], reason: '不動産の登記簿謄本があると物件情報を確認できます' });
  }
  if (submitted.has('housing_loan')) {
    rules.push({ code: 'loan_schedule', label: CODE_LABELS['loan_schedule'], reason: '住宅ローン控除に返済予定表があると正確に計算できます' });
  }
  if (submitted.has('inventory')) {
    rules.push({ code: 'tanaoroshi_method', label: CODE_LABELS['tanaoroshi_method'], reason: '棚卸を行う場合は評価方法の届出が推奨されます' });
  }
  if (submitted.has('fixed_asset')) {
    rules.push({ code: 'shoukyaku_method', label: CODE_LABELS['shoukyaku_method'], reason: '固定資産がある場合は償却方法の届出が推奨されます' });
  }

  // --- 業種による条件付き推奨 ---
  if (isIndustry(client, PLATFORM_INDUSTRY_CODES)) {
    rules.push({ code: 'platform_csv', label: CODE_LABELS['platform_csv'], reason: 'EC/プラットフォーム事業のため売上CSVが推奨されます' });
  }
  if (isIndustry(client, SALES_REPORT_INDUSTRY_CODES)) {
    rules.push({ code: 'sales_report', label: CODE_LABELS['sales_report'], reason: '飲食/小売業のため売上集計表が推奨されます' });
  }
  if (isIndustry(client, INVENTORY_INDUSTRY_CODES)) {
    rules.push({ code: 'inventory', label: CODE_LABELS['inventory'], reason: '小売/卸売/製造業のため期末棚卸が推奨されます' });
  }
  if (isIndustry(client, VEHICLE_INDUSTRY_CODES)) {
    rules.push({ code: 'shaken', label: CODE_LABELS['shaken'], reason: '車両を使用する業種のため車検証が推奨されます' });
  }

  return rules;
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function isIndustry(client: ClientAttrs, codes: string[]): boolean {
  return client.industry_code !== null && codes.includes(client.industry_code);
}

// ---------------------------------------------------------------------------
// メインAPI
// ---------------------------------------------------------------------------

export async function checkMissingDocs(
  clientId: string,
  organizationId: string,
): Promise<MissingDocsResult> {
  // クライアント情報取得
  const { data: clientRow } = await supabaseAdmin
    .from('clients')
    .select('tax_category, invoice_registered, industry_id')
    .eq('id', clientId)
    .eq('organization_id', organizationId)
    .single();

  if (!clientRow) throw new Error('クライアントが見つかりません');

  // 業種コード取得
  let industryCode: string | null = null;
  if (clientRow.industry_id) {
    const { data: ind } = await supabaseAdmin
      .from('industries')
      .select('code')
      .eq('id', clientRow.industry_id)
      .single();
    industryCode = ind?.code ?? null;
  }

  const attrs: ClientAttrs = {
    tax_category: clientRow.tax_category,
    invoice_registered: clientRow.invoice_registered,
    industry_code: industryCode,
  };

  // 提出済み書類コードを取得（DISTINCT ocr_step1_type）
  const { data: docs } = await supabaseAdmin
    .from('documents')
    .select('ocr_step1_type')
    .eq('client_id', clientId)
    .not('ocr_step1_type', 'is', null);

  const submittedCodes = [...new Set((docs ?? []).map(d => d.ocr_step1_type as string))];
  const submitted = new Set(submittedCodes);

  // 必須/推奨リスト生成
  const requiredRules = buildRequiredDocs(attrs, submitted);
  const recommendedRules = buildRecommendedDocs(attrs, submitted);

  // 提出済みを除外 + 重複コード除去
  const seen = new Set<string>();
  const filterMissing = (rules: DocRule[]): MissingDoc[] => {
    const result: MissingDoc[] = [];
    for (const r of rules) {
      if (!submitted.has(r.code) && !seen.has(r.code)) {
        seen.add(r.code);
        result.push({ code: r.code, label: r.label, reason: r.reason });
      }
    }
    return result;
  };

  // 必須を先に処理（必須に入ったコードは推奨に重複表示しない）
  const required = filterMissing(requiredRules);
  const recommended = filterMissing(recommendedRules);

  return { required, recommended, submittedCodes };
}
