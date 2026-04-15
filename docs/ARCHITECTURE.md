# 仕訳くん アーキテクチャガイド

> 証憑アップロード → OCR → AI仕訳生成 → レビュー → freeeエクスポート
> を自動化する税理士事務所向けWebアプリケーション


---


# 全体マップ

```
src/
 |
 |  [ バックエンド ]
 |
 |-- domain/            ビジネスロジック（ドメイン層）
 |   |-- accounting/       会計計算ユーティリティ・貸借バランス検証
 |   |-- auth/             認可サービス・ロール型定義
 |   |-- document/         書類型定義・重複チェック・取引先名寄せ
 |   |-- export/           CSV生成（freee形式 / 独自形式）
 |   |-- journal/          仕訳生成パイプライン・AIプロンプト・ルール生成
 |   |-- master/           マスタデータサービス
 |   |-- notification/     通知サービス
 |   |-- ocr/              OCRパイプライン（分類→抽出→明細分割）
 |   '-- rule-engine/      ルールマッチング・競合検出・優先度解決
 |
 |-- adapters/          外部サービスとの接続を隔離
 |   |-- gemini/           Google Gemini API クライアント
 |   |-- supabase/         Supabase 管理者クライアント（サーバー用）
 |   '-- freee/            freee REST API クライアント
 |
 |-- api/               Express ルート定義・ミドルウェア
 |   |-- helpers/          共通ヘルパー（async-handler, pagination）
 |   |-- middleware/       認証・認可・レート制限・ログ・エラーハンドリング
 |   '-- routes/           ドメイン別ルートハンドラ
 |       |-- client/         顧客・按分率・ワークフロー
 |       |-- document/       書類アップロード・OCR・ストレージ・バッチ
 |       |-- journal/        仕訳CRUD・生成・操作・修正履歴
 |       |-- master/         勘定科目・税区分・業種・取引先・品目・ルール
 |       |-- export/         freee連携エクスポート
 |       |-- system/         ヘルスチェック・バリデーション
 |       '-- user/           ユーザー・通知
 |
 |-- server/            Expressサーバー起動・ミドルウェア接続
 |   '-- index.ts          エントリポイント（npm run start が実行）
 |
 |
 |  [ フロントエンド ]
 |
 |-- web/
 |   |-- app/              アプリの骨格
 |   |   |-- providers/      Auth / MasterData / Workflow の Context
 |   |   |-- layouts/        MainLayout（サイドバー + ヘッダー + 通知）
 |   |   |-- App.tsx         ルートコンポーネント
 |   |   '-- routes.tsx      全URL → ページの対応表
 |   |
 |   |-- features/         画面ごとの機能フォルダ（実体ファイル格納）
 |   |   |-- auth/           ログイン
 |   |   |-- clients/        顧客一覧・サマリー
 |   |   |-- workflow/       アップロード → OCR → レビュー → エクスポート
 |   |   |-- rules/          ルール管理
 |   |   |-- master/         マスタ管理（科目・税区分・業種・取引先・品目）
 |   |   |-- approvals/      承認
 |   |   |-- excluded/       対象外証憑
 |   |   '-- settings/       ユーザー設定
 |   |
 |   '-- shared/           2つ以上の feature で使う共有部品
 |       |-- components/     Modal, ComboBox, ErrorBoundary, ConfirmDialog, Toast, PageSuspense
 |       |-- hooks/          useAsync, useCrud, useModal, useSearchFilter, useConfirm
 |       |-- constants/      statuses, keyboard, ui
 |       |-- lib/api/        backend.api.ts（全エンドポイント型付きAPIクライアント）
 |       |-- lib/            supabase.ts（フロント用クライアント）
 |       |-- types/          UI専用の拡張型
 |       '-- utils/          日付・金額フォーマッター
 |
 |
 |  [ 共有 ]
 |
 |-- shared/            サーバー/クライアント両方で使う
 |   |-- types/            全DBモデル型定義（50+ interface）
 |   |-- errors/           構造化エラークラス（AppError, NotFoundError 等）
 |   '-- utils/            normalizeJapanese, csv-escape, encryption, concurrent, ttl-cache
 |
 '-- db/                SQLスキーマ・マイグレーション・クエリ・シード
```


---


# バックエンド詳細


## domain/ ── ビジネスロジック

> フレームワーク・DB に依存しないドメインロジック。

### accounting/

```
accounting-utils.ts    会計計算ユーティリティ（消費税・源泉税・家事按分・端数処理）
balance-validator.ts   複式簿記の貸借バランス検証
```

### auth/

```
authorization.service.ts  認可サービス（組織所有権検証・IDOR防止）
role.types.ts             ロール・権限定義（ROLE_PERMISSIONS マップ）
```

### document/

```
document.types.ts       書類関連の型定義
duplicate-checker.ts    書類重複チェック（金額・日付・取引先の類似度）
supplier-matcher.ts     取引先自動マッチング（完全一致→部分一致→エイリアス）
```

### export/

```
freee-csv.builder.ts    freee 取込用 CSV ビルダー（21列公式フォーマット）
simple-csv.builder.ts   仕訳くん 独自形式 CSV ビルダー
```

### journal/

```
accounting-constants.ts    会計定数（STATEMENT_EXTRACT_TYPES, FREEE_TAX_CODE_LOOKUP 等）
ai-generator.prompt.ts     AI 仕訳生成プロンプトテンプレート
ai-generator.service.ts    AI 仕訳生成サービス（Gemini Pro 呼び出し）
journal-pipeline.service.ts 仕訳生成パイプライン（ルールマッチ → AIフォールバック）
journal.types.ts           仕訳関連の型定義
line-mapper.service.ts     仕訳明細行マッピング（科目名→UUID / 取引先名→UUID）
rule-generator.service.ts  修正パターンからルール自動生成
```

### master/

```
master-data.service.ts   マスタデータ取得サービス（勘定科目・税区分等）
```

### notification/

```
notification.service.ts  通知サービス（通知レコードの作成）
```

### ocr/

```
ocr.types.ts              OCR全型定義（ClassificationResult / OCRResult / OCRTransaction / ExtractedLine）
ocr-pipeline.service.ts   OCRパイプライン統合サービス（分類→抽出→明細分割の一貫実行）
ocr-parse-utils.ts        OCR結果のJSONパース・修復ユーティリティ

classifier.prompt.ts      証憑分類プロンプト（63書類種別対応）
classifier.service.ts     classifyDocument() → 種別コード + 確信度

extractor.prompt.ts       OCRデータ抽出プロンプト（全書類種別対応のJSONスキーマ）
extractor.service.ts      processOCR() → OCRResult

multi-extractor.prompt.ts 明細分割プロンプト（通帳・クレカ等の複数行抽出）
multi-extractor.service.ts extractMultipleEntries() → MultiExtractResult
```

### rule-engine/

```
condition-evaluator.ts     テーブル駆動の条件評価器（16種の条件をAND評価）
conflict-detector.ts       ルール競合検出（条件セット JSON 一致判定）
matcher.service.ts         ルールマッチングサービス（優先度順序付け）
matcher-with-candidates.ts 候補付きルールマッチング
priority-resolver.ts       ルール優先度解決（client > industry > shared）
rule-engine.types.ts       ルールエンジン型定義
rule-name-generator.ts     ルール名自動生成
```


---


## adapters/ ── 外部サービスの隔離

### gemini/

```
gemini.config.ts     モデル名・リトライ回数(4)・最小間隔(150ms)
gemini.client.ts     GoogleGenAI初期化 + callGeminiWithRetry()
                     指数バックオフ(1s→2s→4s→8s)
                     キューベースの直列化（並列リクエスト対応）
```

### supabase/

```
supabase-admin.client.ts  サーバー用（service_role key、RLSバイパス）
```

### freee/

```
freee.api-client.ts   freee 会計 API クライアント（取引登録・5件並列バッチ）
```


---


## api/ ── Express ルート定義

### ドメイン別ルート（api/routes/{domain}/）

| ドメイン | ファイル | エンドポイント | 処理内容 |
|---|---|---|---|
| client | client.crud.ts | /api/clients | 顧客CRUD（業種JOIN） |
| client | client-ratios.crud.ts | /api/client-ratios | 家事按分率CRUD |
| client | workflow.crud.ts | /api/workflows | ワークフローCRUD |
| document | document.upload.ts | /api/documents/upload | 証憑アップロード（multer） |
| document | document.crud.ts | /api/documents | 書類CRUD |
| document | document.ocr.ts | /api/ocr/process | OCR処理（分類+抽出+重複チェック） |
| document | document.batch.ts | /api/process/batch | 一括OCR+仕訳生成 |
| document | document.storage.ts | /api/storage | ストレージ（署名付きURL） |
| journal | journal.crud.ts | /api/journal-entries | 仕訳CRUD |
| journal | journal.generate.ts | /api/journal-entries/generate | 仕訳生成（ルール→AI） |
| journal | journal.operations.ts | /api/journal-entries/... | 承認・一括ステータス更新 |
| journal | journal-corrections.crud.ts | /api/journal-corrections | 修正履歴CRUD |
| journal | journal-lines.crud.ts | /api/journal-entry-lines | 仕訳明細行CRUD |
| master | account-items.crud.ts | /api/account-items | 勘定科目CRUD |
| master | tax-categories.crud.ts | /api/tax-categories | 税区分CRUD |
| master | industries.crud.ts | /api/industries | 業種CRUD |
| master | suppliers.crud.ts | /api/suppliers | 取引先CRUD（エイリアス管理） |
| master | items.crud.ts | /api/items | 品目CRUD（エイリアス管理） |
| master | rules.crud.ts | /api/processing-rules | 仕訳ルールCRUD |
| export | freee.ts | /api/freee/export | freee連携エクスポート |
| system | health.ts | /api/health | ヘルスチェック |
| system | validation.ts | /api/validate/... | バリデーション |
| user | users.crud.ts | /api/users | ユーザーCRUD（RBAC付き） |
| user | notifications.crud.ts | /api/notifications | 通知CRUD |

### 共通ヘルパー（api/helpers/）

```
async-handler.ts     asyncHandler() — ルートハンドラの try-catch ラッパー
pagination.ts        parsePagination() — ページネーション解析（デフォルト20件、最大100件）
```

### ミドルウェア（api/middleware/）

```
auth.middleware.ts          JWT認証チェック（Supabaseトークン検証）
rbac.middleware.ts          ロールベース認可（requirePermission ファクトリ）
rate-limit.middleware.ts    apiLimiter(100回/15分)  expensiveLimiter(20回/15分)
logging.middleware.ts       リクエストログ出力
error-handler.middleware.ts エラー応答 + 404ハンドラ（AppError対応）
validate.middleware.ts      validateBody() リクエストボディバリデーション
```


---


## server/ ── エントリポイント

```
index.ts       Express初期化 → ミドルウェア → ルートマウント → サーバー起動
               - /health をミドルウェア前に配置（ヘルスチェック高速化）
               - express.static を CORS より前に配置（静的ファイルの500エラー回避）
               - CORSは /api パスのみに適用
               - 本番環境: dist/ を静的配信 + SPA catch-all
```


---


# フロントエンド詳細


## web/features/ ── 画面の実体

> 各 feature は独立したフォルダ。
> feature 間の直接 import は禁止。共通部品は shared/ に。

### auth/

| ファイル | URL | 画面の内容 |
|---|---|---|
| LoginPage.tsx | `/login` | メール+パスワード / Google OAuth / 新規登録 |

### clients/

| ファイル | URL | 画面の内容 |
|---|---|---|
| ClientListPage.tsx | `/clients` | 顧客一覧。新規追加・編集・削除。業種フィルタ。一括CSV登録 |
| ClientSummaryPage.tsx | `/clients/:id/summary` | 顧客サマリー。売上・税区分・ワークフロー進捗・書類統計 |

### workflow/（アプリの中心）

| ファイル | URL | 画面の内容 |
|---|---|---|
| UploadPage.tsx | `/clients/:id/upload` | 証憑ドラッグ&ドロップ。進捗バー。重複検出 |
| UploadOnlyPage.tsx | `/upload-only` | viewer専用の簡易アップロード |
| OCRPage.tsx | `/clients/:id/ocr` | OCR実行・進捗。結果プレビュー。通帳等の複数行分割 |
| **ReviewPage.tsx** | `/clients/:id/review` | **最重要ページ。** 仕訳の確認・編集。科目/税区分変更。取引先名寄せ。承認/除外 |
| ExportPage.tsx | `/clients/:id/export` | 期間フィルタ。独自CSV / freee CSV / freee API 出力 |

workflow 内部コンポーネント:
```
components/
  WorkflowHeader.tsx     4ステップ進捗表示 + 前後ナビ
  EntryCard.tsx          個別の仕訳カード（インライン編集・削除・復元）
  ImageViewer.tsx        証憑画像プレビュー（ズーム・回転対応）
  MultiEntryPanel.tsx    通帳・クレカ明細の複数取引パネル

context/                 ★ 3サブコンテキスト構成
  ReviewContext.tsx       オーケストレーター + 後方互換 useReview()
  ReviewViewContext.tsx   ビュー状態（viewMode, activeTab, zoom, rotation）
  ReviewFormContext.tsx   フォーム状態（form, compoundLines, saving, ruleScope 等）
  ReviewDataContext.tsx   データ状態（items, entries, masterData, computed counts）
  useReviewData.ts       データ読み込み（documents + entries + master を Promise.allSettled で並列取得）
  useReviewActions.ts    操作（保存・承認・除外・ルール作成・ナビゲーション）
  useReviewKeyboard.ts   キーボードショートカット（useRef パターンで安定化）

doc-types/
  registry.ts            全書類種別の設定レジストリ
                         layout / extraSections / supportsMultiLine を宣言的に定義
  types.ts               DocTypeConfig 型定義

layouts/                 書類種別に応じた5種のレイアウト
  LayoutDispatcher.tsx   doc_classification.document_type_code → レイアウト振り分け
  SingleEntryLayout.tsx  単一仕訳（レシート・請求書等）
  StatementLayout.tsx    明細テーブル（通帳・クレカ明細等）
  CompoundEntryLayout.tsx 複合仕訳テーブル（給与明細・売上集計等）
  MetadataLayout.tsx     メタデータ表示（届出書・契約書等）
  ArchiveLayout.tsx      保管のみ表示

sections/                レビュー画面の共通UIセクション
  CoreFieldsGrid.tsx     基本フィールド（日付・金額・科目・税区分・税率・品目・摘要）
  SupplierField.tsx      取引先入力（ComboBox + エイリアスマッチ）
  BusinessRatioPanel.tsx 事業按分パネル
  BusinessToggleRow.tsx  事業/私用切替
  OcrSummaryBadges.tsx   書類種別・AI信頼度のバッジ表示
  OcrReferenceBox.tsx    OCR結果の参照表示（取引先・金額・日付）
  RuleCandidatesBar.tsx  マッチしたルール候補表示
  MultiEntrySiblingTabs.tsx 同一書類の複数仕訳タブ切替
  NavigationBar.tsx      前後ドキュメント移動
  ExcludeButton.tsx      仕訳対象外ボタン
  SaveStatusBar.tsx      保存状態インジケーター

sections/doc-specific/   書類種別固有のセクション（19種）
  index.tsx              セクションコード → コンポーネントのマッピング（React.lazy）
  ReceiptItemList.tsx    レシート品目一覧
  InvoicePanel.tsx       請求書インボイス情報
  WithholdingPanel.tsx   源泉徴収パネル
  TransferFeePanel.tsx   振込手数料パネル
  PaymentMethodSelector.tsx 決済手段選択
  ReconciliationPanel.tsx 入金消込パネル
  IncomeCalcPanel.tsx    所得計算パネル
  DeductionCalcPanel.tsx 控除計算パネル
  PayrollSummaryPanel.tsx 給与明細サマリー
  SalesBreakdownPanel.tsx 売上内訳パネル
  MetadataFieldsPanel.tsx メタデータ表示パネル
  DepreciationPanel.tsx  減価償却パネル
  CarryoverPanel.tsx     繰越パネル
  FurusatoCalcPanel.tsx  ふるさと納税計算パネル
  HousingLoanCalcPanel.tsx 住宅ローン控除計算パネル
  InventoryCalcPanel.tsx 棚卸計算パネル
  LifeInsCalcPanel.tsx   生命保険料控除計算パネル
  MedicalCalcPanel.tsx   医療費控除計算パネル

lib/
  workflowStorage.ts     ワークフロー状態の永続化（localStorage）
```

### rules/

| ファイル | URL | 画面の内容 |
|---|---|---|
| RulesIndexPage.tsx | `/master/rules` | ルール一覧。スコープ別フィルタ |
| IndustryDetailPage.tsx | `/master/rules/industry/:id` | 業種別ルール詳細 |
| ClientListPage.tsx | `.../clients` | 業種配下の顧客一覧 |
| ClientDetailPage.tsx | `.../client/:id` | 顧客別ルール詳細 |

### master/

| ファイル | URL | 画面の内容 |
|---|---|---|
| AccountsPage.tsx | `/master/accounts` | 勘定科目。カテゴリ別表示・検索 |
| TaxCategoriesPage.tsx | `/master/tax-categories` | 税区分。課税/非課税/免税・税率設定 |
| IndustriesPage.tsx | `/master/industries` | 業種マスタ |
| SuppliersPage.tsx | `/master/suppliers` | 取引先。エイリアス管理 |
| ItemsPage.tsx | `/master/items` | 品目マスタ |

master/hooks:
```
useAccountsData.ts    勘定科目データ hook
useItemsData.ts       品目データ hook
useSuppliersData.ts   取引先データ hook
```

### その他

| ファイル | URL | 画面の内容 |
|---|---|---|
| ApprovalsPage.tsx | `/approvals` | 仕訳承認。承認/却下/一括承認 |
| ExcludedPage.tsx | `/clients/:id/excluded` | 対象外証憑の一覧と復元 |
| ExcludedHistoryPage.tsx | `/clients/:id/excluded-history` | 除外履歴 |
| SettingsPage.tsx | `/settings` | ユーザー管理 |


---


## web/shared/ ── 共有部品

```
components/
  ui/Modal.tsx                汎用モーダルダイアログ
  ui/ComboBox.tsx             検索付きドロップダウン（科目・取引先選択）
  ui/ConfirmDialog.tsx        確認ダイアログ（Promise ベース）
  ui/Toast.tsx                トースト通知（4タイプ・自動消去）
  ErrorBoundary.tsx           エラーバウンダリ（フォールバック UI + 再試行）
  PageSuspense.tsx            ページ遅延読み込み用ローディング UI
  journal/CompoundJournalTable.tsx  複合仕訳テーブル

lib/
  supabase.ts                フロント用 Supabase クライアント（anon key・認証専用）
  supabase.debug.ts          Supabase 接続デバッグユーティリティ
  api/backend.api.ts         全バックエンドAPI呼び出し関数（型付き）

hooks/
  useAsync.ts                非同期処理 hook（loading/error/data）
  useCrud.ts                 CRUD hook（一覧・作成・更新・削除 + 自動リロード）
  useModal.ts                モーダル hook（open/close + 編集アイテム管理）
  useSearchFilter.ts         検索フィルタ hook
  useConfirm.ts              確認ダイアログ hook（Promise ベース）

constants/
  statuses.ts                仕訳ステータス定数・ラベル・バッジカラーマップ
  keyboard.ts                キーボードショートカット定数
  ui.ts                      UI 定数（ZOOM, NOTIFICATION_POLL_INTERVAL, WORKFLOW_STEPS）

types/
  views.ts                   UI専用の拡張型（EntryWithJoin 等）

utils/
  format.ts                  フォーマットユーティリティ（通貨・日付）
```


---


## web/app/ ── アプリ骨格

```
App.tsx          BrowserRouter + AuthProvider + PrivateRoute
routes.tsx       全URL → ページコンポーネントの対応表
main.tsx         ReactDOM.createRoot（index.html のエントリポイント）

providers/
  AuthProvider.tsx       user / userProfile(role, org_id, name) / loading
  MasterDataProvider.tsx accountItems / taxCategories / Map / refresh()
  WorkflowProvider.tsx   currentWorkflow / ステップ移動メソッド群

layouts/
  MainLayout.tsx         レイアウトオーケストレーター
  Sidebar.tsx            サイドバー（展開/折りたたみ・ロールベース表示）
  NotificationBell.tsx   通知ベル（ポーリング・既読管理・ドロップダウン）
  AuthLayout.tsx         認証画面用レイアウト
```


---


# データフロー

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌──────────┐
│  Upload  │ →  │   OCR    │ →  │  仕訳生成     │ →  │  Review  │ →  │  Export  │
│          │    │          │    │              │    │          │    │          │
│ Dropzone │    │ Gemini   │    │ ルールマッチ   │    │ 確認/編集 │    │ CSV作成  │
│ → Storage│    │ Flash    │    │  ↓ 失敗時     │    │ 承認/却下 │    │ freee API│
│ → DB登録 │    │ → JSON   │    │ Gemini Pro   │    │ 名寄せ   │    │          │
└──────────┘    └──────────┘    └──────────────┘    └──────────┘    └──────────┘
```

### 仕訳生成の戦略（3分岐）

```
A. 明細分割対象（通帳・クレカ・給与明細等）
   → extractMultipleEntries() で行ごとに分割
   → 各行ごとに下記 B or C で仕訳生成

B. ルールマッチ
   matchProcessingRules()  ルール配列を scope 優先順に走査
       ↓ マッチあり
   buildEntryFromRule()    ルールから仕訳構築（家事按分対応）

       ↓ マッチなし
C. AI 生成
   generateJournalEntry()  Gemini Pro で AI 生成

       ↓
   mapLinesToDBFormat()    科目名→UUID / 取引先名→UUID に変換
```

### OCRパイプライン（3段階）

```
Step 1: 分類 (classifier.service)
  classifyDocument() → document_type_code + confidence
  ├── 非仕訳対象 & confidence >= 0.8 → 即 excluded（Step 2 スキップ）
  └── それ以外 → Step 2 へ

Step 2: 抽出 (extractor.service)
  processOCR() → OCRResult（取引先・金額・日付・品目等）

Step 3: 明細分割 (multi-extractor.service)  ※該当種別のみ
  extractMultipleEntries() → 行ごとの取引に分割
```

### フロントエンド ↔ バックエンド通信

```
フロント (React)                    バックエンド (Express)
  backend.api.ts                     api/routes/{domain}/*.ts
    clientsApi.getAll()  ──────→     GET /api/clients
    journalEntriesApi.create() ──→   POST /api/journal-entries

  直接fetch                          api/routes/document/
    POST /api/ocr/process  ────→     OCR処理 → Gemini Flash
    POST /api/journal-entries/generate → 仕訳生成 → Gemini Pro

  supabase.ts（認証のみ）
    supabase.auth.signIn()           Supabase Auth（直接）
    supabase.storage.upload()        Supabase Storage（直接）
```


---


# shared/ ── サーバー/クライアント共用

```
types/
  index.ts     型 re-export。@/types エイリアスで参照可能

errors/
  app-errors.ts  構造化エラークラス（AppError / NotFoundError / ForbiddenError / ValidationError）

utils/
  normalize-japanese.ts   日本語正規化（全角→半角、カタカナ→ひらがな、法人格除去）
  csv-escape.ts           RFC 4180 準拠 CSV エスケープ
  encryption.ts           AES-256-GCM トークン暗号化/復号
  concurrent.ts           並行処理ユーティリティ
  ttl-cache.ts            TTL付きキャッシュ
  request-helpers.ts      リクエストヘルパー
```


---


# 環境変数

```
# 必須
GEMINI_API_KEY                 Gemini API キー
SUPABASE_SERVICE_ROLE_KEY      サーバー用（RLSバイパス）
SUPABASE_URL                   Supabase URL
VITE_SUPABASE_URL              フロント用 Supabase URL
VITE_SUPABASE_ANON_KEY         フロント用 anon key（認証のみ使用）

# オプション
GEMINI_MODEL_OCR               OCRモデル         (default: gemini-3-flash-preview)
GEMINI_MODEL_JOURNAL           仕訳モデル        (default: gemini-3.1-pro-preview)
ALLOWED_ORIGINS                CORS許可オリジン   (default: http://localhost:5173)
PORT                           サーバーポート     (default: 3001)
NODE_ENV                       環境              (production で静的配信有効)
```


---


# ビルドとデプロイ

```bash
npm run dev          # Vite 開発サーバー（フロントのみ）
npm run build        # フロントエンドビルド（tsc -b + vite build → dist/）
npm run build:server # サーバービルド（tsc → dist-server/）
npm run build:all    # 上記2つを順次実行
npm run start        # サーバー起動（node dist-server/server/index.js）
npm test             # テスト実行（vitest）
```

### Render デプロイ設定（render.yaml）

```
buildCommand: npm ci --include=dev && npm run build:all
startCommand: npm run start
```

- フロントエンド: `dist/` に出力 → Express が静的配信
- サーバー: `dist-server/` に出力（`dist/` とは分離し、静的配信で露出しない）
- SPA フォールバック: `app.get('*')` で `dist/index.html` を返す


---


# 設計原則

1. **フロントはバックエンドAPI経由** — `supabase.from()` を直接呼ばない（認証・ストレージを除く）
2. **domain/ にビジネスロジック集約** — ルートハンドラは薄く、ロジックはドメイン層に
3. **adapters/ で外部を隔離** — SDK更新・API仕様変更はここだけで吸収
4. **features/ は独立** — feature間の直接importは禁止、共通部品はshared/に


---


# 関連ドキュメント

| ファイル | 内容 |
|---------|------|
| [SHIWAKE.md](./SHIWAKE.md) | 仕訳処理の詳細仕様（書類分岐フロー・レイアウト構成・OCR抽出フィールド・DB格納情報） |
