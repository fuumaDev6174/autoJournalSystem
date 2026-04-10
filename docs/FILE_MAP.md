# ファイルマップ — 全ソースファイルの役割一覧

> プロジェクト内の全ファイルの役割を一目で把握するためのドキュメント。  
> 最終更新: 2026-04-10

---

## 目次

1. [ルート設定ファイル](#ルート設定ファイル)
2. [src/adapters/ — 外部サービス接続](#srcadapters--外部サービス接続)
3. [src/api/ — REST API サーバー](#srcapi--rest-api-サーバー)
4. [src/core/ — ビジネスロジック（ドメイン層）](#srccore--ビジネスロジックドメイン層)
5. [src/modules/ — 機能モジュール](#srcmodules--機能モジュール)
6. [src/server/ — サーバーエントリーポイント](#srcserver--サーバーエントリーポイント)
7. [src/shared/ — バックエンド/フロントエンド共有](#srcshared--バックエンドフロントエンド共有)
8. [src/web/ — フロントエンド（React SPA）](#srcweb--フロントエンドreact-spa)
9. [src/db/ — データベース](#srcdb--データベース)

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
├── TASKS.md                    リファクタリング計画・進捗管理
└── FILE_MAP.md                 ← このファイル
```

---

## src/adapters/ — 外部サービス接続

外部 API やデータベースとの接続を担当。アプリケーションロジックとは分離。

```
adapters/
├── freee/
│   ├── freee.api-client.ts     freee 会計 API クライアント（取引登録・5件並列バッチ）
│   └── freee.oauth.ts          freee OAuth2 認証フロー（トークン取得・リフレッシュ）
│
├── gemini/
│   ├── gemini.client.ts        Google Gemini API クライアント（リトライ・ジッター・レート制限）
│   └── gemini.config.ts        Gemini モデル名・温度パラメータ等の設定
│
└── supabase/
    ├── supabase.client.ts      Supabase クライアント（フロントエンド用・認証）
    ├── supabase-admin.client.ts Supabase 管理者クライアント（サーバー用・RLS バイパス）
    └── supabase.debug.ts       Supabase 接続デバッグユーティリティ
```

---

## src/api/ — REST API サーバー

Express ベースの REST API。認証・認可・バリデーション・エラーハンドリングを提供。

```
api/
├── helpers/
│   ├── async-handler.ts        asyncHandler() — ルートハンドラの try-catch ラッパー
│   ├── master-data.ts          所有権検証ヘルパー（IDOR 防止）
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
├── routes/
│   ├── batch.route.ts          バッチ処理エンドポイント
│   ├── documents.route.ts      書類管理エンドポイント
│   ├── freee.route.ts          freee 連携エンドポイント（OAuth + API連携）
│   ├── health.route.ts         ヘルスチェック
│   ├── journals.route.ts       仕訳生成・AI 仕訳エンドポイント
│   ├── ocr.route.ts            OCR 処理エンドポイント
│   └── validation.route.ts     バリデーションエンドポイント
│
└── routes/crud/                 汎用 CRUD エンドポイント（全15テーブル）
    ├── account-items.crud.ts    勘定科目 CRUD
    ├── client-ratios.crud.ts    家事按分率 CRUD
    ├── clients.crud.ts          顧客 CRUD
    ├── documents.crud.ts        書類 CRUD
    ├── industries.crud.ts       業種 CRUD
    ├── items.crud.ts            品目 CRUD
    ├── journal-corrections.crud.ts  仕訳修正履歴 CRUD
    ├── journal-entries.crud.ts  仕訳 CRUD（承認・一括ステータス更新含む）
    ├── notifications.crud.ts    通知 CRUD
    ├── rules.crud.ts            仕訳ルール CRUD
    ├── storage.crud.ts          ストレージ CRUD（署名付き URL 生成）
    ├── suppliers.crud.ts        取引先 CRUD（エイリアス管理含む）
    ├── tax-categories.crud.ts   税区分 CRUD
    ├── users.crud.ts            ユーザー CRUD（RBAC 付き）
    └── workflows.crud.ts        ワークフロー CRUD
```

---

## src/core/ — ビジネスロジック（ドメイン層）

フレームワーク・DB に依存しない純粋なビジネスロジック。

```
core/
├── accounting/
│   ├── double-entry.ts         複式簿記の借方・貸方バランスチェック
│   ├── household-ratio.ts      家事按分計算ロジック
│   ├── rounding.ts             消費税四捨五入 + 源泉税切捨（通達181-1）
│   ├── tax-calculation.ts      消費税計算（内税/外税/免税判定）
│   └── withholding-tax.ts      源泉徴収税計算（士業/デザイン等の区分判定）
│
├── matching/
│   ├── condition-evaluator.ts  テーブル駆動の条件評価器（ルールマッチング）
│   └── priority-resolver.ts    ルール優先度解決（client > industry > shared）
│
└── validation/
    ├── amount-validator.ts      金額バリデーション（桁数・範囲チェック）
    └── date-validator.ts        日付バリデーション（会計期間チェック）
```

---

## src/modules/ — 機能モジュール

特定のドメイン機能を実装するモジュール群。

```
modules/
├── document/
│   ├── document.types.ts       書類関連の型定義
│   ├── duplicate-checker.ts    書類重複チェック（金額・日付・取引先の類似度）
│   └── supplier-matcher.ts     取引先自動マッチング（完全一致→部分一致→エイリアス）
│
├── export/
│   ├── freee-csv.builder.ts    freee 取込用 CSV ビルダー（21列公式フォーマット）
│   └── simple-csv.builder.ts   仕訳くん 独自形式 CSV ビルダー
│
├── identity/
│   ├── role.types.ts           ロール・権限定義（ROLE_PERMISSIONS マップ）
│   └── tenant.types.ts         テナント（組織）型定義
│
├── journal/
│   ├── ai-generator.prompt.ts  AI 仕訳生成プロンプトテンプレート
│   ├── ai-generator.service.ts AI 仕訳生成サービス（Gemini 呼び出し）
│   ├── generator.strategy.ts   仕訳生成ストラテジー（ルールベース or AI）
│   ├── journal.types.ts        仕訳関連の型定義
│   ├── line-mapper.service.ts  仕訳明細行マッピングサービス
│   └── rule-generator.service.ts 修正パターンからルール自動生成
│
├── ocr/
│   ├── classifier.prompt.ts    書類分類プロンプト（Step 1: 書類種別判定）
│   ├── classifier.service.ts   書類分類サービス
│   ├── extractor.prompt.ts     データ抽出プロンプト（Step 2: 金額・日付・取引先）
│   ├── extractor.service.ts    データ抽出サービス
│   ├── multi-extractor.prompt.ts 複数明細抽出プロンプト（通帳・クレカ明細等）
│   ├── multi-extractor.service.ts 複数明細抽出サービス
│   └── ocr.types.ts            OCR 関連の型定義
│
└── rule-engine/
    ├── conflict-detector.ts     ルール競合検出（条件セット JSON 一致判定）
    ├── matcher.service.ts       ルールマッチングサービス（優先度順序付け）
    ├── matcher-with-candidates.ts  候補付きルールマッチング
    ├── rule-engine.types.ts     ルールエンジン型定義
    └── rule-name-generator.ts   ルール名自動生成
```

---

## src/server/ — サーバーエントリーポイント

```
server/
├── index.ts                    Express サーバー起動（ミドルウェア登録・ルートマウント）
└── services/
    └── validation.service.ts   サーバーサイドバリデーションサービス
```

---

## src/shared/ — バックエンド/フロントエンド共有

バックエンドとフロントエンドの両方から参照される共有コード。

```
shared/
├── constants/
│   └── accounting.ts           会計定数（STATEMENT_EXTRACT_TYPES, FREEE_TAX_CODE_LOOKUP 等）
│
├── errors/
│   └── app-errors.ts           構造化エラークラス（AppError/NotFoundError/ForbiddenError/ValidationError）
│
├── types/
│   ├── index.ts                型エクスポートのバレルファイル
│   ├── models.ts               全テーブルの TypeScript 型定義（50+ インターフェース）
│   └── enums.ts                通知タイプ等の列挙型
│
└── utils/
    ├── csv-escape.ts           RFC 4180 準拠 CSV エスケープ
    ├── encryption.ts           AES-256-GCM トークン暗号化/復号
    ├── normalize-japanese.ts   日本語正規化（全角→半角、カタカナ→ひらがな）
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
├── routes.tsx                  全20ページの React.lazy ルート定義（コード分割済み）
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
│   ├── ErrorBoundary.tsx       エラーバウンダリ（フォールバック UI + 再試行 + DEV 時スタック表示）
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
├── lib/api/
│   └── backend.api.ts          バックエンド API クライアント（全エンドポイント型付き・認証自動付与）
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
│   ├── MetadataLayout.tsx      メタデータレイアウト（開業届・登録通知書等）
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
│   └── doc-specific/           書類種別固有のパネル
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
│       └── TransferFeePanel.tsx     振込手数料パネル
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
├── seed_industry_rules.sql     業種別ルールの初期データ
├── seed_processing_rules.sql   処理ルールの初期データ
├── migration-supplier-category-check.sql   取引先カテゴリチェックマイグレーション
└── migration-update-journal-entry-rpc.sql  仕訳更新 RPC マイグレーション
```

---

## アーキテクチャ概要図

```
┌─────────────────────────────────────────────────────────────┐
│                     フロントエンド (React SPA)               │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  ┌───────────┐  │
│  │ 顧客管理 │  │ ワーク    │  │ マスタ管理  │  │ 設定      │  │
│  │         │  │ フロー    │  │            │  │           │  │
│  └────┬────┘  └────┬─────┘  └─────┬──────┘  └─────┬─────┘  │
│       └──────┬─────┴──────────────┴───────────────┘        │
│              │                                              │
│       ┌──────▼──────┐                                       │
│       │ backend.api │ ← 型付き API クライアント              │
│       └──────┬──────┘                                       │
└──────────────┼──────────────────────────────────────────────┘
               │ HTTP (JWT 認証)
┌──────────────▼──────────────────────────────────────────────┐
│                     バックエンド (Express)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐              │
│  │ 認証/認可 │  │ CRUD API │  │ ビジネス API │              │
│  │ ミドル    │  │ (15テーブル)│  │ (OCR/仕訳/  │              │
│  │ ウェア    │  │          │  │  エクスポート)│              │
│  └──────────┘  └──────────┘  └──────┬───────┘              │
│                                      │                      │
│  ┌──────────────────────────────────▼─────────────────────┐ │
│  │              core/ + modules/                          │ │
│  │  会計ロジック │ OCR │ 仕訳生成 │ ルールエンジン │ 書類管理 │ │
│  └──────────────────────────────────┬─────────────────────┘ │
└─────────────────────────────────────┼───────────────────────┘
                                      │
┌─────────────────────────────────────▼───────────────────────┐
│                     外部サービス (adapters/)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Supabase │  │ Gemini   │  │ freee    │                  │
│  │ (DB/Auth)│  │ (AI/OCR) │  │ (会計API)│                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```
