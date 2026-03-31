# BESO (Tax Copilot) アーキテクチャガイド

> 証憑アップロード → OCR → AI仕訳生成 → レビュー → freeeエクスポート
> を自動化する税理士事務所向けWebアプリケーション


---


# 全体マップ

```
src/
 |
 |  [ バックエンド ]
 |
 |-- core/              純粋関数。外部依存ゼロ。テスト最優先領域
 |   |-- accounting/       会計計算（貸借一致、消費税、源泉、家事按分）
 |   |-- matching/         ルール条件評価・優先順位解決
 |   '-- validation/       金額・日付・残高の検証
 |
 |-- modules/           業務ロジック。モジュール間は直接依存しない
 |   |-- ocr/              証憑画像 → テキスト抽出（Gemini Vision）
 |   |-- journal/          仕訳データ生成（ルール or AI）
 |   |-- rule-engine/      ルールマッチング
 |   |-- export/           CSV生成
 |   |-- document/         重複チェック・取引先名寄せ
 |   '-- identity/         ロール・テナント型定義
 |
 |-- adapters/          外部サービスとの接続を隔離
 |   |-- gemini/           Google Gemini API クライアント
 |   |-- supabase/         Supabase クライアント（フロント用 / サーバー用）
 |   '-- freee/            freee REST API クライアント
 |
 |-- api/               Express ルート定義・ミドルウェア
 |   |-- helpers/          共通ヘルパー（マスタデータ取得、通知作成）
 |   |-- middleware/       レート制限・ログ・エラーハンドリング・認証
 |   '-- routes/
 |       |-- crud/         CRUDエンドポイント（15ファイル、リソース別）
 |       |-- documents.route.ts    証憑アップロード
 |       |-- ocr.route.ts          OCR処理
 |       |-- journals.route.ts     仕訳生成
 |       |-- freee.route.ts        freee連携（export / OAuth）
 |       |-- batch.route.ts        一括処理
 |       |-- validation.route.ts   バリデーション
 |       '-- health.route.ts       ヘルスチェック
 |
 |-- server/            Expressサーバー起動・ミドルウェア接続
 |   |-- index.ts          エントリポイント（npm run start が実行）
 |   '-- services/         OCR・仕訳生成・ルールエンジン等の実装
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
 |       |-- components/     Modal, ComboBox, CompoundJournalTable
 |       |-- lib/api/        backend.api.ts（バックエンドAPI呼び出し関数）
 |       |-- types/          UI専用の拡張型
 |       '-- utils/          日付・金額フォーマッター
 |
 |
 |  [ 共有 ]
 |
 |-- shared/            サーバー/クライアント両方で使う
 |   |-- types/            全DBモデル型定義（30+ interface）
 |   '-- utils/            normalizeJapanese（日本語正規化）
 |
 '-- db/                SQLスキーマ・マイグレーション
```


---


# バックエンド詳細


## core/ ── 純粋関数

> 外部依存ゼロ。入力 → 出力の純粋関数だけ。
> 変更頻度: 年0〜2回（税法改正時のみ）

### accounting/

```
double-entry.ts
  checkDebitCreditBalance(lines)   借方合計と貸方合計を比較

tax-calculation.ts
  calcTaxFromInclusive(税込額, 税率)   税額を逆算
  calcInclusiveAmount(税抜額, 税率)    税込額に変換
  calcExclusiveAmount(税込額, 税率)    税抜額に変換

withholding-tax.ts
  calcWithholdingTax(報酬額)
  → 100万以下: 10.21% / 100万超: 超過分20.42%

household-ratio.ts
  splitByHouseholdRatio(総額, 税額, 事業割合)
  → { 事業用金額, 私用金額, 事業用税額, 私用税額 }
```

### matching/

```
condition-evaluator.ts
  evaluateConditions(conditions, input)
  → 16種の条件をAND評価（取引先/摘要/金額範囲/品目/支払方法/
    証憑種別/インボイス有無/税率/内税外税/取引頻度/但書き/
    適格区分/宛名/取引種類/手数料負担）

priority-resolver.ts
  sortByPriority(rules, clientId, industryIds)
  → scope優先順: client(0) > industry(1) > shared(2)
```

### validation/

```
amount-validator.ts   isValidAmount(), roundCurrency()
date-validator.ts     isValidDateString(), isWithinFiscalYear()
```


---


## modules/ ── 独立した業務機能

> 各モジュールは他モジュールに依存しない。

### ocr/

```
classifier.service.ts     classifyDocument(画像) → 種別コード + 確信度
extractor.service.ts      processOCR(画像URL) → 取引情報JSON
multi-extractor.service.ts extractMultipleEntries() → 通帳・クレカ明細の取引行配列
*-prompt.ts               各処理のGeminiプロンプト定義
```

### journal/

```
ai-generator.service.ts    generateJournalEntry(input) → 複合仕訳（Gemini Pro）
rule-generator.service.ts  buildEntryFromRule(ルール, 取引) → 仕訳（家事按分対応）
line-mapper.service.ts     mapLinesToDBFormat() → 科目名→UUID / 取引先名→UUID変換
generator.strategy.ts      ルールマッチ → 失敗時AIフォールバック
```

### rule-engine/

```
matcher.service.ts              matchProcessingRules() → 最優先の1件
matcher-with-candidates.ts      同上 + 他の候補一覧
rule-name-generator.ts          条件から読みやすいルール名を生成
```

### export/

```
simple-csv.builder.ts    buildSimpleCsv() → Tax Copilot 独自CSV
freee-csv.builder.ts     buildFreeeCsv() → freee取込用21列CSV
```

### document/

```
duplicate-checker.ts     ハッシュ完全一致 + 金額/日付/取引先の類似チェック
supplier-matcher.ts      完全一致 → 部分一致 → エイリアスの3段階マッチング
```


---


## adapters/ ── 外部サービスの隔離

### gemini/

```
gemini.config.ts     モデル名・リトライ回数(4)・最小間隔(150ms)
gemini.client.ts     GoogleGenAI初期化 + callGeminiWithRetry()
                     指数バックオフ(1s→2s→4s→8s) + スロットリング
```

### supabase/

```
supabase.client.ts        フロント用（anon key）認証専用
                          auth.signIn / signOut / signInWithGoogle / onAuthStateChange
supabase-admin.client.ts  サーバー用（service_role key、RLSバイパス）
```

### freee/

```
freee.api-client.ts   POST /api/1/deals で取引登録
freee.oauth.ts        OAuth 2.0 フロー
```


---


## api/ ── Express ルート定義

### 業務ロジック系ルート（api/routes/*.route.ts）

| ルートファイル | エンドポイント | 処理内容 |
|---|---|---|
| documents.route.ts | POST /documents/upload | 証憑ファイルアップロード（multer） |
| ocr.route.ts | POST /ocr/process | Gemini VisionでOCR + 分類 + 重複チェック |
| journals.route.ts | POST /journal-entries/generate | ルールマッチ → AI生成 → DB保存 |
| freee.route.ts | POST /freee/export, GET/POST /freee/auth-url, callback, etc. | freee連携（エクスポート + OAuth） |
| batch.route.ts | POST /process/batch | 複数ファイルの一括OCR + 仕訳生成 |
| validation.route.ts | POST /validate/journal-balance, /validate/document-duplicate | バリデーション |
| health.route.ts | GET /health | ヘルスチェック + 環境情報 |

### CRUDルート（api/routes/crud/*.crud.ts）

全てのデータベースリソースに対する標準CRUD。フロントエンドは `supabase.from()` を直接呼ばず、これらのAPIを経由する。

| ファイル | 対象テーブル |
|---|---|
| clients.crud.ts | clients（業種JOIN） |
| account-items.crud.ts | account_items, account_categories |
| tax-categories.crud.ts | tax_categories, tax_rates, client_tax_category_settings |
| industries.crud.ts | industries, client_industries |
| rules.crud.ts | processing_rules |
| suppliers.crud.ts | suppliers, supplier_aliases |
| items.crud.ts | items, item_aliases |
| journal-entries.crud.ts | journal_entries, journal_entry_lines, journal_entry_approvals |
| workflows.crud.ts | workflows |
| users.crud.ts | users |
| notifications.crud.ts | notifications |
| client-ratios.crud.ts | client_account_ratios |
| documents.crud.ts | documents |
| journal-corrections.crud.ts | journal_entry_corrections, excluded_entries |
| storage.crud.ts | Supabase Storage（署名付きURL、削除） |

### 共通ヘルパー（api/helpers/）

```
master-data.ts
  createNotification()       通知レコードの挿入
  getOrganizationId()        ユーザーIDから組織IDを取得
  fetchAccountItems()        勘定科目マスタ取得（キャッシュ対応）
  fetchTaxCategories()       税区分マスタ取得
  findFallbackAccountId()    フォールバック勘定科目の検索
```

### ミドルウェア（api/middleware/）

```
rate-limit.middleware.ts   apiLimiter(100回/15分)  expensiveLimiter(20回/15分)
logging.middleware.ts      リクエストログ出力
error-handler.middleware.ts  エラー応答 + 404ハンドラ
auth.middleware.ts           認証チェック
```


---


## server/ ── エントリポイント

```
index.ts       Express初期化 → ミドルウェア → ルートマウント → サーバー起動
               - /health をミドルウェア前に配置（ヘルスチェック高速化）
               - express.static を CORS より前に配置（静的ファイルの500エラー回避）
               - CORSは /api パスのみに適用
               - 本番環境: dist/ を静的配信 + SPA catch-all

services/      業務ロジックの実装（OCR・仕訳生成・ルールエンジン等）
               → api/routes/ から import される
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
  ImageViewer.tsx        証憑画像プレビュー（ズーム対応）
  MultiEntryPanel.tsx    通帳・クレカ明細の複数取引パネル

lib/
  workflowStorage.ts     ワークフロー永続化（バックエンドAPI経由）
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
  journal/CompoundJournalTable.tsx  複合仕訳テーブル

lib/api/
  backend.api.ts             全バックエンドAPI呼び出し関数
                             apiFetch() + リソース別のAPI定義
                             clientsApi / accountItemsApi / journalEntriesApi / etc.
                             （フロントから supabase.from() は直接呼ばない）

utils/
  format.ts                  formatDate(), formatCurrency(), formatSalesLabel()

types/
  views.ts                   UI専用の拡張型（EntryWithJoin 等）
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
  MainLayout.tsx         サイドバー + ヘッダー + 通知ベル
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

### 仕訳生成の戦略

```
1. matchProcessingRules()  ルール配列を scope 優先順に走査
       ↓ マッチあり
   buildEntryFromRule()    ルールから仕訳構築（家事按分対応）

       ↓ マッチなし
2. generateJournalEntry()  Gemini Pro で AI 生成

       ↓
3. mapLinesToDBFormat()    科目名→UUID / 取引先名→UUID に変換
```

### フロントエンド ↔ バックエンド通信

```
フロント (React)                    バックエンド (Express)
  backend.api.ts                     api/routes/crud/*.crud.ts
    clientsApi.getAll()  ──────→     GET /api/clients
    journalEntriesApi.create() ──→   POST /api/journal-entries

  直接fetch                          api/routes/*.route.ts
    POST /api/ocr/process  ────→     OCR処理 → Gemini Flash
    POST /api/journal-entries/generate → 仕訳生成 → Gemini Pro

  supabase.client.ts（認証のみ）
    supabase.auth.signIn()           Supabase Auth（直接）
    supabase.storage.upload()        Supabase Storage（直接）
```


---


# shared/ ── サーバー/クライアント共用

```
types/
  models.ts    全DBモデル型（30+ interface）
               Organization, User, Client, AccountItem, TaxCategory,
               Rule, Document, JournalEntry, JournalEntryLine,
               Supplier, Workflow, Notification, FreeeConnection ...

  enums.ts     NotificationType（8種の通知タイプ）

  index.ts     上記の re-export。@/types エイリアスで参照可能

utils/
  normalize-japanese.ts
    normalizeJapanese(text)
    → 半角カナ→全角 / 全角英数→半角 / 法人格除去 / スペース統一
    サーバー（取引先名寄せ）とクライアント（表示）の両方で使用
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
2. **core/ は外部依存ゼロ** — 純粋関数のみ。テスト最優先
3. **modules/ は相互依存しない** — OCRが壊れてもエクスポートは動く
4. **adapters/ で外部を隔離** — SDK更新・API仕様変更はここだけで吸収
5. **features/ は独立** — feature間の直接importは禁止、共通部品はshared/に
