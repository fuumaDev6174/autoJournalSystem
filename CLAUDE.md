# プロジェクト: 仕訳くん (BPO向け統合税務ルーター)

## 技術スタック
- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Language: TypeScript (厳格な型定義を優先)
- DB/Auth: Supabase (PostgreSQL + Storage + Auth)
- AI: Google Gemini (Flash = OCR, Pro = 仕訳生成)
- 将来: CRM (FastAPI) との統合予定あり

## 開発のコンテキスト
このシステムは、颯馬の税理士事務所と提携する株式会社XのBPOスタッフが、
個人事業主から届いた書類をScanSnapでスキャンし、仕訳くんに画像を投入して
分類→OCR→仕訳生成→freeeエクスポートまでを半自動で行う社内オペレーションシステム。
SaaSではなく社内システム。マルチテナント不要（組織は1つ固定）。

### OCRパイプライン（3段階）
1. classifier: 画像→63種別の書類分類（Gemini Flash）
2. extractor: 分類結果に基づいてデータ抽出（Gemini Flash）
3. multi-extractor: 通帳・クレカ明細等の複数行を個別取引に分割（Gemini Pro）

### 証憑分類コード体系（63コード + Phase B予約4コード）
- 収入系11 / 経費系14 / 複合仕訳2 / 資産償却2 / 所得控除11 / メタデータ22 / 保管1 / FB1
- Phase B予約: current_account_statement, social_insurance_notice, labor_insurance, import_doc
- コード一覧は src/domain/ocr/classifier.prompt.ts を正とする

### フェーズ
- Phase A: 事業所得の日常記帳（コアMVP）— 16コード
- Phase B: 複合仕訳 + 資産 + 法人対応 — 11コード
- Phase C: 多所得対応（確定申告包括支援）— 8コード
- Phase D: 所得控除 + メタデータ — 34コード

## アーキテクチャ方針

### フォルダ構成
- `src/api/routes/{domain}/` — ドメインごとのルートハンドラ（薄く保つ）
- `src/domain/{domain}/` — ビジネスロジック・サービス・型定義
- `src/adapters/` — 外部サービス接続（Supabase, Gemini, freee）
- `src/shared/` — バックエンド/フロントエンド共有（型定義, ユーティリティ, 定数）
- `src/server/index.ts` — Expressエントリーポイント（ミドルウェア登録のみ）

### ルートハンドラの原則
- route ファイルの責務は「リクエストを受けて、サービスを呼び、レスポンスを返す」だけ
- ビジネスロジックは domain/ のサービスに書く。route に直書きしない
- route ファイルは50行以内を目標にする

### セキュリティ・認可
- 全エンドポイントで `(req as AuthenticatedRequest).user.organization_id` を取得し、
  DBクエリに `.eq('organization_id', orgId)` を必ず付与する
- `sanitizeBody()` で Mass Assignment を防止する（id, created_at, updated_at, organization_id を除去）
- GET /:id エンドポイントでも organization_id チェックを省略しない

### DB操作
- サーバーサイドは `supabaseAdmin`（service_role）を使用。RLSバイパス前提
- フロントエンドは `src/web/shared/lib/supabase.ts` の anon クライアント（認証フローのみ）
- organization_id = NULL のレコードは共通マスタ。クエリは `.or('organization_id.eq.${orgId},organization_id.is.null')`

## AIコーディング・ガイドライン

### 1. 自己文書化コード（Self-documenting code）の最優先
- 「何をしているか（What）」を説明するインラインコメントやJSDocは一切記述しない
- 変数名や関数名を具体的で意図が伝わる名称にし、コードそのもので意図を表現する

### 2. ファイル先頭のドキュメンテーション
- ファイル先頭に、そのファイルの役割・責務、他モジュールとの関係性を簡潔に記述する
- フォーマットはJSDoc形式（`@file` や `@module`）を使用する

### 3. コメントは「なぜ（Why）」に絞る
- コメントを残すのは、コードを読んだだけではわからない背景や理由がある場合のみ
  - 例: 税法の例外処理、パフォーマンス最適化の意図、ハック、Supabase FK の quirk
- 一時的な対応や既知の不具合には `TODO:` / `FIXME:` タグを使用する

### 4. TypeScriptにおけるJSDocの制約
- 外部から呼ばれる主要な関数やクラスの直上にJSDocを記述してよい
- ただし型情報はTypeScriptの型定義に一任する。JSDocの `@param` `@returns` に `{string}` 等の型は書かない
- 引数や戻り値の「意味・目的」のみを記述する