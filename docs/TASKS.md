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

---

## 意図的にスキップ

- **BE-6: models.ts の分散** — バレルファイルとして機能中
- **FE-6: workflow/ feature の分離** — 内部構造は整理済み

---

## DOC-CHECK: 不足書類チェック＆通知機能

### 概要

クライアントに対して「提出済み書類」と「63種の書類分類コード」を照合し、
不足している書類を **必須（required）** と **推奨（recommended）** の2段階で表示・通知する。

### 設計方針

#### 判定の2軸

1. **クライアント属性** — `tax_category`, `invoice_registered`, `industry`, `annual_sales`
2. **提出済み書類から推測** — 既にアップした書類が「ある状況」を示唆する
   - 例: `payroll` が提出済み → 従業員がいる → `senjusha` が推奨に昇格
   - 例: `issued_invoice` が提出済み → 売掛金がある → `payment_record` が推奨に昇格

#### 全63コード × 必須/推奨/対象外 マッピング

**凡例**:
- 🔴 必須 = これがないと確定申告・記帳が成立しない
- 🟡 推奨 = あると申告精度向上・控除適用可能
- ⚪ 対象外 = チェック不要（任意提出 or 発生しない場合も多い）
- `[条件]` = クライアント属性 or 提出済み書類による条件付き

##### 【収入系 11コード】

| コード | デフォルト | 条件による昇格 |
|--------|-----------|---------------|
| `bank_statement` | 🔴必須 | — 全クライアント必須 |
| `issued_invoice` | 🟡推奨 | — 売上がある事業者なら推奨 |
| `payment_record` | ⚪ | → `issued_invoice` 提出済みなら 🟡推奨（入金確認） |
| `payment_statement` | ⚪ | → `recv_invoice`(外注費)提出済みなら 🟡推奨（源泉徴収確認） |
| `platform_csv` | ⚪ | → 業種がEC/プラットフォーム系なら 🟡推奨 |
| `salary_cert` | ⚪ | → 給与所得がある場合（本業が会社員 etc.）。判定不可のため対象外 |
| `stock_report` | ⚪ | → 判定不可のため対象外 |
| `crypto_history` | ⚪ | → 判定不可のため対象外 |
| `pension_cert` | ⚪ | → 判定不可のため対象外 |
| `realestate_inc` | ⚪ | → 業種が不動産系なら 🔴必須 |
| `insurance_mat` | ⚪ | → 判定不可のため対象外 |

##### 【経費系 14コード】

| コード | デフォルト | 条件による昇格 |
|--------|-----------|---------------|
| `receipt` | 🔴必須 | — 経費証拠として最低1件必須（`receipt` OR 経費系いずれか） |
| `pdf_invoice` | ⚪ | — `receipt` と合わせて経費系として判定 |
| `recv_invoice` | 🟡推奨 | — 仕入・外注がある事業者なら推奨 |
| `invoice` | ⚪ | — 上記2種のフォールバック |
| `credit_card` | 🟡推奨 | — 全クライアント推奨（経費漏れ防止） |
| `e_money_statement` | ⚪ | → 判定不可のため対象外 |
| `etc_statement` | ⚪ | → `shaken` 提出済みなら 🟡推奨（車両保有＝高速利用あり得る） |
| `expense_report` | ⚪ | → `payroll` 提出済みなら 🟡推奨（従業員の経費精算） |
| `inventory` | ⚪ | → 業種が小売/卸売/製造なら 🟡推奨（期末棚卸） |
| `tax_interim` | ⚪ | → `prev_return` の内容で判定 or 対象外 |
| `payment_notice` | ⚪ | → 対象外 |
| `bank_transfer_receipt` | ⚪ | → 対象外（bank_statement で代替可能） |
| `utility_bill` | 🟡推奨 | — 事業用の水道光熱費・通信費。全クライアント推奨 |
| `tax_receipt` | 🟡推奨 | — 税金・社会保険料の納付済領収書。全クライアント推奨 |

##### 【複合仕訳 2コード】

| コード | デフォルト | 条件による昇格 |
|--------|-----------|---------------|
| `payroll` | ⚪ | → `senjusha` 提出済みなら 🔴必須（専従者がいる＝給与発生） |
| `sales_report` | ⚪ | → 業種が飲食/小売なら 🟡推奨（日次売上管理） |

##### 【資産・償却系 2コード】

| コード | デフォルト | 条件による昇格 |
|--------|-----------|---------------|
| `fixed_asset` | ⚪ | → `shaken`(車検証)提出済み or 業種が製造/建設なら 🟡推奨 |
| `loan_schedule` | ⚪ | → `housing_loan` 提出済みなら 🟡推奨 |

##### 【所得控除・税額控除系 11コード】— 全個人事業主に広く推奨

| コード | デフォルト | 条件による昇格 |
|--------|-----------|---------------|
| `kokuho` | 🟡推奨 | — 社会保険料控除（ほぼ全員該当） |
| `nenkin` | 🟡推奨 | — 社会保険料控除（ほぼ全員該当） |
| `shokibo` | 🟡推奨 | — 小規模企業共済等掛金控除 |
| `ideco` | 🟡推奨 | — 小規模企業共済等掛金控除 |
| `life_insurance` | 🟡推奨 | — 生命保険料控除 |
| `earthquake_ins` | 🟡推奨 | — 地震保険料控除 |
| `medical` | 🟡推奨 | — 医療費控除 |
| `furusato` | 🟡推奨 | — 寄附金控除 |
| `housing_loan` | 🟡推奨 | — 住宅ローン控除 |
| `deduction_cert` | ⚪ | → 対象外（包括的すぎて判定不可） |
| `other_deduction` | ⚪ | → 対象外 |

##### 【メタデータ系 21コード + 保管1 + FB1】

| コード | デフォルト | 条件による昇格 |
|--------|-----------|---------------|
| `mynumber` | 🔴必須 | — 確定申告に必須 |
| `kaigyo` | 🔴必須 | — 開業届控え |
| `aoiro` | 🔴必須 | — 青色申告承認申請書控え |
| `prev_return` | 🔴必須 | — 繰越損失・予定納税額の参照 |
| `invoice_reg` | ⚪ | → `invoice_registered=true` なら 🔴必須 |
| `kanizei` | ⚪ | → `tax_category='簡易課税'` なら 🔴必須 |
| `senjusha` | ⚪ | → `payroll` 提出済みなら 🟡推奨（家族従業員の届出） |
| `chintai` | 🟡推奨 | — 事業用の賃貸借契約書。ほとんどの事業者に推奨 |
| `gaichuu` | ⚪ | → `recv_invoice` or `payment_notice` 提出済みなら 🟡推奨 |
| `shaken` | ⚪ | → 業種が運送/建設/営業系なら 🟡推奨 |
| `lease` | ⚪ | → 対象外 |
| `insurance_policy` | ⚪ | → `life_insurance` or `earthquake_ins` 提出済みなら 🟡推奨 |
| `fudosan_contract` | ⚪ | → `realestate_inc` 提出済みなら 🟡推奨 |
| `tanaoroshi_method` | ⚪ | → `inventory` 提出済みなら 🟡推奨 |
| `shoukyaku_method` | ⚪ | → `fixed_asset` 提出済みなら 🟡推奨 |
| `id_card` | ⚪ | → 対象外（マイナンバーで代替） |
| `contract` | ⚪ | → 対象外 |
| `estimate` | ⚪ | → 対象外 |
| `purchase_order` | ⚪ | → 対象外 |
| `delivery_note` | ⚪ | → 対象外 |
| `registry` | ⚪ | → `fudosan_contract` 提出済みなら 🟡推奨 |
| `minutes` | ⚪ | → 対象外 |
| `other_ref` | ⚪ | → 対象外 |
| `other_journal` | ⚪ | → 対象外 |

#### 集計

| 分類 | デフォルト必須 | 条件付き必須 | デフォルト推奨 | 条件付き推奨 | 対象外 |
|------|-------------|------------|-------------|------------|-------|
| 件数 | 5件 | 4件 | 13件 | 14件 | 27件 |

- **デフォルト必須(5)**: bank_statement, receipt(経費系), mynumber, kaigyo, aoiro, prev_return
- **条件付き必須(4)**: invoice_reg, kanizei, realestate_inc, payroll
- **デフォルト推奨(13)**: issued_invoice, recv_invoice, credit_card, utility_bill, tax_receipt, chintai, kokuho, nenkin, shokibo, ideco, life_insurance, earthquake_ins, medical, furusato, housing_loan
- **条件付き推奨(14)**: 提出済み書類や業種から動的に昇格

#### 提出済み判定

`documents` テーブルで `client_id` + `ocr_step1_type`（= 分類済みコード）を集計。
ワークフロー横断で「このクライアントに何が届いているか」を一括チェック。

> 「経費系いずれか」の判定: receipt, pdf_invoice, recv_invoice, invoice, credit_card,
> e_money_statement, etc_statement, expense_report のいずれか1件以上あればOK。

#### 表示場所

1. **ClientSummaryPage** — 不足書類チェックカードを追加（メイン表示）
2. **通知** — ワークフロー完了時に不足があれば通知を作成

### 実装手順

- [x] DOC-CHECK-1: 不足判定ドメインサービス作成
  - `src/domain/document/missing-docs-checker.ts` 新規作成
  - クライアント属性 + 提出済み書類から必須/推奨を動的生成

- [x] DOC-CHECK-2: バックエンド API エンドポイント
  - `src/api/routes/client/client.missing-docs.ts` 新規作成
  - `GET /api/clients/:id/missing-docs`

- [x] DOC-CHECK-3: backend.api.ts にエンドポイント追加
  - `clientsApi.getMissingDocs(clientId)` + MissingDocsResult 型定義

- [x] DOC-CHECK-4: ClientSummaryPage に不足書類カード追加
  - 必須不足=赤、推奨不足=黄（折りたたみ）、提出済み=緑サマリー

- [x] DOC-CHECK-5: TypeScriptビルド検証 — エラーなし

- [ ] DOC-CHECK-6: 通知連携（後回し可）
  - ワークフロー完了時に `checkMissingDocs()` を実行
  - 必須不足がある場合のみ通知を作成

### 検証

1. `npx tsc --noEmit` — 型エラーなし
2. ClientSummaryPage で各クライアントの不足書類が正しく表示される
3. インボイス登録済み / 簡易課税クライアントで条件付き必須が正しく動作する
4. 全書類提出済みクライアントでは「不足なし」と表示される

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
