# タスク管理

> 完了タスクは1行サマリーのみ。未完了は詳細記載。

---

## 完了済み

- ✅ BE-1: master-data.ts 解体（19ファイル直接import化）
- ✅ BE-2: journal.generate.ts → パイプラインサービス抽出（380行→50行）
- ✅ BE-3: journal.crud.ts 分割（252行→3ファイル）
- ✅ BE-4: document.ocr.ts → パイプラインサービス抽出（143行→31行）
- ✅ BE-5: supabase.debug.ts をweb/に移動
- ✅ BE-7: shared/constants/accounting.ts → domain/journal/ に移動
- ✅ BE-8: db/ をmigrations/seeds/queries/snapshots/に整理
- ✅ BE-9: generator.strategy.ts 削除（pipeline に統合済み）
- ✅ FE-1: window.confirm → useConfirm（12ファイル21箇所）
- ✅ FE-2: マスタ系3ページ hook 抽出（1,552行→543行、65%削減）
- ✅ FE-3: ステータス定数適用（ReviewPage, MultiEntryPanel, ReviewDataContext）
- ✅ FE-4: 全94 button に type="button" 追加
- ✅ FE-5: インラインスタイル15箇所 → Tailwind + fadeSlideUp CSS化

---

## 意図的にスキップ

- **BE-6: models.ts の分散** — バレルファイルとして機能中。分散しても re-export が必要で実質メリットなし
- **FE-6: workflow/ feature の分離** — 内部構造は整理済み。分離するとimportパスが深くなるだけ

---

## 未完了タスク

### OCR-1: registry.ts に未登録の4コード追加（優先度：高）

VALID_DOC_CODES とプロンプトに存在するが、フロントエンドのレジストリに未登録。Gemini がこれらのコードを返すと `other_journal` にフォールバックしてしまう。

- [ ] `payment_statement`（支払調書）→ layout: 'single', extraSections: ['withholding']
- [ ] `bank_transfer_receipt`（振込明細）→ layout: 'single'
- [ ] `utility_bill`（公共料金請求書）→ layout: 'single'
- [ ] `tax_receipt`（税金納付済領収書）→ layout: 'single'

対象ファイル: `src/web/features/workflow/doc-types/registry.ts`

### OCR-2: 未実装の書類固有セクション7件（優先度：中）

registry.ts に extraSections として定義されているが、コンポーネントが存在しない。書類が来ると固有パネルが表示されない（サイレント失敗）。

- [ ] `housing_loan_calc` — 住宅ローン控除計算パネル（housing_loan 用）
- [ ] `life_ins_calc` — 生命保険料控除計算パネル（life_insurance 用）
- [ ] `medical_calc` — 医療費控除計算パネル（medical 用）
- [ ] `furusato_calc` — ふるさと納税控除計算パネル（furusato 用）
- [ ] `inventory_calc` — 棚卸計算パネル（inventory 用）
- [ ] `depreciation` — 減価償却計算パネル（fixed_asset 用）
- [ ] `carryover` — 繰越控除パネル（prev_return 用）

対象ファイル: `src/web/features/workflow/sections/doc-specific/` 配下に新規作成 + `index.tsx` に登録

### OCR-3: OCR読取データの各欄への自動入力（優先度：高）

OCRで読み取ったデータ（金額・日付・取引先・税率・インボイス番号・源泉徴収額等）を、レビュー画面の対応する入力欄にあらかじめ自動セットする。

現状: OCRデータは `docClassification` や `ocrResult` として保持されているが、書類固有セクション（InvoicePanel, WithholdingPanel 等）のフォーム欄にはバインドされていない（readOnly や空の placeholder のまま）。

- [ ] `InvoicePanel.tsx` — `extracted_invoice_number` → 登録番号欄に自動入力、`invoice_qualification` → 適格区分セレクトに自動選択
- [ ] `WithholdingPanel.tsx` — `extracted_withholding_tax` → 源泉徴収税額欄に自動入力、差引支払額を自動計算
- [ ] `ReceiptItemList.tsx` — `extracted_items` → 品目リストに自動展開
- [ ] `PaymentMethodSelector.tsx` — `extracted_payment_method` → 決済方法ボタンの自動選択
- [ ] `TransferFeePanel.tsx` — `extracted_transfer_fee_bearer` → 手数料負担ボタンの自動選択
- [ ] `ReconciliationPanel.tsx` — 売掛金・入金額の自動セット
- [ ] `IncomeCalcPanel.tsx` — 所得金額の自動セット
- [ ] `DeductionCalcPanel.tsx` — 控除金額の自動セット
- [ ] `CoreFieldsGrid.tsx` — すでに `form` 経由でバインド済み（確認のみ）
- [ ] OCR-2 で新規作成する7パネルにも同様にデータバインド

対象: `useReview()` の `ci.docClassification` や `form` のデータを各パネルのフォーム初期値として渡す

### 将来課題

- [ ] correction hints の SQL GROUP BY 最適化（DB マイグレーション要）
- [ ] 6つのルートファイルの残り try-catch を asyncHandler に移行
- [ ] useReviewActions.ts の2箇所の window.confirm（hook内のため useConfirm 不可）
- [ ] index.css の .btn-primary 等をデザイントークン参照に更新

---

## 検証方法（共通）

1. `npx tsc --noEmit` — TypeScript コンパイルエラーなし
2. 全画面の手動操作確認
3. ブラウザコンソールにエラーなし
