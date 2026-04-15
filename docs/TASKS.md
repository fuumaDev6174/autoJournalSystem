# タスク管理

> 完了タスクは1行サマリーのみ。未完了は詳細記載。

---

## 完了済み

- ✅ BE-1: master-data.ts 解体（19ファイル直接import化）
- ✅ BE-2: journal.generate.ts → パイプラインサービス抽出（380行→50行）
- ✅ BE-3: journal.crud.ts 分割（252行→3ファイル: journal.crud.ts + journal-lines.crud.ts + journal.operations.ts）
- ✅ BE-4: document.ocr.ts → パイプラインサービス抽出（143行→31行）
- ✅ BE-5: supabase.debug.ts をweb/に移動
- ✅ BE-7: shared/constants/accounting.ts → domain/journal/accounting-constants.ts に移動
- ✅ BE-8: db/ をmigrations/seeds/queries/snapshots/に整理
- ✅ BE-9: generator.strategy.ts 削除（journal-pipeline.service.ts に統合済み）
- ✅ BE-10: core/ + modules/ → domain/ に統合再編
- ✅ BE-11: routes/ をドメイン別フォルダに再編（client/document/journal/master/export/system/user）
- ✅ BE-12: accounting/ の7ファイルを accounting-utils.ts + balance-validator.ts に統合
- ✅ BE-13: freee.oauth.ts 削除、supabase.client.ts を web/shared/lib/ に移動
- ✅ FE-1: window.confirm → useConfirm（12ファイル21箇所）
- ✅ FE-2: マスタ系3ページ hook 抽出（useAccountsData/useItemsData/useSuppliersData）
- ✅ FE-3: ステータス定数適用（ReviewPage, MultiEntryPanel, ReviewDataContext）
- ✅ FE-4: 全94 button に type="button" 追加
- ✅ FE-5: インラインスタイル15箇所 → Tailwind + fadeSlideUp CSS化
- ✅ OCR-1: registry.ts に4コード追加（payment_statement, bank_transfer_receipt, utility_bill, tax_receipt）
- ✅ OCR-2: 未実装セクション7件作成（HousingLoanCalc, LifeInsCalc, MedicalCalc, FurusatoCalc, InventoryCalc, Depreciation, Carryover）
- ✅ OCR-3: OCR読取データの自動入力（InvoicePanel, WithholdingPanel, ReceiptItemList, PaymentMethodSelector, TransferFeePanel + 新規7パネル）
- ✅ DOC-CHECK-1〜5: 不足書類チェック機能（ドメインサービス + API + ClientSummaryPageカード）

---

## 意図的にスキップ

- **BE-6: models.ts の分散** — バレルファイルとして機能中
- **FE-6: workflow/ feature の分離** — 内部構造は整理済み

---

## 🔴 最優先: レビューページ全面改修 + OCR改善

> **目的**: 仕訳確認ページのUI改善（サブタブ導入・所得控除レイアウト分離・全追加パネル実装）+ OCR精度改善（請求書の取引先誤認対策・控除証明書の区分別抽出）

### 実装順序

| 優先度 | Step | 内容 | 依存関係 |
|--------|------|------|---------|
| 🔴 | Step 1 | サブタブ導入 | なし |
| 🔴 | Step 2 | deduction レイアウト新設 | なし |
| 🔴 | Step 3 | OCR プロンプト改善（請求書取引先） | なし |
| 🟡 | Step 4 | 経費系パネル完成 | Step 2 |
| 🟡 | Step 5 | 所得控除系パネル | Step 2, Step 3 |
| 🟢 | Step 6 | 複合仕訳・明細系パネル | Step 2 |
| 🟢 | Step 7 | 取引先バリデーション | Step 3 |

---

### [Step 1] レビューページのサブタブ導入 + CoreFieldsGrid 非表示修正

#### 1-1. サブタブUIの実装

**対象ファイル**: `src/web/features/workflow/pages/ReviewPage.tsx`

**現状のタブ構成**:
```
[すべて 2] [未確認 2] [承認待ち 0] [対象外 0]
```

**変更後のタブ構成（2階層）**:
```
━━ 第1階層: ステータスタブ（既存）━━
[すべて 12] [未確認 8] [承認待ち 3] [対象外 1]

━━ 第2階層: 種別サブタブ（新規）━━
[全種別] [仕訳対象 ▼] [控除・申告] [届出・契約] [保管]
              │
              ├ 収入系
              ├ 経費系
              └ 複合仕訳
```

**サブタブのカテゴリ分類ロジック**:

`document_types` テーブルの `display_group` カラムと、新たに定義するフロントエンド側のサブカテゴリマッピングを使用する。

- [x] 1-1: `src/web/features/workflow/constants/docCategoryMap.ts` 新規作成

```typescript
// src/web/features/workflow/constants/docCategoryMap.ts（新規作成）

export type DocCategory = 'journal_income' | 'journal_expense' | 'journal_compound' | 'journal_asset' | 'deduction' | 'metadata' | 'archive';

export type DocCategoryGroup = 'all' | 'journal' | 'deduction' | 'metadata' | 'archive';

// 第2階層のサブタブ定義
export const DOC_CATEGORY_TABS: { key: DocCategoryGroup; label: string; subCategories?: { key: DocCategory; label: string }[] }[] = [
  { key: 'all', label: '全種別' },
  {
    key: 'journal',
    label: '仕訳対象',
    subCategories: [
      { key: 'journal_income', label: '収入系' },
      { key: 'journal_expense', label: '経費系' },
      { key: 'journal_compound', label: '複合仕訳' },
      { key: 'journal_asset', label: '資産・償却' },
    ],
  },
  { key: 'deduction', label: '控除・申告' },
  { key: 'metadata', label: '届出・契約' },
  { key: 'archive', label: '保管' },
];

// document_type_code → サブカテゴリ のマッピング
export const DOC_TYPE_TO_CATEGORY: Record<string, DocCategory> = {
  // 収入系
  issued_invoice: 'journal_income',
  payment_record: 'journal_income',
  payment_statement: 'journal_income',
  platform_csv: 'journal_income',
  bank_statement: 'journal_income',
  salary_cert: 'journal_income',
  stock_report: 'journal_income',
  crypto_history: 'journal_income',
  pension_cert: 'journal_income',
  realestate_inc: 'journal_income',
  insurance_mat: 'journal_income',

  // 経費系
  receipt: 'journal_expense',
  pdf_invoice: 'journal_expense',
  recv_invoice: 'journal_expense',
  invoice: 'journal_expense',
  credit_card: 'journal_expense',
  e_money_statement: 'journal_expense',
  etc_statement: 'journal_expense',
  expense_report: 'journal_expense',
  inventory: 'journal_expense',
  tax_interim: 'journal_expense',
  payment_notice: 'journal_expense',
  bank_transfer_receipt: 'journal_expense',
  utility_bill: 'journal_expense',
  tax_receipt: 'journal_expense',

  // 複合仕訳
  payroll: 'journal_compound',
  sales_report: 'journal_compound',

  // 資産・償却
  fixed_asset: 'journal_asset',
  loan_schedule: 'journal_asset',

  // 所得控除系
  kokuho: 'deduction',
  nenkin: 'deduction',
  shokibo: 'deduction',
  ideco: 'deduction',
  life_insurance: 'deduction',
  earthquake_ins: 'deduction',
  medical: 'deduction',
  furusato: 'deduction',
  housing_loan: 'deduction',
  deduction_cert: 'deduction',
  other_deduction: 'deduction',
  prev_return: 'deduction',

  // メタデータ系
  mynumber: 'metadata',
  kaigyo: 'metadata',
  aoiro: 'metadata',
  senjusha: 'metadata',
  invoice_reg: 'metadata',
  kanizei: 'metadata',
  tanaoroshi_method: 'metadata',
  shoukyaku_method: 'metadata',
  chintai: 'metadata',
  gaichuu: 'metadata',
  fudosan_contract: 'metadata',
  lease: 'metadata',
  shaken: 'metadata',
  id_card: 'metadata',
  contract: 'metadata',
  estimate: 'metadata',
  purchase_order: 'metadata',
  delivery_note: 'metadata',
  insurance_policy: 'metadata',
  registry: 'metadata',
  minutes: 'metadata',

  // 保管
  other_ref: 'archive',

  // フォールバック
  other_journal: 'journal_expense',
};
```

#### 1-2. ReviewPage.tsx にサブタブUI追加

- [x] 1-2: ReviewPage.tsx の変更

**変更内容**:

1. 既存のステータスタブ（すべて/未確認/承認待ち/対象外）はそのまま残す
2. ステータスタブの下に、第2階層のサブタブ行を追加
3. 「仕訳対象」タブはホバーまたはクリックでドロップダウンを表示し、収入系/経費系/複合仕訳/資産・償却のサブカテゴリで絞り込み可能
4. 書類一覧のフィルタリングは `docCategoryMap.ts` の `DOC_TYPE_TO_CATEGORY` を使って `document_type_code` からカテゴリを判定
5. 各サブタブのバッジに該当件数を表示

**フィルタリングロジック**:
```typescript
// ReviewPage.tsx 内のフィルタロジック（疑似コード）
const filteredEntries = entries
  .filter(e => statusFilter === 'all' || e.status === statusFilter)           // 第1階層
  .filter(e => {
    if (categoryFilter === 'all') return true;
    const cat = DOC_TYPE_TO_CATEGORY[e.document_type_code];
    if (subCategoryFilter) return cat === subCategoryFilter;                   // サブカテゴリ選択時
    if (categoryFilter === 'journal') return cat?.startsWith('journal_');      // 「仕訳対象」全体
    return cat === categoryFilter;                                             // 控除・メタデータ・保管
  });
```

#### 1-3. 書類一覧のカード表示にカテゴリバッジを追加

- [x] 1-3: ReviewPage.tsx 一覧行にカテゴリバッジ追加

現状の一覧行:
```
1  フリーランスデザイナー 鈴木美咲 Webサイトデザイン制作費用  -  ¥363,000  未確認
```

変更後:
```
1  [経費] フリーランスデザイナー 鈴木美咲 Webサイトデザイン制作費用  -  ¥363,000  未確認
2  [控除] 日本生命保険相互会社 一般の生命保険料（新制度分）...      ¥120,000  未確認
```

カテゴリバッジの色:
- 収入系: `bg-blue-100 text-blue-700`
- 経費系: `bg-green-100 text-green-700`
- 複合仕訳: `bg-purple-100 text-purple-700`
- 資産・償却: `bg-orange-100 text-orange-700`
- 控除・申告: `bg-yellow-100 text-yellow-700`
- 届出・契約: `bg-gray-100 text-gray-700`
- 保管: `bg-gray-50 text-gray-500`

#### 1-4. ReviewViewContext.tsx にサブタブ state 追加（精査で判明）

- [x] 1-4: ReviewViewContext.tsx の変更

**現状**: `activeTab: TabFilter`（ステータスタブのみ）
**追加**:
- `activeCategoryTab: DocCategoryGroup` — 第2階層のカテゴリタブ（'all' | 'journal' | 'deduction' | 'metadata' | 'archive'）
- `activeSubCategory: DocCategory | null` — ドロップダウンのサブカテゴリ（'journal_income' 等）
- 対応するセッター関数

#### 1-5. ReviewDataContext.tsx のフィルタロジック拡張（精査で判明）

- [x] 1-5: ReviewDataContext.tsx の変更

**現状**: `filteredEntries(activeTab)` でステータスフィルタのみ
**追加**:
- entries の `document_id` → items の `docClassification.document_type_code` で逆引きマップを作成
  - `document_type_code` は `items[]`（DocumentWithEntry.docClassification）に既に読み込み済み
- `filteredEntries()` に第2階層フィルタを追加（ステータス × カテゴリ）
- カテゴリ別件数の computed values をメモ化して追加

#### 1-6. ReviewContext.tsx の統合 useReview() に新 state を expose（精査で判明）

- [x] 1-6: ReviewContext.tsx の変更

`activeCategoryTab`, `setActiveCategoryTab`, `activeSubCategory`, `setActiveSubCategory` を
useReview() の返却値に追加。既存の `activeTab`, `setActiveTab` と並列。

---

### [Step 2] `deduction` レイアウト新設 + 所得控除系の registry 移行

#### 2-1. DeductionLayout コンポーネントの新規作成

- [x] 2-1: types.ts の LayoutType に `'deduction'` 追加

**対象ファイル**: `src/web/features/workflow/doc-types/types.ts`

```typescript
// 変更前
export type LayoutType = 'single' | 'statement' | 'compound' | 'metadata' | 'archive';

// 変更後
export type LayoutType = 'single' | 'statement' | 'compound' | 'metadata' | 'archive' | 'deduction';
```

- [x] 2-2: `DeductionLayout.tsx` 新規作成

**新規ファイル**: `src/web/features/workflow/layouts/DeductionLayout.tsx`

**設計方針**:
- `SingleEntryLayout.tsx` をベースにするが、以下の共通セクションを **表示しない**:
  - `CoreFieldsGrid`（勘定科目・税区分フィールド）→ 所得控除は仕訳不要のため不要
  - `BusinessRatioPanel`（家事按分）→ 控除証明書に按分は適用しない
  - `RuleCandidatesBar`（ルール候補）→ ルールエンジン対象外
- 以下は **表示する**:
  - `OcrSummaryBadges` → OCR信頼度・書類種別の表示
  - `OcrReferenceBox` → OCR読取結果の参照表示
  - `SupplierField` → 保険会社名・共済名等の取引先
  - 書類固有の `extraSections`（`deduction_calc`, `life_ins_calc` 等）
  - `NavigationBar` → 前後ナビゲーション
  - `SaveStatusBar` → 保存状態
- 金額フィールドは表示するが、ラベルを「金額（円）」→「証明額合計（円）」に変更
- 取引日フィールドは表示するが、ラベルを「取引日」→「証明書発行日」に変更

**画面構成**:
```
┌──────────────────────────────────────────────────┐
│ OcrSummaryBadges（書類種別・AI信頼度）            │
├──────────────────────────────────────────────────┤
│ OcrReferenceBox（OCR読取結果の参照表示）          │
├──────────────────────────────────────────────────┤
│                                                  │
│  [書類固有の控除パネル]                           │
│  （life_ins_calc / deduction_calc 等）           │
│                                                  │
├──────────────────────────────────────────────────┤
│ SupplierField（保険会社名等）                     │
├──────────────────────────────────────────────────┤
│ 証明書発行日        │  証明額合計（円）           │
├──────────────────────────────────────────────────┤
│ NavigationBar / ExcludeButton / SaveStatusBar     │
└──────────────────────────────────────────────────┘
```

#### 2-3. LayoutDispatcher.tsx の更新

- [x] 2-3: LayoutDispatcher.tsx に `case 'deduction'` 追加

**対象ファイル**: `src/web/features/workflow/layouts/LayoutDispatcher.tsx`

変更内容:
1. `import DeductionLayout from './DeductionLayout'` を追加
2. switch/if文のレイアウト分岐に `case 'deduction': return <DeductionLayout {...props} />` を追加

#### 2-4. registry.ts の更新

- [x] 2-4: registry.ts の10コードを `layout: 'single'` → `'deduction'` に変更

**対象ファイル**: `src/web/features/workflow/doc-types/registry.ts`

以下の10コードの `layout` を `'single'` → `'deduction'` に変更:

```typescript
// 変更前
kokuho:          { code: 'kokuho',          layout: 'single', extraSections: ['deduction_calc'] },
// 変更後
kokuho:          { code: 'kokuho',          layout: 'deduction', extraSections: ['deduction_calc'] },
```

**変更対象の全コード**:
| コード | extraSections | 変更内容 |
|--------|--------------|----------|
| kokuho | deduction_calc | layout: single → deduction |
| nenkin | deduction_calc | layout: single → deduction |
| shokibo | deduction_calc | layout: single → deduction |
| ideco | deduction_calc | layout: single → deduction |
| life_insurance | life_ins_calc | layout: single → deduction |
| earthquake_ins | deduction_calc | layout: single → deduction |
| housing_loan | housing_loan_calc | layout: single → deduction |
| deduction_cert | deduction_calc | layout: single → deduction |
| other_deduction | deduction_calc | layout: single → deduction |
| prev_return | carryover | layout: single → deduction |

**注意**: `medical` と `furusato` は `layout: 'statement'` のままにする（明細テーブル形式が必要なため）。ただし statement レイアウト内でも CoreFieldsGrid の非表示処理は必要（Step 2-5 参照）。

#### 2-5. StatementLayout / MetadataLayout での CoreFieldsGrid 非表示

- [x] 2-5: StatementLayout で non_journal 書類の CoreFieldsGrid 非表示対応（精査で確認済み: 元々 CoreFieldsGrid 非表示）

**対象ファイル**:
- `src/web/features/workflow/layouts/StatementLayout.tsx`
- `src/web/features/workflow/layouts/MetadataLayout.tsx`

`medical`, `furusato`, `fixed_asset` は statement レイアウトだが非仕訳対象（medical, furusato）または特殊仕訳（fixed_asset）。

**対応方針**:
- `StatementLayout` で `display_group` を参照し、`non_journal` の場合は CoreFieldsGrid を非表示
- 具体的には、`document_types` テーブルの `display_group` 値を props 経由で受け取るか、`DOC_TYPE_TO_CATEGORY` マッピングで判定
- `MetadataLayout` は元々 CoreFieldsGrid を表示していないことを確認済み（精査結果）

**精査結果**: StatementLayout は現在 CoreFieldsGrid を表示していない（独自テーブルのみ）。
MetadataLayout も CoreFieldsGrid を表示していない。このタスクは確認のみで済む可能性あり。

#### 2-6. ReviewFormContext.tsx に deduction レイアウト用フォーム状態追加（精査で判明）

- [x] 2-6: ReviewFormContext.tsx の変更

**現状**: CoreFieldsGrid が非表示でもフォーム値（金額・日付・取引先等）は保存時に必要。
**対応**: deduction 用の簡易フォーム（証明額・証明書発行日・取引先のみ）を追加するか、
既存フォーム状態をそのまま使いつつ UI 側でラベルだけ変える方式にするか判断。

---

### [Step 3] OCR extractor プロンプト改善（請求書の取引先誤認対策）

#### 3-1. extractor.prompt.ts の請求書向け取引先判定ルール追加

- [x] 3-1: extractor.prompt.ts に請求書向けルール追加

**対象ファイル**: `src/domain/ocr/extractor.prompt.ts`

**追加すべきプロンプト文（請求書系 `recv_invoice`, `pdf_invoice`, `invoice` 向け）**:

```
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
- supplier_name には請求元（発行者）の名前を入れること
- もし請求元と請求先の区別がつかない場合は、confidence を 0.6 以下にすること
```

#### 3-2. issued_invoice 向けルール追加

- [x] 3-2: extractor.prompt.ts に issued_invoice 向け逆ロジック追加

```
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
- 書類の右上〜右下に記載されている発行者情報
```

#### 3-3. payment_notice 向けルール追加

- [x] 3-3: extractor.prompt.ts に payment_notice 向けルール追加

```
━━━━━━━━━━━━━━━━━━━━━━━
■ 支払通知書（payment_notice）の取引先判定ルール
━━━━━━━━━━━━━━━━━━━━━━━

支払通知書は、取引先が「あなたにこの金額を支払います」と通知する書類です。
仕訳の取引先は **支払元（通知書の発行者）** です。
```

#### 3-4. extractor.prompt.ts を関数形式に変更

- [x] 3-4: extractor.prompt.ts への書類種別別分岐の仕組み（buildExtractorPrompt() 関数化完了）

**現状（精査結果）**: `EXTRACT_OCR_PROMPT` は静的文字列定数。書類種別を受け取る仕組みがない。

**変更後の設計**:

```typescript
// extractor.prompt.ts の構造案

export function buildExtractorPrompt(documentTypeCode: string): string {
  const basePrompt = `...（共通の抽出指示）...`;

  // 書類種別ごとの追加指示
  const typeSpecificInstructions = getTypeSpecificInstructions(documentTypeCode);

  return `${basePrompt}\n\n${typeSpecificInstructions}`;
}

function getTypeSpecificInstructions(code: string): string {
  switch (code) {
    case 'recv_invoice':
    case 'pdf_invoice':
    case 'invoice':
      return INVOICE_SUPPLIER_RULES;        // 3-1 のルール
    case 'issued_invoice':
      return ISSUED_INVOICE_SUPPLIER_RULES; // 3-2 のルール
    case 'payment_notice':
      return PAYMENT_NOTICE_RULES;          // 3-3 のルール
    case 'life_insurance':
      return LIFE_INSURANCE_EXTRACTION_RULES; // Step 5-6 で定義
    // ... 他の書類種別
    default:
      return '';
  }
}
```

#### 3-5. classifier.prompt.ts の改善

- [x] 3-5: classifier.prompt.ts の改善

**対象ファイル**: `src/domain/ocr/classifier.prompt.ts`

以下を追加:

1. **画像回転への対応指示**（プロンプト冒頭に追加）:
```
【画像の前処理について】
- 画像が90度・180度・270度回転している場合があります。回転していても正しく内容を読み取って判定してください。
- ScanSnap等のスキャナーで取り込まれた画像は回転・傾きがある場合があります。
```

2. **入力画像の範囲指示**:
```
【入力画像について】
- 提供された画像の範囲内で判定してください。
- 複数ページの書類でも、提供されたページのみを基に判定してください。
- ページ外の内容を推測する必要はありません。
```

3. **estimated_lines の定義明確化**:
```
【estimated_lines の補足】
- 「1回の会計取引」を1行とカウントします。
- レシート: 品目が20行あっても「1回の買い物 = 1取引 = estimated_lines: 1」
- 通帳: 10件の入出金があれば estimated_lines: 10
- クレカ明細: 15件の利用があれば estimated_lines: 15
```

4. **description の文字数を20→30に緩和**:
```
【description】
書類の簡潔な説明（30文字以内の日本語）。
```

5. **invoice（フォールバック）の使用基準を明確化**:
```
【invoice コードの使用基準】
- invoice は recv_invoice と pdf_invoice のどちらか判断できない場合のフォールバックです
- recv_invoice か pdf_invoice を先に検討し、どちらにも確信が持てない場合のみ invoice を使用
- invoice を使用する場合は confidence を 0.7 以下にすること
```

6. **JSON出力の堅牢性**（プロンプト末尾に追加）:
```
【出力の厳守事項】
- JSONオブジェクトのみを出力してください
- ```json 等のマークダウンコードブロック記法は絶対に使わないでください
- 前置きテキスト、説明文、改行も不要です
- 最初の文字が { で始まり、最後の文字が } で終わること
```

#### 3-6. JSON パース堅牢化ユーティリティ

- [x] 3-6: JSON パース堅牢化（既存の extractJSON + safeParseJSON で十分と判断）

**精査結果**: `ocr-parse-utils.ts` に既に `extractJSON()` と `safeParseJSON()` が存在。
- `extractJSON()`: コードブロック（```）除去 + bare objects/arrays 対応
- `safeParseJSON()`: 2パス（strict → 修復リトライ: trailing commas, single quotes, unquoted keys）

既存の実装で十分な可能性あり。以下を確認:
- classifier.service.ts が `extractJSON()` + `safeParseJSON()` を使用済み（確認済み）
- extractor.service.ts も同様に使用済み（確認済み）
- 追加の堅牢化が必要な場合のみ実装

#### 3-7. ocr-pipeline.service.ts の修正（精査で判明 — 重要な欠落）

- [x] 3-7: ocr-pipeline.service.ts で classifier → extractor に document_type_code を渡す

**現状**: `processOCR(file_url, { base64, mimeType })` — document_type_code が渡されていない。
classifier の出力（`classification.document_type_code`）が extractor に引き継がれない。

**修正**: `processOCR()` 呼び出し時に第3引数として `classification.document_type_code` を追加。

#### 3-8. extractor.service.ts のシグネチャ変更（精査で判明）

- [x] 3-8: extractor.service.ts のシグネチャ変更（documentTypeCode 引数追加完了）

**現状**: `processOCR(imageUrl, preloaded?)` — documentTypeCode を受け取れない。
**変更**: `processOCR(imageUrl, preloaded?, documentTypeCode?)` に変更。
受け取った documentTypeCode を `buildExtractorPrompt(code)` に渡す。

---

### [Step 4] 経費系パネルの完成（PhaseA 対象）

**精査結果**: 全18パネルが現在スタブ（OCR表示のみ、ローカル useState が ReviewFormContext と未同期）。
各パネル完成時に `setForm()` との連携を実装する必要がある。

#### 4-1. ReceiptItemList パネル

- [x] 4-1: ReceiptItemList の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/ReceiptItemList.tsx`
**使用書類**: `receipt`（レシート/領収書）

**機能**:
- OCR で抽出されたレシートの品目一覧を表示
- 各行: 品目名 / 数量 / 単価 / 金額
- 品目の勘定科目自動マッチング表示（items テーブルの default_account_item_id 参照）
- 行の追加・削除・編集が可能
- 合計金額とヘッダーの金額フィールドの整合性チェック

**データソース**: `ocr_results.extracted_data` 内の品目配列（extractor が抽出）

#### 4-2. InvoicePanel パネル

- [x] 4-2: InvoicePanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/InvoicePanel.tsx`
**使用書類**: `pdf_invoice`, `recv_invoice`, `invoice`

**機能**:
- 請求書番号（インボイス番号 T+13桁）の表示・編集
- 支払期日の表示・編集
- 適格/非適格請求書の区分トグル（`is_qualified_invoice: boolean`）
- 適格請求書の場合、インボイス番号の形式バリデーション（T + 数字13桁）

**データソース**: `ocr_results.extracted_data` 内の請求書固有フィールド

#### 4-3. WithholdingPanel パネル

- [x] 4-3: WithholdingPanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/WithholdingPanel.tsx`
**使用書類**: `payment_record`, `payment_statement`, `recv_invoice`, `invoice`, `payment_notice`

**機能**:
- 源泉徴収税額の表示・編集
- 源泉徴収の計算式表示（報酬額 × 10.21%、100万超は (報酬額 - 100万) × 20.42% + 102,100円）
- 「源泉徴収あり」トグル → ON にすると源泉税額フィールドが表示
- 手入力 or OCR値の選択
- 計算値と OCR 値の差異がある場合に警告表示

**計算ロジック参照**: `src/domain/accounting/accounting-utils.ts`

#### 4-4. TransferFeePanel パネル

- [x] 4-4: TransferFeePanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/TransferFeePanel.tsx`
**使用書類**: `recv_invoice`, `invoice`

**機能**:
- 「振込手数料の負担」ドロップダウン: 当方負担 / 先方負担 / なし
- 当方負担の場合: 振込手数料額の入力フィールド（デフォルト: 0）
- 先方負担の場合: 請求額から手数料を差し引いた支払額を自動計算
- 仕訳への反映: 当方負担なら「支払手数料」の借方行を自動追加

#### 4-5. PaymentMethodSelector パネル

- [x] 4-5: PaymentMethodSelector の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/PaymentMethodSelector.tsx`
**使用書類**: `receipt`

**機能**:
- 決済方法の選択: 現金 / 銀行振込 / クレジットカード / 電子マネー / その他
- `payment_methods` テーブルから該当クライアントの登録済み決済方法を取得
- 選択に応じて貸方の勘定科目を自動設定（現金→現金、カード→未払金 等）
- payment_methods テーブルの `account_item_id` を参照

**データソース**: `payment_methods` テーブル（`client_id` + `organization_id` でフィルタ）

#### 4-6. ReconciliationPanel パネル

- [x] 4-6: ReconciliationPanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/ReconciliationPanel.tsx`
**使用書類**: `issued_invoice`, `payment_record`

**機能**:
- 発行済み請求書の入金消込状態を表示
- 対応する `payment_record` との紐づけ表示
- 未消込残高の表示
- 「消込済み」ボタン → journal_entries の status 更新

**注意**: この機能は複数書類の関連付けが必要なため、実装の複雑度が高い。最低限の表示のみ先行実装し、消込ロジックは後回しにすることを推奨。

#### 4-7. 全パネル共通 — form 連携の実装（精査で判明）

- [x] 4-7: 各パネルの useState を ReviewFormContext の setForm() と同期

**現状**: 各パネル内の `useState` がローカルのみで、ReviewFormContext に書き戻されていない。
**対応**: 各パネル完成時に `useReview()` の `setForm()` と連携して、パネル内の変更がフォーム状態に反映されるようにする。

#### 4-8. doc-specific/index.tsx のマッピング確認（精査で判明）

- [x] 4-8: doc-specific/index.tsx に新しいセクションコードを追加する場合は React.lazy マッピングも更新

---

### [Step 5] 所得控除系パネルの実装

#### 5-1. LifeInsCalcPanel（生命保険料控除計算パネル）— 最重要

- [x] 5-1: LifeInsCalcPanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/LifeInsCalcPanel.tsx`
**使用書類**: `life_insurance`

**入力フィールド構成**:

生命保険料控除は3区分 × 新旧制度で最大5行の入力が必要:

```
┌─ 生命保険料控除 ─────────────────────────────────────────────┐
│                                                              │
│  ■ 一般の生命保険料                                          │
│  ┌──────────────┬──────────────┬──────────────┐              │
│  │              │  証明額（円）│  申告額（円）│              │
│  ├──────────────┼──────────────┼──────────────┤              │
│  │ 新制度       │  [120,000]   │  [120,000]   │              │
│  │ 旧制度       │  [      0]   │  [      0]   │              │
│  └──────────────┴──────────────┴──────────────┘              │
│                                                              │
│  ■ 介護医療保険料（新制度のみ）                               │
│  ┌──────────────┬──────────────┬──────────────┐              │
│  │              │  証明額（円）│  申告額（円）│              │
│  ├──────────────┼──────────────┼──────────────┤              │
│  │ 新制度       │  [ 36,000]   │  [ 36,000]   │              │
│  └──────────────┴──────────────┴──────────────┘              │
│                                                              │
│  ■ 個人年金保険料                                            │
│  ┌──────────────┬──────────────┬──────────────┐              │
│  │              │  証明額（円）│  申告額（円）│              │
│  ├──────────────┼──────────────┼──────────────┤              │
│  │ 新制度       │  [      0]   │  [      0]   │              │
│  │ 旧制度       │  [      0]   │  [      0]   │              │
│  └──────────────┴──────────────┴──────────────┘              │
│                                                              │
│  ━━ 控除額計算（自動） ━━━━━━━━━━━━━━━━━━━━━━              │
│  一般の生命保険料控除額:     ¥40,000                         │
│  介護医療保険料控除額:       ¥28,000                         │
│  個人年金保険料控除額:       ¥0                              │
│  ─────────────────────────────────                           │
│  生命保険料控除 合計:        ¥68,000（上限12万円）            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**控除額計算ロジック**（確定申告書の計算式に準拠）:

```typescript
// 新制度の控除額計算
function calcNewSystemDeduction(premium: number): number {
  if (premium <= 20000) return premium;
  if (premium <= 40000) return premium * 0.5 + 10000;
  if (premium <= 80000) return premium * 0.25 + 20000;
  return 40000; // 上限
}

// 旧制度の控除額計算
function calcOldSystemDeduction(premium: number): number {
  if (premium <= 25000) return premium;
  if (premium <= 50000) return premium * 0.5 + 12500;
  if (premium <= 100000) return premium * 0.25 + 25000;
  return 50000; // 上限
}

// 区分ごとの控除額（新旧両方ある場合の併用計算）
function calcCategoryDeduction(newPremium: number, oldPremium: number): number {
  const newDeduction = calcNewSystemDeduction(newPremium);
  const oldDeduction = calcOldSystemDeduction(oldPremium);

  if (newPremium > 0 && oldPremium > 0) {
    // 新旧両方ある場合: 以下の3つから最も有利なものを選択
    const optionA = newDeduction;                          // 新制度のみ（上限4万）
    const optionB = oldDeduction;                          // 旧制度のみ（上限5万）
    const optionC = Math.min(newDeduction + oldDeduction, 40000); // 合算（上限4万）
    return Math.max(optionA, optionB, optionC);
  }
  if (newPremium > 0) return newDeduction;
  if (oldPremium > 0) return oldDeduction;
  return 0;
}

// 合計控除額（3区分の合計、上限12万円）
function calcTotalLifeInsuranceDeduction(
  ippanNew: number, ippanOld: number,
  kaigoNew: number,
  nenkinNew: number, nenkinOld: number
): number {
  const ippan = calcCategoryDeduction(ippanNew, ippanOld);
  const kaigo = calcNewSystemDeduction(kaigoNew); // 介護医療は新制度のみ
  const nenkin = calcCategoryDeduction(nenkinNew, nenkinOld);
  return Math.min(ippan + kaigo + nenkin, 120000); // 合計上限12万円
}
```

#### 5-2. DeductionCalcPanel（汎用控除計算パネル）

- [x] 5-2: DeductionCalcPanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/DeductionCalcPanel.tsx`
**使用書類**: `kokuho`, `nenkin`, `shokibo`, `ideco`, `earthquake_ins`, `deduction_cert`, `other_deduction`

**種別ごとの控除計算**:

| 書類コード | 控除種別 | 計算ロジック |
|-----------|---------|-------------|
| kokuho | 社会保険料控除 | 支払額 = 控除額（全額控除） |
| nenkin | 社会保険料控除 | 支払額 = 控除額（全額控除） |
| shokibo | 小規模企業共済等掛金控除 | 支払額 = 控除額（全額控除、上限84万円） |
| ideco | 小規模企業共済等掛金控除 | 支払額 = 控除額（全額控除、上限81.6万円※） |
| earthquake_ins | 地震保険料控除 | 支払額（上限5万円）= 控除額 |
| deduction_cert | （種別による） | 種別選択後に計算 |
| other_deduction | （種別による） | 手動入力 |

※ iDeCo の上限は加入者区分（自営業/会社員/公務員等）で異なる: 自営業者 81.6万円、会社員（企業年金なし）27.6万円、等

**UI構成**:
```
┌─ [控除種別名] ────────────────────────┐
│                                       │
│  年間支払額:  ¥[________]             │
│  控除額:      ¥123,456（自動計算）     │
│                                       │
│  ※ [控除種別固有の注記]               │
│                                       │
└───────────────────────────────────────┘
```

#### 5-3. HousingLoanCalcPanel（住宅ローン控除計算パネル）

- [x] 5-3: HousingLoanCalcPanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/HousingLoanCalcPanel.tsx`
**使用書類**: `housing_loan`

**入力フィールド**:
- 住宅ローン年末残高（円）
- 居住開始年月日
- 取得対価の額（円）
- 控除期間（年）: 10年 / 13年
- 認定住宅の区分: 一般 / 認定長期優良住宅 / 認定低炭素住宅 / ZEH水準省エネ住宅 / 省エネ基準適合住宅
- 控除率: 0.7%（2022年以降入居）

**控除額計算**:
```
控除額 = min(年末残高, 借入限度額) × 控除率
```

借入限度額は居住開始年と住宅区分で異なるため、テーブル参照が必要。最低限、2022年以降の税制改正後の限度額で実装する。

**注意**: 住宅ローン控除は税額控除（所得控除ではない）のため、確定申告書上の記載位置が異なる。パネル内にその旨を注記表示する。

#### 5-4. MedicalCalcPanel（医療費控除計算パネル）

- [x] 5-4: MedicalCalcPanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/MedicalCalcPanel.tsx`
**使用書類**: `medical`（statement レイアウト内）

**機能**:
- 医療費の明細一覧表示（statement レイアウトのテーブルに統合）
- 各行: 医療を受けた人 / 病院名 / 医療費 / 保険補填額
- 医療費控除額の自動計算:
  ```
  控除額 = (支払った医療費の合計 - 保険等で補填された金額) - 10万円（※所得200万未満は所得の5%）
  上限: 200万円
  ```
- セルフメディケーション税制との選択表示（対象医薬品の購入額が12,000円超の場合）

#### 5-5. FurusatoCalcPanel（ふるさと納税計算パネル）

- [x] 5-5: FurusatoCalcPanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/FurusatoCalcPanel.tsx`
**使用書類**: `furusato`（statement レイアウト内）

**機能**:
- 寄附先自治体と寄附金額の一覧表示
- ワンストップ特例の利用有無
- 寄附金控除額の計算:
  ```
  所得税の控除 = (寄附金合計 - 2,000円) × 所得税率
  住民税の控除（基本分） = (寄附金合計 - 2,000円) × 10%
  住民税の控除（特例分） = (寄附金合計 - 2,000円) × (100% - 10% - 所得税率)
  ```
- 控除上限額の目安表示（所得に応じた上限）

#### 5-6. extractor.prompt.ts への控除証明書用抽出フィールド追加

- [x] 5-6: extractor.prompt.ts に控除証明書用抽出フィールド追加

**対象ファイル**: `src/domain/ocr/extractor.prompt.ts`

**`life_insurance` 向けの抽出フィールド定義**:

```
━━━━━━━━━━━━━━━━━━━━━━━
■ 生命保険料控除証明書（life_insurance）の抽出フィールド
━━━━━━━━━━━━━━━━━━━━━━━

{
  "supplier_name": "保険会社名",
  "issue_date": "証明書の発行日（YYYY-MM-DD）",
  "policyholder_name": "契約者名",
  "life_insurance_details": {
    "ippan_new": {
      "certified_amount": 0,
      "declared_amount": 0
    },
    "ippan_old": {
      "certified_amount": 0,
      "declared_amount": 0
    },
    "kaigo_new": {
      "certified_amount": 0,
      "declared_amount": 0
    },
    "nenkin_new": {
      "certified_amount": 0,
      "declared_amount": 0
    },
    "nenkin_old": {
      "certified_amount": 0,
      "declared_amount": 0
    }
  },
  "total_amount": 0,
  "confidence": 0.0
}

【抽出ヒント】
- 「証明額」と「申告額」は異なる場合がある（年払いで途中解約等）。確定申告には「申告額」を使用
- 「証明額」: 保険会社が証明時点で確認した支払済み額
- 「申告額」: 12月末までの支払見込みを含む年間予定額（年末調整・確定申告用）
- 「一般」「介護医療」「個人年金」の区分は証明書上に明記されている
- 「新制度」「旧制度」は契約日による区分。2012年1月1日以降の契約が新制度
- 該当しない区分は certified_amount: 0, declared_amount: 0 で出力
- 「新」「旧」の記載がない場合、契約日が2012年以降なら新制度と推定
```

**社会保険料系（kokuho, nenkin）**:
```json
{
  "supplier_name": "発行機関名（市区町村名/日本年金機構等）",
  "issue_date": "YYYY-MM-DD",
  "insured_name": "被保険者名",
  "annual_amount": 0,
  "period_from": "YYYY-MM-DD",
  "period_to": "YYYY-MM-DD"
}
```

**地震保険料（earthquake_ins）**:
```json
{
  "supplier_name": "保険会社名",
  "issue_date": "YYYY-MM-DD",
  "policyholder_name": "契約者名",
  "earthquake_premium": 0,
  "old_long_term_premium": 0
}
```

**ふるさと納税（furusato）**:
```json
{
  "supplier_name": "寄附先自治体名",
  "issue_date": "YYYY-MM-DD",
  "donor_name": "寄附者名",
  "donation_amount": 0,
  "donation_date": "YYYY-MM-DD",
  "is_onestop": false
}
```

#### 5-7. 控除額計算関数の配置場所（精査で判明）

- [x] 5-7: 控除額計算関数を domain/accounting/accounting-utils.ts に追加

**対象関数**:
- `calcNewSystemDeduction()` — 新制度の生命保険料控除額
- `calcOldSystemDeduction()` — 旧制度の生命保険料控除額
- `calcCategoryDeduction()` — 区分ごとの控除額（新旧併用計算）
- `calcTotalLifeInsuranceDeduction()` — 生命保険料控除合計（上限12万円）
- `calcEarthquakeInsDeduction()` — 地震保険料控除額（上限5万円）

フロント・バックエンド両方で使えるよう `src/domain/accounting/` に配置。
フロントからは `@/domain/accounting/accounting-utils` でインポート可能か確認（Vite alias 設定）。
不可能な場合は `src/shared/utils/` への配置を検討。

---

### [Step 6] 複合仕訳・明細系パネルの実装

#### 6-1. PayrollSummaryPanel（給与明細サマリーパネル）

- [x] 6-1: PayrollSummaryPanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/PayrollSummaryPanel.tsx`
**使用書類**: `payroll`（compound レイアウト）

**入力フィールド**:
```
┌─ 給与明細サマリー ────────────────────────────────────┐
│                                                        │
│  支給                                                  │
│  ├ 基本給:           ¥[________]                       │
│  ├ 残業手当:         ¥[________]                       │
│  ├ 通勤手当:         ¥[________]                       │
│  └ その他手当:       ¥[________]                       │
│  支給合計:           ¥XXX,XXX                          │
│                                                        │
│  控除                                                  │
│  ├ 健康保険料:       ¥[________]                       │
│  ├ 厚生年金:         ¥[________]                       │
│  ├ 雇用保険料:       ¥[________]                       │
│  ├ 所得税:           ¥[________]                       │
│  └ 住民税:           ¥[________]                       │
│  控除合計:           ¥XXX,XXX                          │
│                                                        │
│  差引支給額:         ¥XXX,XXX                          │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**仕訳生成ロジック**:
給与の複合仕訳は以下の構造:
```
借方: 給料賃金（支給合計）
貸方: 普通預金（差引支給額）
貸方: 預り金-源泉所得税（所得税）
貸方: 預り金-住民税（住民税）
貸方: 預り金-社会保険料（健保+厚生年金+雇用保険）
```

#### 6-2. SalesBreakdownPanel（売上内訳パネル）

- [x] 6-2: SalesBreakdownPanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/SalesBreakdownPanel.tsx`
**使用書類**: `sales_report`（compound レイアウト）

**入力フィールド**:
```
┌─ 売上内訳 ────────────────────────────────────────────┐
│                                                        │
│  現金売上:           ¥[________]                       │
│  カード売上:         ¥[________]                       │
│  電子マネー売上:     ¥[________]                       │
│  売上合計:           ¥XXX,XXX                          │
│                                                        │
│  消費税区分別:                                         │
│  ├ 10%対象:          ¥[________]                       │
│  └ 8%対象（軽減）:   ¥[________]                       │
│                                                        │
└────────────────────────────────────────────────────────┘
```

#### 6-3. DepreciationPanel（減価償却パネル）

- [x] 6-3: DepreciationPanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/DepreciationPanel.tsx`
**使用書類**: `fixed_asset`（statement レイアウト）

**入力フィールド**:
- 資産名
- 取得日
- 取得価額
- 耐用年数
- 償却方法: 定額法 / 定率法
- 期首帳簿価額
- 本年分の償却費（自動計算）
- 期末帳簿価額（自動計算）

**計算ロジック**:
```
定額法: 償却費 = 取得価額 × 定額法償却率
定率法: 償却費 = 期首帳簿価額 × 定率法償却率（保証額以下の場合は改定取得価額 × 改定償却率）
```

#### 6-4. CarryoverPanel（繰越損失パネル）

- [x] 6-4: CarryoverPanel の完成実装

**対象ファイル**: `src/web/features/workflow/sections/doc-specific/CarryoverPanel.tsx`
**使用書類**: `prev_return`（deduction レイアウト）

**機能**:
- 前年の確定申告書から読み取った繰越損失額を表示
- 各所得区分の損失額
- 繰越年数（3年間繰越可能）の残り期間表示
- 手動での金額修正

---

### [Step 7] 取引先バリデーション（宛先誤認検出）

#### 7-1. supplier-matcher.ts に detectSupplierIsClient() 追加

- [x] 7-1: supplier-matcher.ts に `detectSupplierIsClient()` 追加

**対象ファイル**: `src/domain/document/supplier-matcher.ts`

**ロジック**:

OCR で抽出された `supplier_name` が、処理対象のクライアント名（`clients.name`）と一致または類似する場合に警告を出す。

```typescript
export function detectSupplierIsClient(
  supplierName: string,
  clientName: string,
  clientAliases?: string[]
): { isMatch: boolean; similarity: number; warning?: string } {
  // 正規化（全角→半角、カタカナ→ひらがな、株式会社等の法人格除去）
  const normalizedSupplier = normalizeForComparison(supplierName);
  const normalizedClient = normalizeForComparison(clientName);

  // 完全一致
  if (normalizedSupplier === normalizedClient) {
    return {
      isMatch: true,
      similarity: 1.0,
      warning: `取引先「${supplierName}」はクライアント名と一致しています。請求書の宛先（請求先）を取引先として読み取っている可能性があります。`,
    };
  }

  // 部分一致（80%以上の類似度）
  const similarity = calcSimilarity(normalizedSupplier, normalizedClient);
  if (similarity >= 0.8) {
    return {
      isMatch: true,
      similarity,
      warning: `取引先「${supplierName}」がクライアント名「${clientName}」と類似しています。請求書の宛先を読み取っている可能性があります。`,
    };
  }

  // エイリアスとのチェック
  if (clientAliases) {
    for (const alias of clientAliases) {
      const normalizedAlias = normalizeForComparison(alias);
      if (normalizedSupplier === normalizedAlias || calcSimilarity(normalizedSupplier, normalizedAlias) >= 0.8) {
        return {
          isMatch: true,
          similarity: 0.9,
          warning: `取引先「${supplierName}」がクライアントの別名「${alias}」と一致しています。`,
        };
      }
    }
  }

  return { isMatch: false, similarity: 0 };
}

function normalizeForComparison(name: string): string {
  let n = normalizeJapanese(name);
  n = n.replace(/株式会社|有限会社|合同会社|一般社団法人|（株）|（有）|（合）/g, '').trim();
  return n;
}
```

#### 7-2. SupplierField.tsx で警告バナー表示

- [x] 7-2: SupplierField.tsx で取引先名=クライアント名の警告バナー表示

**対象ファイル**: `src/web/features/workflow/sections/SupplierField.tsx`

**変更内容**:
- SupplierField コンポーネントで、取引先名がクライアント名と一致する場合に警告バナーを表示
- 警告メッセージ例: 「⚠ この取引先名はクライアント名と一致しています。請求書の場合、宛先ではなく発行者を取引先として入力してください。」
- 警告バナーは黄色背景（`bg-yellow-50 border-yellow-200`）
- 書類種別が請求書系（`recv_invoice`, `pdf_invoice`, `invoice`, `issued_invoice`）の場合のみ表示

#### 7-3. バックエンド側のバリデーション

- [x] 7-3: バックエンド側バリデーション

仕訳保存時に、取引先名とクライアント名の突合チェックを実行し、一致する場合は `warnings` 配列に追加（エラーではなく警告として）。レスポンスに `warnings` を含めてフロントエンドに返す。

#### 7-4. SupplierField.tsx にクライアント名を渡す仕組み（精査で判明 — 重要な欠落）

- [x] 7-4: SupplierField にクライアント名へのアクセス手段を追加

**現状**: SupplierField は `useReview()` 経由でデータ取得するが、client 情報（クライアント名）にアクセスできない。
- `currentWorkflow` には `clientId` があるが `clientName` がない
- `ci`（DocumentWithEntry）にもクライアント情報がない

**対応**: ReviewContext / useReviewData に `clientName: string` を追加して expose する。

#### 7-5. useReviewData.ts でクライアント情報のフェッチ追加（精査で判明）

- [x] 7-5: useReviewData.ts でクライアント名のフェッチ追加

**対象ファイル**: `src/web/features/workflow/context/useReviewData.ts`

`currentWorkflow.clientId` を使って `clientsApi.getById()` でクライアント名を取得し、
ReviewDataContext に `clientName: string` を追加。

---

### 型定義の更新が必要なファイル

| ファイル | 追加・変更内容 |
|---------|--------------|
| `src/web/features/workflow/doc-types/types.ts` | `LayoutType` に `'deduction'` 追加 |
| `src/domain/ocr/ocr.types.ts` | 控除証明書用の抽出結果型（`LifeInsuranceExtraction` 等）追加 |
| `src/web/features/workflow/context/ReviewContext.tsx` | サブタブ型を追加 export、useReview() に新 state 追加 |
| `src/web/features/workflow/context/ReviewViewContext.tsx` | サブタブ state（`activeCategoryTab`, `activeSubCategory`）追加 |
| `src/web/features/workflow/context/ReviewDataContext.tsx` | カテゴリ別件数 computed、フィルタロジック拡張、`clientName` 追加 |
| `src/web/features/workflow/context/ReviewFormContext.tsx` | deduction レイアウト用のフォーム状態検討 |
| `src/web/features/workflow/context/useReviewData.ts` | クライアント名フェッチ追加（Step 7 用） |

---

### extractor サービスの確認事項（精査で確認済み）

Step 3 の実装前に確認が必要だった以下の点を精査で確認済み:

1. **`extractor.service.ts` は `classifier` の出力（`document_type_code`）を受け取っていない** — 修正必要（3-7, 3-8）
2. **`extractor.prompt.ts` は静的文字列定数** — 関数形式への変更が必要（3-4）
3. **`ocr-pipeline.service.ts` で classifier → extractor にコードが引き継がれない** — 修正必要（3-7）
4. **JSON パース堅牢化は `ocr-parse-utils.ts` に既存** — `extractJSON()` + `safeParseJSON()` で十分な可能性（3-6）

---

## DOC-CHECK: 不足書類チェック＆通知機能

- [x] DOC-CHECK-1〜5: 実装完了（ドメインサービス + API + ClientSummaryPageカード）
- [ ] DOC-CHECK-6: 通知連携（後回し可）— ワークフロー完了時に必須不足を通知

---

## 将来課題

- [ ] document.batch.ts / freee.ts の残り try-catch を asyncHandler に移行（2ファイル）
- [ ] useReviewActions.ts の2箇所の window.confirm（hook内のため useConfirm 不可）
- [ ] index.css の .btn-primary 等をデザイントークン参照に更新

---

## 検証方法（共通）

1. `npx tsc --noEmit` — TypeScript コンパイルエラーなし
2. 全画面の手動操作確認
3. ブラウザコンソールにエラーなし
