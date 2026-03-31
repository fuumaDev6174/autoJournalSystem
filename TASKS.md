# TASKS-restructure.md — ファイル構造リデザイン
# ============================================================
# 設計思想: バックエンド = ミッションクリティカル系の分割
#           フロントエンド = Feature分割
#
# 現状: 15,631行 / 34ファイル。一部分割は実行済み
#   (normalize.ts, normalizeJapanese.ts, ocr_service.ts,
#    journal_service.ts, rule-engine.ts, freee_service.ts,
#    validation_service.ts, ComboBox.tsx, MasterDataContext.tsx)
#
# 目標: 全ファイルをターゲット構造に移行する。
# ============================================================
#
# ★★★ 注意事項 ★★★
# - 各フェーズは順番に実行すること（依存関係あり）
# - 1フェーズごとにビルド通過を確認すること
# - import パスの変更は tsconfig の paths 設定と連動する
# - 既存のテストはないので、ビルド + 起動確認が検証手段
# ============================================================


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ターゲット構造（完成形）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# src/
# │
# │  ==============================
# │  バックエンド（Express + Gemini）
# │  ==============================
# │
# ├── core/                                # 検証済みコア（変更頻度: 極低）
# │   │                                    # 外部依存ゼロ。純粋関数のみ。
# │   │                                    # Supabase, Gemini, Express の import 禁止。
# │   │
# │   ├── accounting/                      # 会計の不変ルール
# │   │   ├── double-entry.ts              #   貸借一致検証
# │   │   ├── tax-calculation.ts           #   消費税計算（内税⇔外税変換、税額逆算）
# │   │   ├── withholding-tax.ts           #   源泉徴収税額の計算ロジック
# │   │   └── household-ratio.ts           #   家事按分の金額分割計算
# │   │
# │   ├── matching/                        # マッチングアルゴリズム
# │   │   ├── condition-evaluator.ts       #   AND条件評価（matchesConditions の核心ロジック）
# │   │   ├── priority-resolver.ts         #   優先順位解決（client > industry > shared）
# │   │   └── text-normalizer.ts           #   日本語正規化（normalizeJapanese）
# │   │
# │   └── validation/                      # 検証ルール
# │       ├── balance-checker.ts           #   貸借バランス検証（validateDebitCreditBalance）
# │       ├── amount-validator.ts          #   金額整合性（正の数、通貨単位）
# │       └── date-validator.ts            #   日付妥当性（和暦変換、会計期間）
# │
# ├── modules/                             # 機能モジュール（独立した業務機能単位）
# │   │                                    # 各モジュールは他モジュールに依存しない。
# │   │                                    # core/ への依存は許可。
# │   │
# │   ├── ocr/                             # OCRモジュール
# │   │   ├── classifier.service.ts        #   証憑種別判定（25種別 → document_type_code）
# │   │   ├── classifier.prompt.ts         #   証憑分類用の Gemini プロンプトテンプレート
# │   │   ├── extractor.service.ts         #   単一取引OCR抽出（レシート・領収書・請求書）
# │   │   ├── extractor.prompt.ts          #   OCR抽出用の Gemini プロンプトテンプレート
# │   │   ├── multi-extractor.service.ts   #   複数取引OCR抽出（通帳・クレカ明細）
# │   │   ├── multi-extractor.prompt.ts    #   複数取引用の Gemini プロンプトテンプレート
# │   │   └── ocr.types.ts                #   OCRTransaction, OCRResult 等の型定義
# │   │
# │   ├── journal/                         # 仕訳モジュール
# │   │   ├── ai-generator.service.ts      #   AI仕訳生成（Gemini Pro呼び出し）
# │   │   ├── ai-generator.prompt.ts       #   仕訳生成用の Gemini プロンプトテンプレート
# │   │   ├── rule-generator.service.ts    #   ルールベース仕訳生成（buildEntryFromRule）
# │   │   ├── generator.strategy.ts        #   生成戦略（ルールマッチ → AIフォールバック）
# │   │   ├── line-mapper.service.ts       #   AI出力の名前 → DB UUID マッピング（mapLinesToDBFormat）
# │   │   └── journal.types.ts             #   GeneratedJournalEntry, JournalEntryInput 等
# │   │
# │   ├── rule-engine/                     # ルールエンジンモジュール
# │   │   ├── matcher.service.ts           #   ルールマッチング（matchProcessingRules）
# │   │   ├── matcher-with-candidates.ts   #   候補付きマッチング
# │   │   ├── rule-name-generator.ts       #   ルール名自動生成（generateRuleName）
# │   │   ├── conflict-detector.ts         #   ルール競合検出（将来機能、スタブのみ）
# │   │   └── rule-engine.types.ts         #   RuleMatchInput, MatchedRule 等
# │   │
# │   ├── export/                          # エクスポートモジュール
# │   │   ├── simple-csv.builder.ts        #   Tax Copilot独自CSV生成
# │   │   ├── freee-csv.builder.ts         #   freee取込CSV生成（21列形式）
# │   │   ├── freee-api.exporter.ts        #   freee API経由エクスポート
# │   │   └── export.types.ts              #   FreeeTransaction 等
# │   │
# │   ├── document/                        # 証憑管理モジュール
# │   │   ├── duplicate-checker.ts         #   証憑重複チェック（hash + 金額日付）
# │   │   ├── supplier-matcher.ts          #   取引先名寄せ（正規化 + エイリアス）
# │   │   └── document.types.ts
# │   │
# │   └── identity/                        # 認証・認可モジュール（将来拡張）
# │       ├── role.types.ts                #   4ロールの型定義・権限マップ
# │       └── tenant.types.ts              #   マルチテナント関連型
# │
# ├── adapters/                            # 外部接続アダプター
# │   │                                    # 外部サービスの技術詳細を隔離する。
# │   │                                    # APIのバージョン変更、SDK更新はここだけで吸収。
# │   │
# │   ├── gemini/                          # Google Gemini API
# │   │   ├── gemini.client.ts             #   初期化 + リトライ + スロットリング
# │   │   └── gemini.config.ts             #   モデル名、リトライ回数等の設定値
# │   │
# │   ├── supabase/                        # Supabase（DB + Storage + Auth）
# │   │   ├── supabase.client.ts           #   フロント用（anon key）
# │   │   ├── supabase-admin.client.ts     #   サーバー用（service_role key）
# │   │   └── supabase.debug.ts            #   debugAuth 診断関数
# │   │
# │   └── freee/                           # freee API
# │       ├── freee.api-client.ts          #   REST APIクライアント
# │       └── freee.oauth.ts               #   OAuth 2.0 フロー（将来実装）
# │
# ├── api/                                 # APIサーバー（薄いルーティング層）
# │   │                                    # Express の設定とルートのみ。
# │   │                                    # ビジネスロジックは modules/ に委譲。
# │   │
# │   ├── server.ts                        #   Express エントリポイント（現 index.ts）
# │   ├── routes/                          #   ルートハンドラ
# │   │   ├── health.route.ts              #   ヘルスチェック
# │   │   ├── documents.route.ts           #   証憑アップロード
# │   │   ├── ocr.route.ts                 #   OCR処理
# │   │   ├── journals.route.ts            #   仕訳生成
# │   │   └── freee.route.ts               #   freeeエクスポート
# │   └── middleware/                      #   ミドルウェア
# │       ├── auth.middleware.ts           #   認証チェック
# │       ├── rate-limit.middleware.ts     #   レート制限
# │       ├── logging.middleware.ts        #   リクエストログ
# │       └── error-handler.middleware.ts  #   エラーハンドリング
# │
# │
# │  ==============================
# │  フロントエンド（React + Tailwind）
# │  ==============================
# │
# ├── web/                                 # フロントエンド
# │   │
# │   ├── app/                             # アプリケーションの骨格
# │   │   ├── App.tsx                      #   ルートコンポーネント
# │   │   ├── routes.tsx                   #   ルーティング定義一覧
# │   │   ├── providers/                   #   全体プロバイダ
# │   │   │   ├── AuthProvider.tsx         #     認証コンテキスト（user + role + org_id）
# │   │   │   ├── MasterDataProvider.tsx   #     マスタデータキャッシュ
# │   │   │   └── WorkflowProvider.tsx     #     ワークフロー状態管理
# │   │   └── layouts/                     #   レイアウト
# │   │       ├── MainLayout.tsx           #     サイドバー + ヘッダー + 通知ベル
# │   │       └── AuthLayout.tsx           #     ログイン画面用（サイドバーなし）
# │   │
# │   ├── features/                        # 機能単位のフォルダ
# │   │   │
# │   │   ├── auth/                        # 認証機能
# │   │   │   └── pages/
# │   │   │       └── LoginPage.tsx
# │   │   │
# │   │   ├── clients/                     # 顧客管理機能
# │   │   │   ├── pages/
# │   │   │   │   ├── ClientListPage.tsx   #     顧客一覧（現 clients.tsx）
# │   │   │   │   └── ClientSummaryPage.tsx#     顧客サマリー（現 summary.tsx）
# │   │   │   ├── components/
# │   │   │   │   ├── ClientCard.tsx       #     顧客カード
# │   │   │   │   ├── ClientForm.tsx       #     新規追加・編集フォーム
# │   │   │   │   └── BulkImportForm.tsx   #     一括登録フォーム
# │   │   │   └── hooks/
# │   │   │       └── useClients.ts        #     顧客データ取得・操作フック
# │   │   │
# │   │   ├── workflow/                    # ワークフロー機能（業務の中心）
# │   │   │   ├── pages/
# │   │   │   │   ├── UploadPage.tsx       #     証憑アップロード（現 upload.tsx）
# │   │   │   │   ├── UploadOnlyPage.tsx   #     viewer専用アップロード
# │   │   │   │   ├── OCRPage.tsx          #     OCR処理（現 ocr.tsx）
# │   │   │   │   ├── ReviewPage/          #     仕訳確認（現 review.tsx → 分割）
# │   │   │   │   │   ├── ReviewPage.tsx   #       コーディネーター（300行以下目標）
# │   │   │   │   │   ├── EntryCard.tsx    #       個別仕訳の表示・編集カード
# │   │   │   │   │   ├── ImageViewer.tsx  #       証憑画像ビューワー（ズーム・回転）
# │   │   │   │   │   ├── LineEditor.tsx   #       明細行の編集UI
# │   │   │   │   │   ├── MultiEntryPanel.tsx #    複数取引（通帳等）パネル
# │   │   │   │   │   └── useReviewData.ts #       データ取得・状態管理フック
# │   │   │   │   └── ExportPage.tsx       #     仕訳出力（現 export.tsx）
# │   │   │   ├── components/
# │   │   │   │   └── WorkflowHeader.tsx   #     ワークフロー進捗ヘッダー
# │   │   │   └── hooks/
# │   │   │       ├── useWorkflow.ts       #     ワークフロー操作フック
# │   │   │       └── useWorkflowStorage.ts#     Supabase永続化（現 workflowStorage.ts）
# │   │   │
# │   │   ├── rules/                       # ルール管理機能
# │   │   │   ├── pages/
# │   │   │   │   ├── RulesIndexPage.tsx   #     ルール一覧（現 rules/index.tsx）
# │   │   │   │   ├── IndustryDetailPage.tsx#    業種別ルール詳細
# │   │   │   │   ├── ClientListPage.tsx   #     業種配下の顧客一覧
# │   │   │   │   └── ClientDetailPage.tsx #     顧客別ルール詳細
# │   │   │   ├── components/
# │   │   │   │   ├── RuleRow.tsx          #     アコーディオン展開式ルール行
# │   │   │   │   ├── RuleForm.tsx         #     ルール追加・編集フォーム
# │   │   │   │   └── ScopeFilter.tsx      #     スコープ切替タブ
# │   │   │   └── hooks/
# │   │   │       └── useRules.ts
# │   │   │
# │   │   ├── master/                      # マスタ管理機能
# │   │   │   ├── pages/
# │   │   │   │   ├── AccountsPage.tsx     #     勘定科目（現 accounts.tsx）
# │   │   │   │   ├── TaxCategoriesPage.tsx#     税区分（現 taxCategories.tsx）
# │   │   │   │   ├── IndustriesPage.tsx   #     業種（現 industries.tsx）
# │   │   │   │   ├── SuppliersPage.tsx    #     取引先（現 suppliers.tsx）
# │   │   │   │   └── ItemsPage.tsx        #     品目（現 items.tsx）
# │   │   │   └── components/
# │   │   │       └── MasterTable.tsx      #     共通CRUDテーブル（将来抽出）
# │   │   │
# │   │   ├── approvals/                   # 承認機能
# │   │   │   ├── pages/
# │   │   │   │   └── ApprovalsPage.tsx
# │   │   │   └── hooks/
# │   │   │       └── useApprovals.ts
# │   │   │
# │   │   ├── excluded/                    # 対象外証憑管理
# │   │   │   ├── pages/
# │   │   │   │   ├── ExcludedPage.tsx
# │   │   │   │   └── ExcludedHistoryPage.tsx
# │   │   │   └── components/
# │   │   │       └── CategoryBadge.tsx    #     証憑カテゴリバッジ
# │   │   │
# │   │   └── settings/                    # 設定機能
# │   │       └── pages/
# │   │           └── SettingsPage.tsx     #     ユーザー管理
# │   │
# │   ├── shared/                          # 機能横断の共有リソース
# │   │   ├── components/
# │   │   │   ├── ui/                      #   汎用UIコンポーネント
# │   │   │   │   ├── Modal.tsx
# │   │   │   │   ├── ComboBox.tsx
# │   │   │   │   ├── StatusBadge.tsx
# │   │   │   │   └── ConfirmDialog.tsx
# │   │   │   └── journal/                #   仕訳関連の共通コンポーネント
# │   │   │       └── CompoundJournalTable.tsx
# │   │   ├── hooks/
# │   │   │   ├── useAuth.ts              #   AuthProvider の useContext ラッパー
# │   │   │   ├── useMasterData.ts        #   MasterDataProvider の useContext ラッパー
# │   │   │   └── useNotifications.ts     #   通知ポーリング
# │   │   ├── lib/
# │   │   │   ├── api/                    #   Supabase DAL（Data Access Layer）
# │   │   │   │   ├── base.api.ts         #     handleResponse ヘルパー
# │   │   │   │   ├── clients.api.ts      #     顧客API
# │   │   │   │   ├── journals.api.ts     #     仕訳API（ヘッダー + 明細行）
# │   │   │   │   ├── rules.api.ts        #     ルールAPI
# │   │   │   │   ├── documents.api.ts    #     証憑API
# │   │   │   │   ├── suppliers.api.ts    #     取引先API
# │   │   │   │   ├── master.api.ts       #     マスタ系API（勘定科目、税区分、業種、品目）
# │   │   │   │   ├── workflows.api.ts    #     ワークフローAPI
# │   │   │   │   ├── users.api.ts        #     ユーザーAPI
# │   │   │   │   ├── notifications.api.ts#     通知API
# │   │   │   │   └── index.ts            #     再エクスポート
# │   │   │   └── supabase.ts             #   Supabase クライアント初期化
# │   │   ├── types/                      #   フロント専用の型定義
# │   │   │   └── views.ts               #     UIビュー専用型（EntryWithJoin等）
# │   │   └── utils/
# │   │       └── format.ts              #   日付・金額のフォーマッター
# │   │
# │   ├── main.tsx                        # React エントリポイント
# │   └── index.css                       # Tailwind CSS
# │
# │
# │  ==============================
# │  共有（サーバー/クライアント両方で使用）
# │  ==============================
# │
# ├── shared/                              # 全層共有
# │   ├── types/                           # 共通型定義
# │   │   ├── models.ts                    #   DBスキーマ対応型（Client, JournalEntry等）
# │   │   ├── enums.ts                     #   列挙型（DocumentType, JournalStatus等）
# │   │   └── index.ts                     #   再エクスポート
# │   └── utils/
# │       └── normalize-japanese.ts        #   日本語正規化（サーバー/クライアント共用）
# │
# │
# │  ==============================
# │  データベース
# │  ==============================
# │
# └── db/
#     ├── schema.sql                       # 全テーブル定義
#     ├── migrations/                      # マイグレーションSQL
#     │   ├── 001-initial.sql
#     │   └── 002-rules-redesign.sql
#     └── seeds/                           # 初期データ投入SQL
#         ├── account-items.sql
#         ├── tax-categories.sql
#         └── test-users.sql
#
# ============================================================


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 各フォルダの設計意図（Claude Code実行者向け解説）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# ■ core/ — 「絶対に壊してはいけない」コード
#   - 外部依存ゼロ。import できるのは shared/types と shared/utils のみ。
#   - Supabase, Gemini, Express, React の import は禁止。
#   - 入力→出力の純粋関数だけで構成する。
#   - 将来テストカバレッジ100%を目指す領域。
#   - 変更頻度: 年に0〜2回（税法改正時のみ）。
#   - 例: 貸借一致検証は「借方合計 - 貸方合計 < 1円」を返すだけの関数。
#
# ■ modules/ — 「独立した業務機能」
#   - 各モジュールは他モジュールに直接依存しない。
#   - core/ と adapters/ への依存は許可。
#   - OCRが壊れてもエクスポートは動く、という独立性を保つ。
#   - 将来マイクロサービス化する場合、modules/ がそのまま分離単位になる。
#
# ■ adapters/ — 「外部サービスの技術詳細を隔離」
#   - Gemini SDK のバージョンアップ → gemini/ だけ変更。
#   - Supabase から別DBに移行 → supabase/ だけ変更。
#   - freee API の仕様変更 → freee/ だけ変更。
#   - modules/ は adapters/ の interface に依存し、具体実装に依存しない。
#
# ■ api/ — 「薄いルーティング層」
#   - Express の設定とルートのみ。20〜50行/ファイル程度。
#   - ビジネスロジックは一切書かない。modules/ に委譲する。
#   - リクエスト受信 → modules呼び出し → レスポンス返却のみ。
#
# ■ web/app/ — 「アプリケーションの骨格」
#   - ルーティング定義、プロバイダ、レイアウトのみ。
#   - ビジネスロジックやデータ取得は features/ に委譲。
#
# ■ web/features/ — 「機能単位のUI」
#   - 各 feature は独立したフォルダ。pages/, components/, hooks/ の3層。
#   - feature 間の直接 import は禁止。共通部品は shared/ に昇格させる。
#   - 「ワークフローの画面を変更するなら features/workflow/ だけ触る」が原則。
#   - 巨大ページ（review.tsx 等）はフォルダ化して内部分割。
#
# ■ web/shared/ — 「2つ以上の feature で使うもの」
#   - 1つの feature でしか使わないものは入れない。
#   - api/ フォルダは現在の api.ts を機能別ファイルに分割したもの。
#
# ■ shared/ — 「サーバー/クライアント両方で使うもの」
#   - 型定義とユーティリティのみ。ロジックは入れない。
#   - normalize-japanese.ts はサーバー（取引先名寄せ）とクライアント（表示）の両方で必要。
#
# ============================================================


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# フェーズ 0: tsconfig パスエイリアス設定
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 最初にパスエイリアスを設定して、移行後の import パスを使えるようにする。

## ファイル: tsconfig.json

compilerOptions.paths を以下に更新:
```json
{
  "compilerOptions": {
    "paths": {
      "@/core/*":       ["./src/core/*"],
      "@/modules/*":    ["./src/modules/*"],
      "@/adapters/*":   ["./src/adapters/*"],
      "@/api/*":        ["./src/api/*"],
      "@/web/*":        ["./src/web/*"],
      "@/shared/*":     ["./src/shared/*"],
      "@/types":        ["./src/shared/types/index.ts"]
    }
  }
}
```

## ファイル: tsconfig.app.json（フロントエンド用）
同じ paths を追加。include を ["src/web/**/*", "src/shared/**/*"] に変更。

## ファイル: tsconfig.server.json（バックエンド用）
同じ paths を追加。include を ["src/core/**/*", "src/modules/**/*", "src/adapters/**/*", "src/api/**/*", "src/shared/**/*"] に変更。

## ファイル: vite.config.ts

resolve.alias を更新:
```typescript
resolve: {
  alias: {
    '@/core':     path.resolve(__dirname, 'src/core'),
    '@/modules':  path.resolve(__dirname, 'src/modules'),
    '@/adapters': path.resolve(__dirname, 'src/adapters'),
    '@/api':      path.resolve(__dirname, 'src/api'),
    '@/web':      path.resolve(__dirname, 'src/web'),
    '@/shared':   path.resolve(__dirname, 'src/shared'),
    '@/types':    path.resolve(__dirname, 'src/shared/types/index.ts'),
  },
},
```

★ フェーズ0完了後、`npm run build` でエラーが出ないことを確認。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# フェーズ 1: shared/ と core/ の作成（依存ゼロの基盤層）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 既存コードから外部依存のない純粋関数を抽出する。
# 他の全フェーズの前提になる基盤。

## タスク 1-1: shared/types/ の作成

### 移動元: src/types/index.ts
### 移動先: src/shared/types/models.ts + src/shared/types/enums.ts + src/shared/types/index.ts

現在の src/types/index.ts から:
- interface 定義（Client, JournalEntry, AccountItem 等） → models.ts
- union type / literal type（DocumentType の種別等）→ enums.ts
- index.ts で全て再エクスポート

旧パス src/types/index.ts には互換用の再エクスポートを残す:
```typescript
// 後方互換 — 新コードでは @/shared/types を使うこと
export * from '../shared/types';
```

## タスク 1-2: shared/utils/normalize-japanese.ts の作成

### 移動元: src/shared/utils/normalizeJapanese.ts（既に存在）
### 移動先: src/shared/utils/normalize-japanese.ts（ファイル名をケバブケースに統一）

既存の normalizeJapanese.ts をリネーム。
インポートしている全ファイルのパスを更新。

## タスク 1-3: core/accounting/ の作成

### 抽出元: src/server/services.ts（現在は services/ 配下に分割済み）

#### core/accounting/double-entry.ts
validation_service.ts の validateDebitCreditBalance から純粋関数部分を抽出:
```typescript
/**
 * 仕訳明細行の貸借バランスを検証する。
 * 外部依存ゼロ。引数 → 結果のみ。
 */
export interface BalanceCheckResult {
  isBalanced: boolean;
  debitTotal: number;
  creditTotal: number;
  difference: number;
}

export function checkDebitCreditBalance(
  lines: ReadonlyArray<{ debit_credit: string; amount: number }>
): BalanceCheckResult {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    if (line.debit_credit === 'debit') debitTotal += line.amount;
    else if (line.debit_credit === 'credit') creditTotal += line.amount;
  }
  const difference = Math.abs(debitTotal - creditTotal);
  return { isBalanced: difference < 1, debitTotal, creditTotal, difference };
}
```

#### core/accounting/tax-calculation.ts
```typescript
/**
 * 消費税の内税⇔外税変換。
 * 外部依存ゼロ。
 */

/** 税込金額 → 税額を逆算（内税の場合） */
export function calcTaxFromInclusive(inclusiveAmount: number, taxRate: number): number {
  return Math.round(inclusiveAmount * taxRate / (1 + taxRate));
}

/** 税抜金額 → 税込金額に変換 */
export function calcInclusiveAmount(exclusiveAmount: number, taxRate: number): number {
  return Math.round(exclusiveAmount * (1 + taxRate));
}

/** 税込金額 → 税抜金額に変換 */
export function calcExclusiveAmount(inclusiveAmount: number, taxRate: number): number {
  return inclusiveAmount - calcTaxFromInclusive(inclusiveAmount, taxRate);
}
```

#### core/accounting/withholding-tax.ts
```typescript
/**
 * 源泉徴収税額の計算。
 * 所得税法204条1項に基づく。
 */

/** 報酬に対する源泉徴収税額を計算 */
export function calcWithholdingTax(amount: number): number {
  if (amount <= 1_000_000) {
    return Math.floor(amount * 0.1021);
  }
  // 100万円超の部分は20.42%
  return Math.floor(1_000_000 * 0.1021) + Math.floor((amount - 1_000_000) * 0.2042);
}
```

#### core/accounting/household-ratio.ts
```typescript
/**
 * 家事按分の金額分割計算。
 * 外部依存ゼロ。
 */
export interface HouseholdSplitResult {
  businessAmount: number;
  personalAmount: number;
  businessTax: number | null;
  personalTax: number | null;
}

export function splitByHouseholdRatio(
  totalAmount: number,
  taxAmount: number | null,
  businessRatio: number
): HouseholdSplitResult {
  const businessAmount = Math.round(totalAmount * businessRatio);
  const personalAmount = totalAmount - businessAmount;
  const businessTax = taxAmount != null ? Math.round(taxAmount * businessRatio) : null;
  const personalTax = taxAmount != null ? (taxAmount - (businessTax || 0)) : null;
  return { businessAmount, personalAmount, businessTax, personalTax };
}
```

## タスク 1-4: core/matching/ の作成

### 抽出元: rule-engine.ts の matchesConditions 関数

#### core/matching/condition-evaluator.ts
matchesConditions の純粋ロジック部分を抽出。
Supabase への依存はないので、そのまま移動できる。

入力型と出力型を明示的に定義:
```typescript
export interface ConditionSet {
  supplier_pattern?: string | null;
  transaction_pattern?: string | null;
  amount_min?: number | null;
  amount_max?: number | null;
  item_pattern?: string | null;
  payment_method?: string | null;
  document_type?: string | null;
  has_invoice_number?: boolean | null;
  tax_rate_hint?: number | null;
  is_internal_tax?: boolean | null;
  frequency_hint?: string | null;
  tategaki_pattern?: string | null;
  invoice_qualification?: string | null;
  addressee_pattern?: string | null;
  transaction_type?: string | null;
  transfer_fee_bearer?: string | null;
}

export interface MatchInput {
  supplier: string;
  amount: number;
  description?: string;
  item_name?: string | null;
  payment_method?: string | null;
  document_type?: string | null;
  has_invoice_number?: boolean | null;
  tax_rate_hint?: number | null;
  is_internal_tax?: boolean | null;
  frequency_hint?: string | null;
  tategaki?: string | null;
  invoice_qualification?: string | null;
  addressee?: string | null;
  transaction_type?: string | null;
  transfer_fee_bearer?: string | null;
}

/**
 * ルールの conditions が入力にマッチするか判定。
 * 全ての指定条件がANDで一致する必要がある。
 * 条件が1つもないルールはマッチしない。
 */
export function evaluateConditions(conditions: ConditionSet, input: MatchInput): boolean {
  // 既存の matchesConditions ロジックをそのまま移動
}
```

#### core/matching/priority-resolver.ts
```typescript
/**
 * ルールの優先順位を解決する。
 * scope: client(最優先) > industry > shared(最低優先)
 * 同一scope内は priority 数値が小さいほど優先。
 */
export type RuleScope = 'client' | 'industry' | 'shared';

const SCOPE_ORDER: Record<RuleScope, number> = {
  client: 0,
  industry: 1,
  shared: 2,
};

export interface SortableRule {
  scope: RuleScope;
  priority: number;
  client_id: string | null;
  industry_id: string | null;
}

export function sortByPriority<T extends SortableRule>(
  rules: T[],
  targetClientId: string,
  targetIndustryIds: string[]
): T[] {
  return [...rules]
    .filter(r => {
      if (r.scope === 'client') return r.client_id === targetClientId;
      if (r.scope === 'industry') return r.industry_id != null && targetIndustryIds.includes(r.industry_id);
      return true; // shared
    })
    .sort((a, b) => {
      const scopeDiff = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
      if (scopeDiff !== 0) return scopeDiff;
      return a.priority - b.priority;
    });
}
```

#### core/matching/text-normalizer.ts
shared/utils/normalize-japanese.ts を re-export するだけ:
```typescript
export { normalizeJapanese } from '@/shared/utils/normalize-japanese';
```

## タスク 1-5: core/validation/ の作成

#### core/validation/balance-checker.ts
core/accounting/double-entry.ts を re-export（同じロジック）:
```typescript
export { checkDebitCreditBalance, type BalanceCheckResult } from '@/core/accounting/double-entry';
```

#### core/validation/amount-validator.ts
```typescript
/** 金額の妥当性検証 */
export function isValidAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount >= 0;
}

/** 通貨金額の丸め（1円未満を四捨五入） */
export function roundCurrency(amount: number): number {
  return Math.round(amount);
}
```

#### core/validation/date-validator.ts
```typescript
/** YYYY-MM-DD 形式かどうかを検証 */
export function isValidDateString(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

/** 会計期間内かどうかを検証 */
export function isWithinFiscalYear(
  dateStr: string,
  fiscalYearStart: string,
  fiscalYearEnd: string
): boolean {
  const d = new Date(dateStr);
  return d >= new Date(fiscalYearStart) && d <= new Date(fiscalYearEnd);
}
```

★ フェーズ1完了後、`npm run build` でエラーが出ないことを確認。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# フェーズ 2: adapters/ の作成（外部依存の隔離）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 外部サービスへの接続コードを1箇所に集約する。

## タスク 2-1: adapters/gemini/ の作成

### 移動元: src/server/utils/normalize.ts（Geminiクライアント部分）
→ 既存ファイルには normalizeJapanese とは無関係にGeminiクライアントが入っている。
  ファイル名が紛らわしいので、この機会にGemini関連を完全に分離する。

#### adapters/gemini/gemini.config.ts
```typescript
export const GEMINI_CONFIG = {
  modelOcr: process.env.GEMINI_MODEL_OCR || 'gemini-3-flash-preview',
  modelJournal: process.env.GEMINI_MODEL_JOURNAL || 'gemini-3.1-pro-preview',
  maxRetries: 4,
  minIntervalMs: 150,
} as const;
```

#### adapters/gemini/gemini.client.ts
normalize.ts から以下を移動:
- GoogleGenAI の初期化
- callGeminiWithRetry 関数
- sleep 関数
- lastGeminiCallTime の状態管理

エクスポート:
```typescript
export { ai, callGeminiWithRetry, sleep };
```

## タスク 2-2: adapters/supabase/ の作成

#### adapters/supabase/supabase.client.ts
### 移動元: src/client/lib/supabase.ts

createClient（anon key版）と auth/storage ヘルパーを移動。

#### adapters/supabase/supabase-admin.client.ts（新規作成）
サーバー専用の service_role クライアント:
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('FATAL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定');
}

export const supabaseAdmin = createClient(supabaseUrl || '', serviceRoleKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

#### adapters/supabase/supabase.debug.ts
### 移動元: src/client/lib/supabase.ts の debugAuth 関数

## タスク 2-3: adapters/freee/ の作成

#### adapters/freee/freee.api-client.ts
### 移動元: freee_service.ts の exportToFreee 関数の HTTP 通信部分

freee REST API への POST リクエスト送信のみを担当する薄いクライアント。
ビジネスロジック（データ変換等）は modules/export/ に残す。

#### adapters/freee/freee.oauth.ts
将来実装。現時点ではプレースホルダ:
```typescript
// TODO: freee OAuth 2.0 認証フローの実装
// 必要なエンドポイント:
//   - /api/freee/auth: 認可コードリクエスト
//   - /api/freee/callback: コールバック処理
//   - トークンリフレッシュ
export const FREEE_OAUTH_NOT_IMPLEMENTED = true;
```

★ フェーズ2完了後、`npm run build` でエラーが出ないことを確認。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# フェーズ 3: modules/ の作成（ビジネスロジックの移行）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 既に分割済みのサービスファイルを modules/ 配下に再配置し、
# 足りない分割を追加する。

## タスク 3-1: modules/ocr/ の作成

### 移動元:
- ocr_service.ts → 以下の3ファイルに分割

#### modules/ocr/ocr.types.ts
OCRTransaction, OCRResult の型定義を移動。

#### modules/ocr/classifier.service.ts
classifyDocument 関数を移動。

#### modules/ocr/classifier.prompt.ts
classifyDocument 内のプロンプト文字列を定数として分離:
```typescript
export const CLASSIFY_DOCUMENT_PROMPT = `あなたは日本の税理士事務所で使われる証憑分類AIです。
以下の画像を分析し、証憑の種別を判定してください。
...`;
```
→ プロンプトの修正（税務知識の更新等）がコードのロジック変更と分離される。

#### modules/ocr/extractor.service.ts
processOCR 関数を移動。

#### modules/ocr/extractor.prompt.ts
processOCR 内のプロンプト文字列を分離。

#### modules/ocr/multi-extractor.service.ts
extractMultipleEntries 関数を移動。

#### modules/ocr/multi-extractor.prompt.ts
extractMultipleEntries 内のプロンプト文字列を分離。

## タスク 3-2: modules/journal/ の作成

### 移動元:
- journal_service.ts → 以下に分割

#### modules/journal/journal.types.ts
JournalEntryInput, GeneratedJournalEntry, GeneratedJournalLine, AccountItemRef, TaxCategoryRef を移動。

#### modules/journal/ai-generator.service.ts
generateJournalEntry 関数を移動。

#### modules/journal/ai-generator.prompt.ts
generateJournalEntry 内のプロンプト文字列を分離。

#### modules/journal/rule-generator.service.ts
### 移動元: rule-engine.ts の buildEntryFromRule 関数
ルールマッチ結果から仕訳データを構築するロジック。
core/accounting/household-ratio.ts を使って家事按分を計算。

#### modules/journal/line-mapper.service.ts
### 移動元: rule-engine.ts の mapLinesToDBFormat 関数
AI出力の科目名 → DB UUID マッピング。

#### modules/journal/generator.strategy.ts（新規）
ルールマッチ → AIフォールバックの戦略パターン:
```typescript
import { matchProcessingRules } from '@/modules/rule-engine/matcher.service';
import { buildEntryFromRule } from './rule-generator.service';
import { generateJournalEntry } from './ai-generator.service';

/**
 * 仕訳生成の統合戦略:
 * 1. ルールエンジンでマッチを試みる
 * 2. マッチしなければ Gemini AI にフォールバック
 */
export async function generateJournalWithStrategy(input, rules, accountItems, taxCategories) {
  const matched = matchProcessingRules(rules, input);
  if (matched) {
    return buildEntryFromRule(matched, input, accountItems, taxCategories);
  }
  return generateJournalEntry(input);
}
```

## タスク 3-3: modules/rule-engine/ の作成

### 移動元: rule-engine.ts

#### modules/rule-engine/matcher.service.ts
matchProcessingRules 関数を移動。
core/matching/condition-evaluator.ts と core/matching/priority-resolver.ts を使う。

#### modules/rule-engine/matcher-with-candidates.ts
matchProcessingRulesWithCandidates 関数を移動。

#### modules/rule-engine/rule-name-generator.ts
generateRuleName 関数を移動。

#### modules/rule-engine/rule-engine.types.ts
RuleMatchInput, MatchedRule の型定義を移動。

#### modules/rule-engine/conflict-detector.ts（新規・スタブ）
```typescript
// TODO: ルール競合検出の実装
// 同一条件で異なるアクションを持つルールを検出する
export function detectConflicts(rules: any[]): any[] {
  return []; // 将来実装
}
```

## タスク 3-4: modules/export/ の作成

### 移動元: freee_service.ts + export.tsx 内の CSV 生成関数

#### modules/export/simple-csv.builder.ts
export.tsx の buildSimpleCsv 関数を移動。
フロントエンド依存（entry._debitAccountName 等）を排除し、
引数でマッピング済みデータを受け取る純粋関数に変更。

#### modules/export/freee-csv.builder.ts
export.tsx の buildFreeeCsv 関数を移動。
同様にフロントエンド依存を排除。

#### modules/export/freee-api.exporter.ts
### 移動元: freee_service.ts の exportToFreee
adapters/freee/freee.api-client.ts を使って送信。

#### modules/export/export.types.ts
FreeeTransaction の型定義を移動。

## タスク 3-5: modules/document/ の作成

### 移動元: validation_service.ts の一部

#### modules/document/duplicate-checker.ts
checkDocumentDuplicate, checkReceiptDuplicate を移動。

#### modules/document/supplier-matcher.ts
findSupplierAliasMatch を移動。

★ フェーズ3完了後、`npm run build` でエラーが出ないことを確認。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# フェーズ 4: api/ の作成（Express サーバーの再構成）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 現在の index.ts を薄いルーティング層に分割する。

## タスク 4-1: api/server.ts

### 移動元: src/server/index.ts

Express アプリの初期化、ミドルウェア設定、サーバー起動のみ。
ルートハンドラは routes/ に委譲。

## タスク 4-2: api/middleware/ の作成

### 移動元: src/server/index.ts 内のミドルウェア設定

#### api/middleware/rate-limit.middleware.ts
apiLimiter, expensiveLimiter の定義。

#### api/middleware/logging.middleware.ts
リクエストログのミドルウェア。

#### api/middleware/error-handler.middleware.ts
エラーハンドリング + 404 ハンドリング。

#### api/middleware/auth.middleware.ts（新規）
将来の認証チェックミドルウェアのプレースホルダ。
現状は Supabase Auth + RLS に依存しているのでスタブ。

## タスク 4-3: api/routes/ の作成

各ルートファイルは薄いハンドラ。
リクエスト受信 → modules/ 呼び出し → レスポンス返却のみ。

#### api/routes/health.route.ts
```typescript
import { Router } from 'express';
const router = Router();
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
export default router;
```

#### api/routes/documents.route.ts
POST /api/documents/upload のハンドラ。

#### api/routes/ocr.route.ts
POST /api/ocr/process のハンドラ。
modules/ocr/ の classifier と extractor を呼び出す。

#### api/routes/journals.route.ts
POST /api/journal-entries/generate のハンドラ。
modules/journal/generator.strategy.ts を呼び出す。

#### api/routes/freee.route.ts
POST /api/freee/export, GET /api/freee/connection-status のハンドラ。
modules/export/ を呼び出す。

★ フェーズ4完了後、`npm run build && npm run start` でサーバー起動確認。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# フェーズ 5: web/app/ の作成（フロント骨格の移行）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# フロントエンドの骨格部分を web/app/ に移動。

## タスク 5-1: web/app/providers/ の作成

#### web/app/providers/AuthProvider.tsx
### 移動元: src/client/main.tsx 内の AuthContext + AuthProvider

拡張内容:
- userProfile（role, organization_id, name）を追加
- Supabase Auth User 取得後に users テーブルを1回だけクエリ

#### web/app/providers/MasterDataProvider.tsx
### 移動元: src/client/context/MasterDataContext.tsx（既に作成済み）

#### web/app/providers/WorkflowProvider.tsx
### 移動元: src/client/context/WorkflowContext.tsx

## タスク 5-2: web/app/layouts/ の作成

#### web/app/layouts/MainLayout.tsx
### 移動元: src/client/components/layout/Layout.tsx

通知ベルコンポーネント（NotificationBell）もこのファイル内に含めるか、
web/shared/components/notifications/NotificationBell.tsx に分離。

#### web/app/layouts/AuthLayout.tsx（新規）
ログイン画面用の最小レイアウト（サイドバーなし）。

## タスク 5-3: web/app/App.tsx + routes.tsx の作成

#### web/app/App.tsx
### 移動元: src/client/main.tsx 内の App コンポーネント

プロバイダの組み立て:
```typescript
<BrowserRouter>
  <AuthProvider>
    <MasterDataProvider>
      <Routes>
        <Route path="/login" element={<AuthLayout><LoginPage /></AuthLayout>} />
        <Route path="/*" element={
          <PrivateRoute>
            <WorkflowProvider>
              <MainLayout>
                <AppRoutes />
              </MainLayout>
            </WorkflowProvider>
          </PrivateRoute>
        } />
      </Routes>
    </MasterDataProvider>
  </AuthProvider>
</BrowserRouter>
```

#### web/app/routes.tsx
全ルートの定義を1ファイルに集約:
```typescript
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/clients" replace />} />
      <Route path="/clients" element={<ClientListPage />} />
      <Route path="/clients/:id/summary" element={<ClientSummaryPage />} />
      <Route path="/clients/:id/upload" element={<UploadPage />} />
      // ... 以下全ルート
    </Routes>
  );
}
```

## タスク 5-4: web/main.tsx の更新

エントリポイントを簡素化:
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

★ フェーズ5完了後、`npm run dev` でフロントエンドが正常表示されることを確認。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# フェーズ 6: web/shared/ の作成（共通UI・APIクライアント）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## タスク 6-1: web/shared/components/ui/ の作成

### 移動元:
- src/client/components/ui/Modal.tsx → web/shared/components/ui/Modal.tsx
- src/client/components/ui/ComboBox.tsx → web/shared/components/ui/ComboBox.tsx（既に分離済み）
- CompoundJournalTable.tsx → web/shared/components/journal/CompoundJournalTable.tsx

## タスク 6-2: web/shared/lib/api/ の作成（api.ts の分割）

### 移動元: src/client/lib/api.ts（586行の単一ファイル）

現在の api.ts を機能別に分割:

#### web/shared/lib/api/base.api.ts
handleResponse ヘルパー関数。

#### web/shared/lib/api/clients.api.ts
clientsApi オブジェクト。

#### web/shared/lib/api/journals.api.ts
journalEntriesApi オブジェクト。

#### web/shared/lib/api/rules.api.ts
rulesApi オブジェクト。

#### web/shared/lib/api/documents.api.ts
documentsApi オブジェクト。

#### web/shared/lib/api/suppliers.api.ts
suppliersApi + clientAccountRatiosApi + clientTaxCategorySettingsApi。

#### web/shared/lib/api/master.api.ts
accountItemsApi + taxCategoriesApi + industriesApi。

#### web/shared/lib/api/workflows.api.ts
workflowsApi オブジェクト。

#### web/shared/lib/api/users.api.ts
usersApi オブジェクト。

#### web/shared/lib/api/notifications.api.ts
notificationsApi オブジェクト。

#### web/shared/lib/api/index.ts
全APIを再エクスポート:
```typescript
export { clientsApi } from './clients.api';
export { journalEntriesApi } from './journals.api';
// ... 以下全て
```

#### web/shared/lib/supabase.ts
### 移動元: adapters/supabase/supabase.client.ts を re-export
フロント用の薄いラッパー。

## タスク 6-3: web/shared/hooks/ の作成

#### web/shared/hooks/useAuth.ts
```typescript
export { useAuth } from '@/web/app/providers/AuthProvider';
```

#### web/shared/hooks/useMasterData.ts
```typescript
export { useMasterData } from '@/web/app/providers/MasterDataProvider';
```

## タスク 6-4: web/shared/utils/format.ts の作成

各ページに散在しているフォーマッター関数を集約:
```typescript
export function formatDate(d: string | null): string { ... }
export function formatDateTime(d: string | null): string { ... }
export function formatCurrency(n: number): string { ... }
export function formatSalesLabel(value: string): string { ... }
```

★ フェーズ6完了後、`npm run dev` で全ページが正常表示されることを確認。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# フェーズ 7: web/features/ の作成（ページの移行）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 最も量が多いフェーズ。各ページを features/ 配下に移動する。
# 1 feature ずつ移行し、都度ビルド確認する。

## タスク 7-1: features/auth/ の作成
### 移動: login.tsx → web/features/auth/pages/LoginPage.tsx

## タスク 7-2: features/clients/ の作成
### 移動:
- clients.tsx → web/features/clients/pages/ClientListPage.tsx
- summary.tsx → web/features/clients/pages/ClientSummaryPage.tsx

clients.tsx（852行）から以下を分離:
- ClientCard.tsx: 顧客カードコンポーネント
- ClientForm.tsx: 追加・編集フォーム
- BulkImportForm.tsx: 一括登録フォーム
- useClients.ts: データ取得ロジック

## タスク 7-3: features/workflow/ の作成（最大のタスク）
### 移動:
- upload.tsx → web/features/workflow/pages/UploadPage.tsx
- uploadOnly.tsx → web/features/workflow/pages/UploadOnlyPage.tsx
- ocr.tsx → web/features/workflow/pages/OCRPage.tsx
- export.tsx → web/features/workflow/pages/ExportPage.tsx
- WorkflowHeader.tsx → web/features/workflow/components/WorkflowHeader.tsx
- workflowStorage.ts → web/features/workflow/hooks/useWorkflowStorage.ts

### review.tsx の分割（最重要）:
review.tsx（1,832行）を以下に分割:

#### web/features/workflow/pages/ReviewPage/ReviewPage.tsx
メインのコーディネーター。目標: 300行以下。
各サブコンポーネントを組み合わせるだけ。

#### web/features/workflow/pages/ReviewPage/EntryCard.tsx
個別仕訳の表示・編集カード。
EntryRow, LineRow 型定義を含む。

#### web/features/workflow/pages/ReviewPage/ImageViewer.tsx
証憑画像のズーム・回転・ページ送り機能。

#### web/features/workflow/pages/ReviewPage/LineEditor.tsx
明細行の勘定科目・税区分・金額の編集UI。
ComboBox を使用。

#### web/features/workflow/pages/ReviewPage/MultiEntryPanel.tsx
通帳・クレカ明細等の複数取引表示。

#### web/features/workflow/pages/ReviewPage/useReviewData.ts
仕訳データの取得、OCRデータの取得、マスタとの結合を行うカスタムフック。
ReviewPage.tsx からデータ取得ロジックを完全に分離。

ExportPage.tsx 内の CSV 生成関数（buildSimpleCsv, buildFreeeCsv）は
modules/export/ に既に移動済みなので、そちらを import する。

## タスク 7-4: features/rules/ の作成
### 移動:
- rules/index.tsx → web/features/rules/pages/RulesIndexPage.tsx
- rules/IndustryDetail.tsx → web/features/rules/pages/IndustryDetailPage.tsx
- rules/ClientList.tsx → web/features/rules/pages/ClientListPage.tsx
- rules/ClientDetail.tsx → web/features/rules/pages/ClientDetailPage.tsx

index.tsx 内の RuleRow コンポーネントを分離:
- web/features/rules/components/RuleRow.tsx
- web/features/rules/components/RuleForm.tsx

## タスク 7-5: features/master/ の作成
### 移動:
- accounts.tsx → web/features/master/pages/AccountsPage.tsx
- taxCategories.tsx → web/features/master/pages/TaxCategoriesPage.tsx
- industries.tsx → web/features/master/pages/IndustriesPage.tsx
- suppliers.tsx → web/features/master/pages/SuppliersPage.tsx
- items.tsx → web/features/master/pages/ItemsPage.tsx

## タスク 7-6: features/approvals/ の作成
### 移動: approvals.tsx → web/features/approvals/pages/ApprovalsPage.tsx

## タスク 7-7: features/excluded/ の作成
### 移動:
- excluded.tsx → web/features/excluded/pages/ExcludedPage.tsx
- excludedHistory.tsx → web/features/excluded/pages/ExcludedHistoryPage.tsx

## タスク 7-8: features/settings/ の作成
### 移動: settings.tsx → web/features/settings/pages/SettingsPage.tsx

★ フェーズ7は1 feature ずつ移行し、都度 `npm run dev` で確認すること。
★ 全 feature 移行後、`npm run build` でエラーが出ないことを確認。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# フェーズ 8: クリーンアップ（旧ファイル削除）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## タスク 8-1: 旧ファイルの削除

以下の旧ファイルを削除:
- src/server/index.ts（→ api/server.ts に移行済み）
- src/server/services.ts（→ modules/ に分割済み）
- src/server/services/index.ts（→ modules/ に移行済み）
- src/server/services/*.ts（→ modules/ に移行済み）
- src/server/utils/normalize.ts（→ adapters/gemini/ に移行済み）
- src/client/main.tsx（→ web/main.tsx に移行済み）
- src/client/lib/api.ts（→ web/shared/lib/api/ に分割済み）
- src/client/lib/supabase.ts（→ adapters/supabase/ に移行済み）
- src/client/lib/workflowStorage.ts（→ web/features/workflow/hooks/ に移行済み）
- src/client/components/ 配下全て（→ web/ 配下に移行済み）
- src/client/context/ 配下全て（→ web/app/providers/ に移行済み）
- src/client/pages/ 配下全て（→ web/features/ に移行済み）
- src/client/lib/mockApi.ts（本番不要。必要なら web/shared/lib/mock/ に移動）
- src/client/data/mockData.json（本番不要）
- src/types/index.ts（→ shared/types/ に移行済み。互換 re-export が不要になったら削除）

## タスク 8-2: import パスの最終確認

全 .ts/.tsx ファイルで:
- `@/client/` → `@/web/` に変更されていること
- `@/server/` → `@/core/`, `@/modules/`, `@/adapters/`, `@/api/` に変更されていること
- `../../` 等の相対パスが残っていないことを確認

```bash
# 旧パスが残っていないかチェック
grep -r "@/client/" src/ --include="*.ts" --include="*.tsx"
grep -r "@/server/" src/ --include="*.ts" --include="*.tsx"
grep -r "from '\.\." src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

## タスク 8-3: ビルドスクリプトの更新

package.json:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "build:server": "tsc --project tsconfig.server.json",
  "build:all": "npm run build && npm run build:server",
  "start": "node dist/api/server.js",
  "test": "vitest run"
}
```

start コマンドのパスが `dist/api/server.js` に変わることに注意。

render.yaml の startCommand も更新:
```yaml
startCommand: node dist/api/server.js
```

★ フェーズ8完了後、以下を全て確認:
  1. `npm run build:all` がエラーなし
  2. `npm run start` でサーバー起動
  3. `npm run dev` でフロントエンド正常表示
  4. ログイン → 顧客一覧 → ワークフロー開始 → アップロード → OCR → 仕訳確認 の動線確認


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 完了後のファイル数・行数の目安
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# core/         : 10ファイル × 30〜80行 = 約500行
# modules/      : 25ファイル × 50〜200行 = 約2,500行
# adapters/     : 7ファイル × 30〜100行 = 約400行
# api/          : 10ファイル × 20〜60行 = 約400行
# web/app/      : 7ファイル × 50〜200行 = 約700行
# web/features/ : 35ファイル × 100〜400行 = 約7,000行
# web/shared/   : 20ファイル × 30〜150行 = 約2,000行
# shared/       : 5ファイル × 20〜80行 = 約200行
# db/           : 3ファイル（SQL、行数不定）
#
# 合計: 約120ファイル × 約110行/ファイル = 約13,700行
# （現状: 34ファイル × 約460行/ファイル = 15,631行）
#
# ファイル数は約3.5倍に増えるが、1ファイルの平均行数は1/4に減る。
# 最大ファイル（review.tsx 1,832行）は300行以下になる。
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 実行の推奨順序
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# フェーズ 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
# この順番は依存関係に基づいている。スキップ不可。
#
# 1フェーズ = 1〜2時間が目安。
# 全体で10〜16時間の作業量。
# 1日2フェーズのペースなら4〜5日で完了。