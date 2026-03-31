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
 |   |-- export/           CSV生成・freee API連携
 |   |-- document/         重複チェック・取引先名寄せ
 |   '-- identity/         ロール・テナント型定義
 |
 |-- adapters/          外部サービスとの接続を隔離
 |   |-- gemini/           Google Gemini API クライアント
 |   |-- supabase/         Supabase クライアント（フロント用 / サーバー用）
 |   '-- freee/            freee REST API クライアント
 |
 |-- api/               Express サーバー設定
 |   |-- middleware/       レート制限・ログ・エラーハンドリング
 |   '-- routes/           ヘルスチェック等の薄いルート
 |
 |-- server/            API ルートハンドラの実装（api.ts が中核）
 |
 |
 |  [ フロントエンド ]
 |
 |-- web/
 |   |-- app/              アプリの骨格
 |   |   |-- providers/      Auth / MasterData / Workflow の Context
 |   |   |-- layouts/        MainLayout（サイドバー付き） / AuthLayout
 |   |   |-- App.tsx         ルートコンポーネント
 |   |   '-- routes.tsx      全URL → ページの対応表
 |   |
 |   |-- features/         <<<  画面ごとの機能フォルダ  >>>
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
 |       |-- hooks/          useAuth, useMasterData
 |       |-- lib/            APIクライアント, Supabase
 |       '-- utils/          日付・金額フォーマッター
 |
 |-- client/            ページ・コンポーネントの実体ファイル
 |                      （web/features/ が re-export で参照）
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


## core/ ── 絶対に壊してはいけないコード

> 外部依存ゼロ。入力 → 出力の純粋関数だけ。
> 変更頻度: 年0〜2回（税法改正時のみ）

### accounting/  会計の不変ルール

```
double-entry.ts
  checkDebitCreditBalance(lines)
  → 借方合計と貸方合計を比較。差が1円未満ならOK

tax-calculation.ts
  calcTaxFromInclusive(税込額, 税率)   → 税額を逆算
  calcInclusiveAmount(税抜額, 税率)    → 税込額に変換
  calcExclusiveAmount(税込額, 税率)    → 税抜額に変換

withholding-tax.ts
  calcWithholdingTax(報酬額)
  → 100万以下: 10.21%  /  100万超: 超過分20.42%

household-ratio.ts
  splitByHouseholdRatio(総額, 税額, 事業割合)
  → { 事業用金額, 私用金額, 事業用税額, 私用税額 }
```

### matching/  条件マッチング

```
condition-evaluator.ts
  evaluateConditions(conditions, input)
  → 16種の条件を全てAND評価。条件ゼロはマッチしない
    対応条件: 取引先 / 摘要 / 金額範囲 / 品目 / 支払方法
              証憑種別 / インボイス有無 / 税率 / 内税外税
              取引頻度 / 但書き / 適格区分 / 宛名 / 取引種類 / 手数料負担

priority-resolver.ts
  sortByPriority(rules, clientId, industryIds)
  → scope優先順: client(0) > industry(1) > shared(2)
    同一scope内は priority 数値が小さい順

text-normalizer.ts
  → normalizeJapanese() の re-export
```

### validation/  データ検証

```
balance-checker.ts   → double-entry の re-export
amount-validator.ts  → isValidAmount(), roundCurrency()
date-validator.ts    → isValidDateString(), isWithinFiscalYear()
```


---


## modules/ ── 独立した業務機能

> 各モジュールは他モジュールに依存しない。
> OCRが壊れてもエクスポートは動く、という独立性。

### ocr/  証憑読取

```
ocr.types.ts              型定義（OCRTransaction, OCRResult）

classifier.prompt.ts      証憑分類プロンプト（25種別から判定）
classifier.service.ts     classifyDocument(画像) → 種別コード + 確信度

extractor.prompt.ts       フルOCR抽出プロンプト
extractor.service.ts      processOCR(画像URL) → 取引情報JSON

multi-extractor.prompt.ts 通帳・クレカ明細用プロンプト
multi-extractor.service.ts extractMultipleEntries() → 取引行の配列
```

### journal/  仕訳生成

```
journal.types.ts              型定義（入力・出力・科目参照・税区分参照）

ai-generator.prompt.ts        仕訳生成プロンプト構築
ai-generator.service.ts       generateJournalEntry(input) → 複合仕訳

rule-generator.service.ts     buildEntryFromRule(ルール, 取引) → 仕訳
                              家事按分がある場合は3行仕訳を生成

line-mapper.service.ts        mapLinesToDBFormat()
                              AI出力の科目名 → DB UUID に変換
                              取引先名・品目名も正規化して部分一致マッチ

generator.strategy.ts         generateJournalWithStrategy()
                              ルールマッチ → 失敗時 AI フォールバック
```

### rule-engine/  ルールマッチング

```
rule-engine.types.ts           型定義（RuleMatchInput, MatchedRule）

matcher.service.ts             matchProcessingRules()
                               → 最優先の1件を返す（or null）

matcher-with-candidates.ts     matchProcessingRulesWithCandidates()
                               → 最優先 + 他の候補一覧も返す

rule-name-generator.ts         generateRuleName(conditions)
                               → 「Amazon (消耗品) カード → 消耗品費」

conflict-detector.ts           detectConflicts() ← 将来実装（スタブ）
```

### export/  エクスポート

```
export.types.ts                FreeeTransaction 型
simple-csv.builder.ts          buildSimpleCsv() → Tax Copilot 独自CSV
freee-csv.builder.ts           buildFreeeCsv() → freee取込用21列CSV
freee-api.exporter.ts          exportToFreee()  → freee API 経由で登録
```

### document/  証憑管理

```
duplicate-checker.ts           checkDocumentDuplicate()  ハッシュ完全一致
                               checkReceiptDuplicate()   金額+日付+取引先の類似

supplier-matcher.ts            findSupplierAliasMatch()
                               完全一致 → 部分一致 → エイリアス の3段階
```


---


## adapters/ ── 外部サービスの隔離

> SDK更新・API仕様変更はここだけで吸収する。

### gemini/

```
gemini.config.ts     モデル名・リトライ回数(4)・最小間隔(150ms)
gemini.client.ts     GoogleGenAI初期化 + callGeminiWithRetry()
                     指数バックオフ(1s→2s→4s→8s) + スロットリング
```

### supabase/

```
supabase.client.ts        フロント用（anon key）+ auth/storageヘルパー
supabase-admin.client.ts  サーバー用（service_role key、RLSバイパス）
supabase.debug.ts         ブラウザコンソール用の認証診断
```

### freee/

```
freee.api-client.ts   POST /api/1/deals で取引登録
freee.oauth.ts        OAuth 2.0（未実装プレースホルダ）
```


---


## api/ + server/ ── Express サーバー

### api/ サーバー設定

```
server.ts                       Express初期化・CORS・ミドルウェア・起動
middleware/rate-limit.ts        apiLimiter(100回/15分)  expensiveLimiter(20回/15分)
middleware/logging.ts           リクエストログ
middleware/error-handler.ts     エラー応答 + 404
middleware/auth.ts              認証チェック（現在パススルー）
routes/health.route.ts          GET /health → { status: "ok" }
```

### server/ ルートハンドラ

```
api.ts          全APIエンドポイント実装（約700行）
                POST /api/documents/upload     証憑アップロード
                POST /api/ocr/process          OCR処理
                POST /api/journal-entries/generate  仕訳生成
                POST /api/freee/export         freeeエクスポート
                POST /api/process/batch        一括処理

index.ts        旧エントリポイント（startコマンドが使用）
services/       各サービスの実装ファイル群
utils/          Geminiクライアント初期化
```


---


# フロントエンド詳細


## web/features/ ── 画面の全体像

> 各 feature は独立したフォルダ。
> feature 間の直接 import は禁止。共通部品は shared/ に。

### auth/  認証

| ファイル | URL | 画面の内容 |
|---|---|---|
| `LoginPage` | `/login` | メール+パスワード / Google OAuth / 新規登録 |

### clients/  顧客管理

| ファイル | URL | 画面の内容 |
|---|---|---|
| `ClientListPage` | `/clients` | 顧客一覧。新規追加・編集・削除。業種フィルタ。一括CSV登録 |
| `ClientSummaryPage` | `/clients/:id/summary` | 顧客サマリー。売上・税区分・ワークフロー進捗・書類統計 |

### workflow/  業務フロー（アプリの中心）

| ファイル | URL | 画面の内容 |
|---|---|---|
| `UploadPage` | `/clients/:id/upload` | 証憑ドラッグ&ドロップ。進捗バー。重複検出 |
| `UploadOnlyPage` | `/upload-only` | viewer専用の簡易アップロード |
| `OCRPage` | `/clients/:id/ocr` | OCR実行・進捗。結果プレビュー。通帳等の複数行分割 |
| **`ReviewPage`** | `/clients/:id/review` | **最重要ページ。** 仕訳の確認・編集。科目/税区分変更。取引先名寄せ。承認/除外 |
| `ExportPage` | `/clients/:id/export` | 期間フィルタ。独自CSV / freee CSV / freee API 出力 |

ReviewPage 内部コンポーネント:
```
ReviewPage/
  ReviewPage.tsx        メインの仕訳一覧・操作
  EntryCard.tsx         個別の仕訳カード（インライン編集・削除・復元）
  ImageViewer.tsx       証憑画像プレビュー（ズーム対応）
  MultiEntryPanel.tsx   通帳・クレカ明細の複数取引パネル
```

ワークフロー共通:
```
components/WorkflowHeader.tsx   4ステップ進捗表示 + 前後ナビ
hooks/useWorkflowStorage.ts     ワークフロー永続化（Supabase連携）
```

### rules/  ルール管理

| ファイル | URL | 画面の内容 |
|---|---|---|
| `RulesIndexPage` | `/master/rules` | ルール一覧。スコープ別フィルタ。アコーディオン展開 |
| `IndustryDetailPage` | `/master/rules/industry/:id` | 業種別ルール詳細。追加・編集・削除 |
| `ClientListPage` | `.../clients` | 業種配下の顧客一覧 |
| `ClientDetailPage` | `.../client/:id` | 顧客別ルール詳細 |

### master/  マスタ管理

| ファイル | URL | 画面の内容 |
|---|---|---|
| `AccountsPage` | `/master/accounts` | 勘定科目。カテゴリ別表示・検索・freee連携ID |
| `TaxCategoriesPage` | `/master/tax-categories` | 税区分。課税/非課税/免税・税率設定 |
| `IndustriesPage` | `/master/industries` | 業種マスタ |
| `SuppliersPage` | `/master/suppliers` | 取引先。エイリアス管理・インボイス番号 |
| `ItemsPage` | `/master/items` | 品目マスタ |

### その他

| ファイル | URL | 画面の内容 |
|---|---|---|
| `ApprovalsPage` | `/approvals` | 仕訳承認。承認/却下/一括承認 |
| `ExcludedPage` | `/clients/:id/excluded` | 対象外証憑の一覧と復元 |
| `ExcludedHistoryPage` | `/clients/:id/excluded-history` | 除外履歴 |
| `SettingsPage` | `/settings` | ユーザー管理。追加・ロール変更・無効化 |


---


## web/shared/ ── 共有部品

```
components/
  ui/Modal.tsx                   汎用モーダルダイアログ
  ui/ComboBox.tsx                検索付きドロップダウン（科目・取引先選択）
  journal/CompoundJournalTable   複合仕訳テーブル（借方/貸方の明細行編集）

hooks/
  useAuth.ts                     ログインユーザー情報（user, role, org_id）
  useMasterData.ts               勘定科目・税区分マスタのキャッシュ

lib/
  api/index.ts                   Supabase APIクライアント（13種のCRUD）
  supabase.ts                    Supabase クライアントインスタンス

utils/
  format.ts                      formatDate(), formatCurrency(), formatSalesLabel()

types/
  views.ts                       UI専用の拡張型（EntryWithJoin 等）
```


---


## web/app/ ── アプリ骨格

```
App.tsx             BrowserRouter + AuthProvider + PrivateRoute
routes.tsx          全URL → ページコンポーネントの対応表
main.tsx            ReactDOM.createRoot（index.html のエントリポイント）

providers/
  AuthProvider      user / userProfile(role,org_id,name) / loading
  MasterDataProvider  accountItems / taxCategories / Map / refresh()
  WorkflowProvider    currentWorkflow / ステップ移動メソッド群

layouts/
  MainLayout        サイドバー + ヘッダー + 通知ベル
  AuthLayout        ログイン画面用（サイドバーなし）
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
VITE_SUPABASE_ANON_KEY         フロント用 anon key

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
npm run dev          # Vite 開発サーバー
npm run build        # フロントエンドビルド（tsc + vite build）
npm run build:server # サーバービルド（tsc --project tsconfig.server.json）
npm run build:all    # 上記2つを順次実行
npm run start        # サーバー起動（node dist/server/index.js）
npm test             # テスト実行（vitest）
```
