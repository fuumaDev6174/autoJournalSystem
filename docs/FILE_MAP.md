# ファイルマップ — 全ソースファイルの役割一覧

> プロジェクト内の全ファイルの役割を一目で把握するためのドキュメント。  
> 最終更新: 2026-04-15

---

## 目次

1. [ルート設定ファイル](#ルート設定ファイル)
2. [src/adapters/ — 外部サービス接続](#srcadapters--外部サービス接続)
3. [src/api/ — REST API サーバー](#srcapi--rest-api-サーバー)
4. [src/domain/ — ビジネスロジック（ドメイン層）](#srcdomain--ビジネスロジックドメイン層)
5. [src/server/ — サーバーエントリーポイント](#srcserver--サーバーエントリーポイント)
6. [src/shared/ — バックエンド/フロントエンド共有](#srcshared--バックエンドフロントエンド共有)
7. [src/web/ — フロントエンド（React SPA）](#srcweb--フロントエンドreact-spa)
8. [src/db/ — データベース](#srcdb--データベース)

---

## ルート設定ファイル

```
beso/
├── index.html                  HTMLエントリーポイント（lang="ja"）
├── package.json                依存関係・スクリプト定義
├── tsconfig.json               TypeScript ベース設定（paths エイリアス @/ 定義）
├── tsconfig.app.json           フロントエンド用 TS 設定
├── tsconfig.node.json          Vite/Node 用 TS 設定
├── tsconfig.server.json        バックエンドサーバー用 TS 設定
├── vite.config.ts              Vite ビルド設定（プロキシ・エイリアス）
├── tailwind.config.ts          Tailwind CSS 設定（primary/danger/success/warning トークン）
├── postcss.config.js           PostCSS 設定（Tailwind プラグイン）
├── render.yaml                 Render デプロイ設定
├── CLAUDE.md                   AI アシスタント向けプロジェクト指示
├── TASKS.md                    タスク管理・進捗管理
└── docs/
    ├── ARCHITECTURE.md         アーキテクチャガイド
    ├── FILE_MAP.md             ← このファイル
    └── SHIWAKE.md              仕訳処理の詳細仕様
```

---

## src/adapters/ — 外部サービス接続

外部 API やデータベースとの接続を担当。アプリケーションロジックとは分離。

```
adapters/
├── freee/
│   └── freee.api-client.ts     freee 会計 API クライアント（取引登録・5件並列バッチ）
│
├── gemini/
│   ├── gemini.client.ts        Google Gemini API クライアント（リトライ・ジッター・レート制限）
│   └── gemini.config.ts        Gemini モデル名・温度パラメータ等の設定
│
└── supabase/
    └── supabase-admin.client.ts Supabase 管理者クライアント（サーバー用・RLS バイパス）
```

---

## src/api/ — REST API サーバー

Express ベースの REST API。認証・認可・バリデーション・エラーハンドリングを提供。

```
api/
├── helpers/
│   ├── async-handler.ts        asyncHandler() — ルートハンドラの try-catch ラッパー
│   └── pagination.ts           parsePagination() — ページネーション解析（デフォルト20件、最大100件）
│
├── middleware/
│   ├── auth.middleware.ts       JWT 認証ミドルウェア（Supabase トークン検証）
│   ├── error-handler.middleware.ts  構造化エラーハンドリング（AppError 対応）
│   ├── logging.middleware.ts    リクエストログ出力
│   ├── rate-limit.middleware.ts レート制限
│   ├── rbac.middleware.ts       ロールベース認可（requirePermission ファクトリ）
│   └── validate.middleware.ts   validateBody() — リクエストボディバリデーション
│
└── routes/                      ドメイン別ルートハンドラ
    ├── client/
    │   ├── index.ts             クライアントルーター統合
    │   ├── client.crud.ts       顧客 CRUD（業種JOIN）
    │   ├── client-ratios.crud.ts 家事按分率 CRUD
    │   └── workflow.crud.ts     ワークフロー CRUD
    │
    ├── document/
    │   ├── index.ts             ドキュメントルーター統合
    │   ├── document.crud.ts     書類 CRUD
    │   ├── document.upload.ts   証憑アップロード（multer）
    │   ├── document.ocr.ts      OCR 処理エンドポイント
    │   ├── document.batch.ts    一括 OCR + 仕訳生成
    │   └── document.storage.ts  ストレージ操作（署名付き URL 生成）
    │
    ├── journal/
    │   ├── index.ts             仕訳ルーター統合
    │   ├── journal.crud.ts      仕訳 CRUD
    │   ├── journal.generate.ts  仕訳生成（ルールマッチ → AI フォールバック）
    │   ├── journal.operations.ts 承認・一括ステータス更新
    │   ├── journal-corrections.crud.ts 修正履歴 CRUD
    │   └── journal-lines.crud.ts 仕訳明細行 CRUD
    │
    ├── master/
    │   ├── index.ts             マスタルーター統合
    │   ├── account-items.crud.ts 勘定科目 CRUD
    │   ├── tax-categories.crud.ts 税区分 CRUD
    │   ├── industries.crud.ts   業種 CRUD
    │   ├── suppliers.crud.ts    取引先 CRUD（エイリアス管理含む）
    │   ├── items.crud.ts        品目 CRUD（エイリアス管理含む）
    │   └── rules.crud.ts        仕訳ルール CRUD
    │
    ├── export/
    │   ├── index.ts             エクスポートルーター統合
    │   └── freee.ts             freee 連携エクスポート
    │
    ├── system/
    │   ├── index.ts             システムルーター統合
    │   ├── health.ts            ヘルスチェック + 環境情報
    │   └── validation.ts        バリデーションエンドポイント
    │
    └── user/
        ├── index.ts             ユーザールーター統合
        ├── users.crud.ts        ユーザー CRUD（RBAC 付き）
        └── notifications.crud.ts 通知 CRUD
```

---

## src/domain/ — ビジネスロジック（ドメイン層）

フレームワーク・DB に依存しないビジネスロジック。

```
domain/
├── accounting/
│   ├── accounting-utils.ts     会計計算ユーティリティ（消費税・源泉税・家事按分・端数処理）
│   └── balance-validator.ts    複式簿記の貸借バランス検証
│
├── auth/
│   ├── authorization.service.ts 認可サービス（組織所有権検証・IDOR防止）
│   └── role.types.ts           ロール・権限定義（ROLE_PERMISSIONS マップ）
│
├── document/
│   ├── document.types.ts       書類関連の型定義
│   ├── duplicate-checker.ts    書類重複チェック（金額・日付・取引先の類似度）
│   └── supplier-matcher.ts     取引先自動マッチング（完全一致→部分一致→エイリアス）
│
├── export/
│   ├── freee-csv.builder.ts    freee 取込用 CSV ビルダー（21列公式フォーマット）
│   └── simple-csv.builder.ts   仕訳くん 独自形式 CSV ビルダー
│
├── journal/
│   ├── accounting-constants.ts 会計定数（STATEMENT_EXTRACT_TYPES, FREEE_TAX_CODE_LOOKUP 等）
│   ├── ai-generator.prompt.ts  AI 仕訳生成プロンプトテンプレート
│   ├── ai-generator.service.ts AI 仕訳生成サービス（Gemini Pro 呼び出し）
│   ├── journal-pipeline.service.ts 仕訳生成パイプライン（ルールマッチ → AI フォールバック）
│   ├── journal.types.ts        仕訳関連の型定義
│   ├── line-mapper.service.ts  仕訳明細行マッピング（科目名→UUID / 取引先名→UUID）
│   └── rule-generator.service.ts 修正パターンからルール自動生成
│
├── master/
│   └── master-data.service.ts  マスタデータ取得サービス（勘定科目・税区分等）
│
├── notification/
│   └── notification.service.ts 通知サービス（通知レコードの作成）
│
├── ocr/
│   ├── ocr.types.ts            OCR 全型定義（ClassificationResult / OCRResult / ExtractedLine）
│   ├── ocr-pipeline.service.ts OCR パイプライン統合（分類→抽出→明細分割の一貫実行）
│   ├── ocr-parse-utils.ts      OCR 結果の JSON パース・修復ユーティリティ
│   ├── classifier.prompt.ts    証憑分類プロンプト（63書類種別対応）
│   ├── classifier.service.ts   書類分類サービス（種別コード + 確信度）
│   ├── extractor.prompt.ts     データ抽出プロンプト（全書類種別対応 JSON スキーマ）
│   ├── extractor.service.ts    データ抽出サービス
│   ├── multi-extractor.prompt.ts 明細分割プロンプト（通帳・クレカ等の複数行抽出）
│   └── multi-extractor.service.ts 複数明細抽出サービス
│
└── rule-engine/
    ├── condition-evaluator.ts   テーブル駆動の条件評価器（16種の条件を AND 評価）
    ├── conflict-detector.ts     ルール競合検出（条件セット JSON 一致判定）
    ├── matcher.service.ts       ルールマッチングサービス（優先度順序付け）
    ├── matcher-with-candidates.ts 候補付きルールマッチング
    ├── priority-resolver.ts     ルール優先度解決（client > industry > shared）
    ├── rule-engine.types.ts     ルールエンジン型定義
    └── rule-name-generator.ts   ルール名自動生成
```

---

## src/server/ — サーバーエントリーポイント

```
server/
└── index.ts                    Express サーバー起動（ミドルウェア登録・ルートマウント）
```

---

## src/shared/ — バックエンド/フロントエンド共有

バックエンドとフロントエンドの両方から参照される共有コード。

```
shared/
├── errors/
│   └── app-errors.ts           構造化エラークラス（AppError/NotFoundError/ForbiddenError/ValidationError）
│
├── types/
│   └── index.ts                型エクスポートのバレルファイル（全DBモデル型 50+ インターフェース）
│
└── utils/
    ├── csv-escape.ts           RFC 4180 準拠 CSV エスケープ
    ├── encryption.ts           AES-256-GCM トークン暗号化/復号
    ├── normalize-japanese.ts   日本語正規化（全角→半角、カタカナ→ひらがな、法人格除去）
    ├── concurrent.ts           並行処理ユーティリティ
    ├── ttl-cache.ts            TTL 付きキャッシュ
    ├── request-helpers.ts      リクエストヘルパー
    └── __tests__/
        └── normalizeJapanese.test.ts  正規化のユニットテスト
```

---

## src/web/ — フロントエンド（React SPA）

Vite + React + TypeScript + Tailwind CSS のシングルページアプリケーション。

### エントリー & 設定

```
web/
├── main.tsx                    React アプリのエントリーポイント（ReactDOM.createRoot）
├── index.css                   グローバル CSS（Tailwind ベースクラス + .btn-primary 等）
└── vite-env.d.ts               Vite 環境変数の型定義
```

### app/ — アプリケーション基盤

```
web/app/
├── App.tsx                     ルートコンポーネント（ErrorBoundary + ルーティング + プロバイダー）
├── routes.tsx                  全ページの React.lazy ルート定義（コード分割済み）
│
├── layouts/
│   ├── MainLayout.tsx          メインレイアウト（サイドバー + ヘッダー + コンテンツ領域）
│   ├── Sidebar.tsx             サイドバーナビゲーション（展開/折りたたみ・ロールベース表示）
│   ├── NotificationBell.tsx    通知ベル（ポーリング・既読管理・ドロップダウン）
│   └── AuthLayout.tsx          認証ページ用レイアウト
│
└── providers/
    ├── AuthProvider.tsx         認証コンテキスト（Supabase Auth・ユーザープロフィール）
    ├── MasterDataProvider.tsx   マスタデータコンテキスト（勘定科目・税区分のキャッシュ）
    └── WorkflowProvider.tsx     ワークフローコンテキスト（開始・再開・ステップ管理）
```

### shared/ — フロントエンド共有コンポーネント・ユーティリティ

```
web/shared/
├── components/
│   ├── ErrorBoundary.tsx       エラーバウンダリ（フォールバック UI + 再試行）
│   ├── PageSuspense.tsx        ページ遅延読み込み用ローディング UI
│   │
│   ├── ui/
│   │   ├── Modal.tsx           モーダル（role="dialog" + フォーカストラップ + ESC 閉じ）
│   │   ├── ComboBox.tsx        コンボボックス（検索・矢印キーナビ・新規作成・ARIA 対応）
│   │   ├── ConfirmDialog.tsx   確認ダイアログ（window.confirm 代替・danger バリアント）
│   │   └── Toast.tsx           トースト通知（4タイプ・自動消去・useToast hook）
│   │
│   └── journal/
│       └── CompoundJournalTable.tsx  複合仕訳テーブル（借方/貸方の複数行編集）
│
├── constants/
│   ├── statuses.ts             仕訳ステータス定数・ラベル・バッジカラーマップ
│   ├── keyboard.ts             キーボードショートカット定数
│   └── ui.ts                   UI 定数（ZOOM, NOTIFICATION_POLL_INTERVAL, WORKFLOW_STEPS）
│
├── hooks/
│   ├── useAsync.ts             非同期処理 hook（loading/error/data 一括管理）
│   ├── useCrud.ts              CRUD hook（一覧取得・作成・更新・削除 + 自動リロード）
│   ├── useModal.ts             モーダル hook（open/close + 編集アイテム管理）
│   ├── useSearchFilter.ts      検索フィルタ hook（クエリ + フィルタリング）
│   └── useConfirm.ts           確認ダイアログ hook（Promise ベース）
│
├── lib/
│   ├── supabase.ts             フロント用 Supabase クライアント（anon key・認証専用）
│   ├── supabase.debug.ts       Supabase 接続デバッグユーティリティ
│   └── api/
│       └── backend.api.ts      バックエンド API クライアント（全エンドポイント型付き・認証自動付与）
│
├── types/
│   └── views.ts                フロントエンド固有のビュー型定義
│
└── utils/
    └── format.ts               フォーマットユーティリティ（通貨・日付）
```

### features/ — 機能別フロントエンドモジュール

#### features/auth/ — 認証

```
features/auth/
└── pages/
    └── LoginPage.tsx           ログインページ（メール/パスワード + Google OAuth）
```

#### features/clients/ — 顧客管理

```
features/clients/
├── components/
│   ├── ClientForm.tsx          顧客登録/編集フォーム（課税区分・インボイス・ルール自動追加）
│   ├── BulkImportForm.tsx      一括顧客登録フォーム（テーブル形式・行追加/削除）
│   ├── ClientRulesModal.tsx    顧客ルール設定モーダル（専用/業種/汎用ルール + 按分表示）
│   └── WorkflowCard.tsx        進行中ワークフローカード（ステップ表示・再開/中断）
│
├── hooks/
│   └── useClientData.ts        顧客データ hook（useClientData + useClientRules）
│
└── pages/
    ├── ClientListPage.tsx      顧客一覧ページ（検索・テーブル・モーダル）
    └── ClientSummaryPage.tsx   顧客サマリーページ（集計・チェック）
```

#### features/approvals/ — 承認

```
features/approvals/
└── pages/
    └── ApprovalsPage.tsx       承認ダッシュボード（一括承認・差し戻し・フィルタリング）
```

#### features/excluded/ — 対象外

```
features/excluded/
└── pages/
    ├── ExcludedPage.tsx        対象外証憑一覧（復帰操作）
    └── ExcludedHistoryPage.tsx 対象外履歴ページ
```

#### features/master/ — マスタ管理

```
features/master/
├── hooks/
│   ├── useAccountsData.ts      勘定科目データ hook
│   ├── useItemsData.ts         品目データ hook
│   └── useSuppliersData.ts     取引先データ hook
│
└── pages/
    ├── AccountsPage.tsx        勘定科目管理（一般/不動産タブ・カテゴリフィルタ・CRUD）
    ├── TaxCategoriesPage.tsx   税区分・税率管理（税区分 CRUD + 税率サブ管理）
    ├── IndustriesPage.tsx      業種管理（CRUD + 顧客紐づけ表示）
    ├── SuppliersPage.tsx       取引先管理（CRUD + エイリアス管理）
    └── ItemsPage.tsx           品目管理（CRUD + エイリアス管理）
```

#### features/rules/ — 仕訳ルール

```
features/rules/
└── pages/
    ├── RulesIndexPage.tsx      ルール管理トップ（業種一覧 → 詳細遷移）
    ├── IndustryDetailPage.tsx  業種別ルール詳細（ルール CRUD + 優先度管理）
    ├── ClientListPage.tsx      業種別顧客一覧
    └── ClientDetailPage.tsx    顧客別ルール詳細
```

#### features/settings/ — 設定

```
features/settings/
├── components/
│   ├── UserManagement.tsx      ユーザー管理（CRUD + ロール設定 + テーブル）
│   ├── FreeeIntegration.tsx    freee 連携（接続/切断/コールバック処理）
│   └── PermissionsTable.tsx    権限説明テーブル（簡易版/詳細版切り替え）
│
└── pages/
    └── SettingsPage.tsx        設定ページ（3コンポーネントを統合）
```

#### features/workflow/ — ワークフロー（メイン処理フロー）

```
features/workflow/
├── components/
│   ├── WorkflowHeader.tsx      ワークフローヘッダー（ステップインジケーター + 前後ナビ）
│   ├── ImageViewer.tsx         証憑画像ビューア（ズーム・回転・ピンチ操作）
│   ├── EntryCard.tsx           仕訳エントリーカード
│   └── MultiEntryPanel.tsx     複数仕訳パネル（1書類に複数仕訳がある場合）
│
├── context/                    ★ レビュー画面の状態管理（3サブコンテキスト構成）
│   ├── ReviewContext.tsx       統合プロバイダー + 後方互換 useReview() hook
│   ├── ReviewViewContext.tsx   ビュー状態（viewMode, activeTab, zoom, rotation）
│   ├── ReviewFormContext.tsx   フォーム状態（form, compoundLines, saving, ruleScope 等）
│   ├── ReviewDataContext.tsx   データ状態（items, entries, masterData, computed counts）
│   ├── useReviewActions.ts    アクション hook（保存・承認・除外・ルール作成・ナビゲーション）
│   ├── useReviewData.ts       データ読み込み hook（書類・仕訳・マスタデータの並列取得）
│   └── useReviewKeyboard.ts   キーボードショートカット hook（useRef パターンで安定化）
│
├── doc-types/                  書類種別ごとのレイアウト切り替え
│   ├── registry.ts             書類種別レジストリ（種別コード → レイアウト/パネル マッピング）
│   └── types.ts                書類種別の型定義
│
├── layouts/                    レビュー画面のレイアウトバリエーション
│   ├── LayoutDispatcher.tsx    書類種別に応じたレイアウト自動切り替え
│   ├── SingleEntryLayout.tsx   単一仕訳レイアウト（レシート・請求書等）
│   ├── CompoundEntryLayout.tsx 複合仕訳レイアウト（給与明細・売上集計等）
│   ├── StatementLayout.tsx     明細一括レイアウト（通帳・クレカ明細等）
│   ├── MetadataLayout.tsx      メタデータレイアウト（届出書・契約書等）
│   └── ArchiveLayout.tsx       保管レイアウト（処理不要書類）
│
├── sections/                   レビュー画面の UI セクション
│   ├── CoreFieldsGrid.tsx      コアフィールドグリッド（取引日・金額・勘定科目・税区分）
│   ├── SupplierField.tsx       取引先フィールド（コンボボックス + 新規作成）
│   ├── BusinessRatioPanel.tsx  家事按分パネル（スライダー + 金額表示）
│   ├── BusinessToggleRow.tsx   事業/非事業トグル行
│   ├── ExcludeButton.tsx       対象外ボタン
│   ├── NavigationBar.tsx       前後ナビゲーションバー
│   ├── SaveStatusBar.tsx       保存ステータスバー（自動保存時刻表示）
│   ├── OcrSummaryBadges.tsx    OCR 結果サマリーバッジ（信頼度・書類種別）
│   ├── OcrReferenceBox.tsx     OCR 参照ボックス（抽出データの原文表示）
│   ├── RuleCandidatesBar.tsx   ルール候補バー（適用可能ルールの提案）
│   ├── MultiEntrySiblingTabs.tsx  同一書類の仕訳タブ切り替え
│   │
│   └── doc-specific/           書類種別固有のパネル（19種）
│       ├── index.tsx            遅延読み込みエントリー（React.lazy）
│       ├── ReceiptItemList.tsx  レシート明細リスト
│       ├── InvoicePanel.tsx     請求書パネル（インボイス番号・支払期日）
│       ├── PayrollSummaryPanel.tsx  給与明細サマリー
│       ├── SalesBreakdownPanel.tsx  売上内訳パネル
│       ├── DeductionCalcPanel.tsx   所得控除計算パネル
│       ├── IncomeCalcPanel.tsx      所得計算パネル
│       ├── WithholdingPanel.tsx     源泉徴収パネル
│       ├── ReconciliationPanel.tsx  残高照合パネル
│       ├── MetadataFieldsPanel.tsx  メタデータフィールドパネル
│       ├── PaymentMethodSelector.tsx 決済方法セレクター
│       ├── TransferFeePanel.tsx     振込手数料パネル
│       ├── DepreciationPanel.tsx    減価償却パネル
│       ├── CarryoverPanel.tsx       繰越パネル
│       ├── FurusatoCalcPanel.tsx    ふるさと納税計算パネル
│       ├── HousingLoanCalcPanel.tsx 住宅ローン控除計算パネル
│       ├── InventoryCalcPanel.tsx   棚卸計算パネル
│       ├── LifeInsCalcPanel.tsx     生命保険料控除計算パネル
│       └── MedicalCalcPanel.tsx     医療費控除計算パネル
│
├── lib/
│   └── workflowStorage.ts     ワークフロー状態の永続化（localStorage）
│
└── pages/
    ├── UploadPage.tsx          証憑アップロードページ（D&D・プレビュー・並列アップロード）
    ├── UploadOnlyPage.tsx      閲覧者用アップロード専用ページ
    ├── OCRPage.tsx             OCR 処理ページ（逐次処理・リトライ・エラーステップ表示）
    ├── ReviewPage.tsx          仕訳レビューページ（一覧/詳細切り替え・承認・一括操作）
    └── ExportPage.tsx          仕訳出力ページ（CSV生成・freee連携・出力履歴）
```

---

## src/db/ — データベース

```
db/
├── schema.sql                  全テーブル定義（Supabase/PostgreSQL）
├── migrations/
│   ├── migration-supplier-category-check.sql   取引先カテゴリチェックマイグレーション
│   └── migration-update-journal-entry-rpc.sql  仕訳更新 RPC マイグレーション
├── queries/
│   ├── export-full-schema-json.sql   スキーマ全体を JSON でエクスポート
│   ├── list-check-constraints.sql    CHECK制約一覧
│   ├── list-columns.sql              カラム一覧
│   ├── list-enums.sql                ENUM一覧
│   ├── list-foreign-keys.sql         外部キー一覧
│   ├── list-functions.sql            関数一覧
│   ├── list-indexes.sql              インデックス一覧
│   ├── list-rls-policies.sql         RLSポリシー一覧
│   └── list-tables.sql               テーブル一覧
├── seeds/
│   ├── seed_industry_rules.sql       業種別ルールの初期データ
│   └── seed_processing_rules.sql     処理ルールの初期データ
└── snapshots/
    └── README.md                     スナップショットの説明
```
