# 仕訳処理 実装仕様書

> 現在の実装状態を記録したドキュメント。
> 書類がどのタイミングでどう分岐し、どのページに到達するかを中心にまとめる。

---

## 1. 処理フロー全体図

```
[UploadPage]  ユーザーがファイルをアップロード
     │         documents テーブルに status='uploaded', ocr_status='pending' で保存
     │         ※ この時点では書類種別は未設定
     ▼
[OCRPage]     「OCR開始」ボタンでバッチ処理開始（並列2件ずつ）
     │
     │  ┌─────────────────────────────────────────────┐
     │  │ Step 1: 証憑分類 (POST /api/ocr/process)     │
     │  │   classifier.service.ts → Gemini AI          │
     │  │   → document_type_code と confidence を取得    │
     │  │   → document_types テーブルから requires_journal を検索 │
     │  └─────────────────────────────────────────────┘
     │
     ├─── 【分岐A】非仕訳対象 AND confidence >= 0.8
     │     → status='excluded', ocr_status='completed'
     │     → Step 2 スキップ、仕訳生成もスキップ
     │     → ExcludedPage で閲覧可能
     │
     ├─── 【分岐B】非仕訳対象 AND confidence < 0.8
     │     → 自信が低いので Step 2 に進む（念のためデータ抽出）
     │     └─── 以降は分岐Cと同じ流れ
     │
     └─── 【分岐C】仕訳対象（requires_journal=true）
           │
           │  ┌─────────────────────────────────────────┐
           │  │ Step 2: データ抽出 (同じ /api/ocr/process) │
           │  │   extractor.service.ts → Gemini AI       │
           │  │   → supplier, amount, date, tax 等を抽出   │
           │  │   → documents テーブルに保存               │
           │  │   → status='ocr_completed'                │
           │  └─────────────────────────────────────────┘
           │
           │  ┌────────────────────────────────────────────────┐
           │  │ Step 3: 仕訳生成 (POST /api/journal-entries/generate) │
           │  │   OCRPage.tsx が OCR 完了後に自動で呼び出す       │
           │  └────────────────────────────────────────────────┘
           │
           ├─── 【分岐D】明細分割対象（11種）
           │     → multi-extractor.service.ts で行ごとに分割
           │     → 各行ごとに AI で仕訳生成
           │     → journal_entries を複数件作成
           │
           └─── 【分岐E】単一仕訳対象（その他の仕訳対象書類）
                 │
                 ├─── ルールマッチ成功
                 │     → rule-generator で仕訳生成（AI不要）
                 │
                 └─── ルールマッチ失敗
                       → ai-generator で Gemini AI 仕訳生成
           │
           ▼
     status='ai_processing'
           │
           ▼
[ReviewPage]  LayoutDispatcher が doc_classification.document_type_code を参照
     │         → getDocTypeConfig() でレジストリを検索
     │         → config.layout に応じたレイアウトを表示
     │
     ├─── layout='single'    → SingleEntryLayout
     ├─── layout='statement'  → StatementLayout
     ├─── layout='compound'   → CompoundEntryLayout
     ├─── layout='metadata'   → MetadataLayout
     └─── layout='archive'    → ArchiveLayout
           │
           ▼
     ユーザーが確認・修正
     status='reviewed' → 'approved' → 'exported'
```

---

## 2. 分岐の判定条件（詳細）

### 分岐A/B/C: 仕訳対象 or 非仕訳対象

**判定タイミング**: OCR Step 1 完了直後（`ocr.route.ts`）

**判定ロジック**:
1. `classifyDocument()` で `document_type_code` を取得
2. `document_types` テーブルから `requires_journal` を検索
3. 条件分岐:

```
requires_journal = false AND confidence >= 0.8
  → 即 excluded（ExcludedPage 行き）

requires_journal = false AND confidence < 0.8
  → Step 2 に進む（データ抽出して仕訳生成も試みる）

requires_journal = true
  → Step 2 に進む（データ抽出 → 仕訳生成）
```

**DB書き込み（Step 1）**:

| カラム | 値 |
|-------|-----|
| `doc_classification` | ClassificationResult (JSONB) |
| `ocr_step1_type` | document_type_code |
| `ocr_step1_confidence` | confidence |
| `ocr_step` | "step1" |
| `document_type_id` | document_types の UUID |
| `status` | "excluded"（分岐Aのみ） |

### 分岐D/E: 明細分割 or 単一仕訳

**判定タイミング**: 仕訳生成 API 呼び出し時（`journals.route.ts`）

**判定ロジック**:
1. `document_types` テーブルの `processing_pattern` を取得
2. `processing_pattern === 'statement_extract'` **または** `statementExtractTypes` 配列に含まれるか

```
processing_pattern='statement_extract' OR docTypeCode in statementExtractTypes
  → 明細分割モード（multi-extractor で行分割 → 行ごとに仕訳生成）

それ以外
  → 単一仕訳モード（ルールマッチ → 失敗なら AI 生成）
```

**明細分割対象の11種**:

| カテゴリ | 書類種別 |
|---------|---------|
| 収入系 | `platform_csv`, `bank_statement`, `crypto_history`, `realestate_inc` |
| 経費系 | `credit_card`, `e_money_statement`, `etc_statement`, `expense_report` |
| 資産系 | `loan_schedule` |
| 複合仕訳 | `payroll`, `sales_report` |

### 分岐: ルールマッチ or AI 生成

**判定タイミング**: 単一仕訳モード内（`journals.route.ts`）

**判定ロジック**:
1. `matchProcessingRulesWithCandidates()` でルール検索
2. マッチあり → `buildEntryFromRule()` で仕訳生成
3. マッチなし → `generateJournalEntry()` (Gemini AI) で仕訳生成

### ReviewPage のレイアウト分岐

**判定タイミング**: ReviewPage 表示時（`LayoutDispatcher.tsx`）

**判定ロジック**:
1. `ci.docClassification.document_type_code` を取得
2. `getDocTypeConfig(code)` で `DOC_TYPE_REGISTRY` を検索
3. `config.layout` に応じたコンポーネントを表示

---

## 3. 書類種別 → 分岐先 一覧表

### 仕訳対象（39種）

#### 単一仕訳 × single レイアウト（25種）

| コード | 書類名 | 追加セクション |
|--------|--------|---------------|
| `issued_invoice` | 発行済み請求書 | reconciliation |
| `payment_record` | 入金記録 | reconciliation, withholding |
| `payment_statement` | 支払調書 | withholding |
| `salary_cert` | 給与証明書・源泉徴収票 | income_calc |
| `stock_report` | 株式取引報告書 | income_calc |
| `pension_cert` | 年金証書 | income_calc |
| `insurance_mat` | 保険満期金通知 | income_calc |
| `receipt` | レシート/領収書 | receipt_items, payment_method |
| `pdf_invoice` | PDF請求書 | invoice_panel |
| `recv_invoice` | 受領請求書 | invoice_panel, withholding, transfer_fee |
| `invoice` | 請求書（分類不明） | invoice_panel, withholding, transfer_fee |
| `bank_transfer_receipt` | 振込受取証 | - |
| `utility_bill` | 公共料金請求書 | - |
| `tax_receipt` | 税務領収書 | - |
| `inventory` | 棚卸表 | inventory_calc |
| `tax_interim` | 予定納税通知書 | - |
| `payment_notice` | 支払通知書 | withholding |
| `kokuho` | 国民健康保険料 | deduction_calc |
| `nenkin` | 国民年金保険料 | deduction_calc |
| `shokibo` | 小規模企業共済 | deduction_calc |
| `ideco` | iDeCo | deduction_calc |
| `life_insurance` | 生命保険料控除 | life_ins_calc |
| `earthquake_ins` | 地震保険料控除 | deduction_calc |
| `housing_loan` | 住宅ローン控除 | housing_loan_calc |
| `deduction_cert` | その他控除証明書 | deduction_calc |
| `other_deduction` | その他控除 | deduction_calc |
| `prev_return` | 前年確定申告書 | carryover |
| `other_journal` | その他仕訳対象 | - |

#### 明細分割 × statement レイアウト（9種）

| コード | 書類名 | 決済手段デフォルト |
|--------|--------|------------------|
| `platform_csv` | プラットフォーム売上CSV | bank_transfer |
| `bank_statement` | 銀行通帳・入出金明細 | bank_transfer |
| `crypto_history` | 暗号資産取引履歴 | other |
| `realestate_inc` | 不動産収入明細 | bank_transfer |
| `credit_card` | クレジットカード利用明細 | credit_card |
| `e_money_statement` | 電子マネー/QR決済明細 | e_money |
| `etc_statement` | ETC利用明細 | e_money |
| `expense_report` | 経費精算書 | null (行ごと) |
| `loan_schedule` | 返済予定表 | bank_transfer |

#### 明細分割なし × statement レイアウト（3種）

| コード | 書類名 | 追加セクション |
|--------|--------|---------------|
| `medical` | 医療費 | medical_calc |
| `furusato` | ふるさと納税 | furusato_calc |
| `fixed_asset` | 固定資産台帳 | depreciation |

> これらは statement レイアウトだが `supportsMultiLine=false`。
> 明細分割ではなく、単一仕訳として処理される。

#### 明細分割 × compound レイアウト（2種）

| コード | 書類名 | 追加セクション | 決済手段デフォルト |
|--------|--------|---------------|------------------|
| `payroll` | 給与明細・賃金台帳 | payroll_summary | null (行ごと) |
| `sales_report` | 売上集計表/レジ日報 | sales_breakdown | null (行ごと) |

### 非仕訳対象（22種）→ ExcludedPage

#### metadata レイアウト（21種）

| コード | 書類名 |
|--------|--------|
| `mynumber` | マイナンバーカード |
| `kaigyo` | 開業届 |
| `aoiro` | 青色申告承認申請書 |
| `senjusha` | 専従者届出 |
| `invoice_reg` | インボイス登録通知 |
| `kanizei` | 簡易課税届出 |
| `tanaoroshi_method` | 棚卸方法届出 |
| `shoukyaku_method` | 償却方法届出 |
| `chintai` | 賃貸契約書 |
| `gaichuu` | 外注契約書 |
| `fudosan_contract` | 不動産売買契約書 |
| `lease` | リース契約書 |
| `shaken` | 車検証 |
| `id_card` | 免許証/保険証 |
| `contract` | 契約書（一般） |
| `estimate` | 見積書 |
| `purchase_order` | 発注書 |
| `delivery_note` | 納品書 |
| `insurance_policy` | 保険証券 |
| `registry` | 登記簿謄本 |
| `minutes` | 議事録 |

#### archive レイアウト（1種）

| コード | 書類名 |
|--------|--------|
| `other_ref` | その他参考書類 |

> 非仕訳対象は confidence >= 0.8 で即 excluded。
> confidence < 0.8 の場合は仕訳対象と同じフローで Step 2 に進む。

---

## 4. ページ構成（レイアウト別）

### SingleEntryLayout（single）

```
┌──────────────────────────────────────────────┐
│ ImageViewer (画像プレビュー・ズーム・回転)      │
├──────────────────────────────────────────────┤
│ MultiEntrySiblingTabs (複数仕訳タブ)           │
├──────────────────────────────────────────────┤
│ OcrSummaryBadges (書類種別・AI信頼度)          │
├──────────────────────────────────────────────┤
│ RuleCandidatesBar (マッチしたルール候補)        │
├──────────────────────────────────────────────┤
│ OcrReferenceBox (OCR結果: 取引先・金額・日付)   │
├──────────────────────────────────────────────┤
│ DocSpecificSections (書類種別別セクション)       │
│   → receipt_items / invoice_panel / withholding │
│   → deduction_calc / income_calc 等            │
├──────────────────────────────────────────────┤
│ SupplierField (取引先名)                       │
├──────────────────────────────────────────────┤
│ CoreFieldsGrid                                │
│   取引日 / 金額 / 勘定科目 / 税区分            │
│   税率 / 品目 / 摘要 / メモ                    │
├──────────────────────────────────────────────┤
│ BusinessRatioPanel (事業按分)                  │
│ BusinessToggleRow (事業/私用切替)               │
├──────────────────────────────────────────────┤
│ NavigationBar / ExcludeButton / SaveStatusBar  │
└──────────────────────────────────────────────┘
```

### StatementLayout（statement）

```
┌───────────────┬────────────────────────────┐
│ ImageViewer   │ 明細テーブル                │
│ (2/5幅)       │ (3/5幅)                    │
│               │ ┌──┬────┬────┬──────┬──┐  │
│               │ │日│摘要│金額│勘定科目│状態│  │
│               │ ├──┼────┼────┼──────┼──┤  │
│               │ │..│....│....│......│..│  │
│               │ └──┴────┴────┴──────┴──┘  │
├───────────────┴────────────────────────────┤
│ OcrSummaryBadges                           │
├────────────────────────────────────────────┤
│ 集計フッター（合計金額・行数）                │
└────────────────────────────────────────────┘
```

### CompoundEntryLayout（compound）

```
┌──────────────────────────────────────────────┐
│ ImageViewer                                   │
├──────────────────────────────────────────────┤
│ MultiEntrySiblingTabs                         │
├──────────────────────────────────────────────┤
│ OcrSummaryBadges / RuleCandidatesBar          │
├──────────────────────────────────────────────┤
│ OcrReferenceBox                               │
├──────────────────────────────────────────────┤
│ DocSpecificSections                           │
│   → payroll_summary / sales_breakdown         │
├──────────────────────────────────────────────┤
│ SupplierField / 取引日 / 摘要                  │
├──────────────────────────────────────────────┤
│ CompoundJournalTable (複合仕訳テーブル)        │
│ ┌────┬──────┬────┬──────┬────┬────┬────┐   │
│ │行番│借/貸  │科目│金額  │税区分│税率│摘要│   │
│ └────┴──────┴────┴──────┴────┴────┴────┘   │
├──────────────────────────────────────────────┤
│ NavigationBar / ExcludeButton / SaveStatusBar │
└──────────────────────────────────────────────┘
```

### MetadataLayout（metadata）

```
┌──────────────────────────────────────────────┐
│ ImageViewer                                   │
├──────────────────────────────────────────────┤
│ OcrSummaryBadges (書類種別コード表示)          │
├──────────────────────────────────────────────┤
│ メタデータ情報ボックス                         │
│   書類種別 / 発行者 / 日付                     │
├──────────────────────────────────────────────┤
│ システム利用情報ボックス                       │
├──────────────────────────────────────────────┤
│ NavigationBar / SaveStatusBar                 │
└──────────────────────────────────────────────┘
```

### ArchiveLayout（archive）

```
┌──────────────────────────────────────────────┐
│ ImageViewer                                   │
├──────────────────────────────────────────────┤
│ 「保管のみ」通知 / ファイル名表示               │
├──────────────────────────────────────────────┤
│ NavigationBar                                 │
└──────────────────────────────────────────────┘
```

---

## 5. 追加セクション一覧

| セクションコード | コンポーネント名 | 表示対象 |
|-----------------|-----------------|---------|
| `receipt_items` | ReceiptItemList | receipt |
| `invoice_panel` | InvoicePanel | pdf_invoice, recv_invoice, invoice |
| `withholding` | WithholdingPanel | payment_record, recv_invoice, invoice, payment_notice |
| `transfer_fee` | TransferFeePanel | recv_invoice, invoice |
| `payment_method` | PaymentMethodSelector | receipt |
| `reconciliation` | ReconciliationPanel | issued_invoice, payment_record |
| `income_calc` | IncomeCalcPanel | salary_cert, stock_report, pension_cert, insurance_mat |
| `deduction_calc` | DeductionCalcPanel | kokuho, nenkin, shokibo, ideco, earthquake_ins, deduction_cert, other_deduction |
| `life_ins_calc` | LifeInsCalcPanel | life_insurance |
| `medical_calc` | MedicalCalcPanel | medical |
| `furusato_calc` | FurusatoCalcPanel | furusato |
| `housing_loan_calc` | HousingLoanCalcPanel | housing_loan |
| `inventory_calc` | InventoryCalcPanel | inventory |
| `depreciation` | DepreciationPanel | fixed_asset |
| `carryover` | CarryoverPanel | prev_return |
| `payroll_summary` | PayrollSummaryPanel | payroll |
| `sales_breakdown` | SalesBreakdownPanel | sales_report |

---

## 6. OCR で抽出してDBに格納する情報

### Step 1: 証憑分類 → documents テーブル

| DBカラム | 値 | 型 |
|---------|----|----|
| `doc_classification` | ClassificationResult 全体 | JSONB |
| `ocr_step1_type` | document_type_code | text |
| `ocr_step1_confidence` | 0.0〜1.0 | numeric |
| `ocr_step` | "step1" | text |
| `document_type_id` | document_types の UUID | uuid |

### Step 2: データ抽出 → documents テーブル

| DBカラム | OCRResult フィールド | 型 |
|---------|--------------------|----|
| `supplier_name` | `extracted_supplier` | text |
| `amount` | `extracted_amount` | numeric |
| `tax_amount` | `extracted_tax_amount` | numeric |
| `document_date` | `extracted_date` | date |
| `ocr_confidence` | `confidence_score` | numeric |
| `ocr_status` | "completed" | text |
| `ocr_step` | "step2" | text |
| `status` | "ocr_completed" | text |

### OCRResult 全フィールド（DB未保存、仕訳生成APIに渡される）

| フィールド | 型 | 説明 |
|-----------|----|----- |
| `raw_text` | string | Gemini の生レスポンス |
| `document_type` | string | 書類種別（extractor 推定） |
| `transactions` | OCRTransaction[] | 全取引行の配列 |
| `extracted_date` | string \| null | 取引日 (YYYY-MM-DD) |
| `extracted_supplier` | string \| null | 取引先名 |
| `extracted_amount` | number \| null | 合計金額 |
| `extracted_tax_amount` | number \| null | 消費税額 |
| `extracted_items` | array \| null | 品目一覧 |
| `extracted_payment_method` | string \| null | 決済手段 |
| `extracted_invoice_number` | string \| null | インボイス番号 (T+13桁) |
| `extracted_tategaki` | string \| null | 但書き |
| `extracted_withholding_tax` | number \| null | 源泉徴収税額 |
| `extracted_invoice_qualification` | string \| null | 適格/区分記載 |
| `extracted_addressee` | string \| null | 宛名 |
| `extracted_transaction_type` | string \| null | 取引種別 |
| `extracted_transfer_fee_bearer` | string \| null | 振込手数料負担 |
| `confidence_score` | number | 読取確信度 (0.0〜1.0) |

### ExtractedLine（明細分割時の1行）

| フィールド | 型 | 説明 |
|-----------|----|----- |
| `date` | string \| null | 取引日 (YYYY-MM-DD)。抽出失敗時は null |
| `description` | string | 摘要/利用先/項目名 |
| `amount` | number | 金額（正の数値・税込） |
| `counterparty` | string \| null | 取引先名 |
| `is_income` | boolean | true=入金, false=出金 |
| `suggested_account_name` | string \| null | 推定勘定科目名 |
| `tax_rate` | number \| null | 消費税率 |
| `confidence` | number | 読取確信度 (0.0〜1.0) |

---

## 7. 仕訳生成後のDB格納

### journal_entries テーブル

| カラム | 値 | 説明 |
|-------|----|----- |
| `document_id` | UUID | 元証憑のID |
| `client_id` | UUID | クライアントID |
| `organization_id` | UUID | 組織ID |
| `entry_date` | date | 仕訳日 |
| `entry_type` | "normal" / "compound" | 仕訳種別 |
| `description` | text | 摘要 |
| `status` | "draft" | 初期ステータス |
| `ai_generated` | true | AI生成フラグ |
| `ai_confidence` | numeric | AI確信度 |
| `notes` | text | メモ |

### journal_entry_lines テーブル

| カラム | 値 | 説明 |
|-------|----|----- |
| `line_number` | integer | 行番号 |
| `debit_credit` | "debit" / "credit" | 借方/貸方 |
| `account_item_id` | UUID | 勘定科目ID |
| `amount` | numeric | 金額 |
| `tax_category_id` | UUID \| null | 税区分ID |
| `tax_rate` | numeric \| null | 税率 |
| `tax_amount` | numeric \| null | 税額 |
| `description` | text \| null | 行摘要 |
| `supplier_id` | UUID \| null | 取引先ID |
| `item_id` | UUID \| null | 品目ID |

---

## 8. フロントエンド ルーティング

| パス | ページ | 役割 |
|-----|--------|------|
| `/clients/:id/upload` | UploadPage | ファイルアップロード |
| `/clients/:id/ocr` | OCRPage | OCR分類 + データ抽出 + 仕訳生成 |
| `/clients/:id/review` | ReviewPage | 仕訳確認・修正 |
| `/clients/:id/excluded` | ExcludedPage | 除外された書類の閲覧・復元 |

---

## 9. ステータス遷移

```
uploaded ──→ ocr_processing ──→ ocr_completed ──→ ai_processing ──→ reviewed ──→ approved ──→ exported
   │                                                                    ↑
   │                                                                    │
   └─→ excluded ─── (手動復元) ────────────────────────────────────────┘
```

| ステータス | 設定タイミング | 意味 |
|-----------|--------------|------|
| `uploaded` | アップロード完了時 | ファイル保存済み |
| `ocr_processing` | OCR開始時 | OCR処理中 |
| `ocr_completed` | Step 2 完了時 | データ抽出済み |
| `ai_processing` | 仕訳生成完了時 | AI仕訳生成済み |
| `reviewed` | ユーザー確認後 | レビュー済み |
| `approved` | ユーザー承認後 | 承認済み |
| `exported` | エクスポート後 | 出力済み |
| `excluded` | 分岐Aまたは手動除外 | 仕訳対象外 |
