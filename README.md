# 仕訳くん — 仕訳自動化システム

> 確定申告の仕訳入力工数を90%削減する、AI 搭載の会計自動化ツール。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React 19 + TypeScript + Vite + Tailwind CSS |
| バックエンド | Express (Node.js) + TypeScript |
| データベース | Supabase (PostgreSQL + Auth + Storage) |
| AI/OCR | Google Gemini API (証憑分類 + データ抽出 + 仕訳生成) |
| 外部連携 | freee 会計 API (OAuth2 + 取引登録) |

## 主要機能

1. **証憑アップロード** — D&D で領収書・請求書・通帳画像をアップロード
2. **OCR 処理** — Gemini AI で63種の書類を自動分類し、金額・日付・取引先を抽出
3. **仕訳自動生成** — ルールエンジン + AI で勘定科目・税区分を自動判定
4. **仕訳レビュー** — 書類種別ごとに最適化されたUI で確認・修正
5. **仕訳出力** — 仕訳くん 独自 CSV / freee 取込 CSV / freee API 直接連携
6. **マスタ管理** — 勘定科目・税区分・業種・取引先・品目・仕訳ルール
7. **承認ワークフロー** — ロールベース認可 (admin/manager/operator/viewer)

## ディレクトリ構造

```
src/
├── adapters/     外部サービス接続 (Supabase, Gemini, freee)
├── api/          REST API (Express ルート + ミドルウェア + CRUD)
├── core/         ビジネスロジック (会計計算, ルールマッチング, バリデーション)
├── modules/      機能モジュール (OCR, 仕訳生成, エクスポート, ルールエンジン)
├── server/       サーバーエントリーポイント
├── shared/       BE/FE 共有 (型定義, 定数, ユーティリティ)
├── web/          フロントエンド SPA
│   ├── app/      App, ルーティング, レイアウト, プロバイダー
│   ├── features/ 機能別モジュール (clients, workflow, master, settings, etc.)
│   └── shared/   共有コンポーネント, hooks, 定数, API クライアント
└── db/           SQL スキーマ + シードデータ
```

詳細は [FILE_MAP.md](./FILE_MAP.md) を参照。

## 開発

```bash
# 依存インストール
npm install

# フロントエンド開発サーバー
npm run dev

# バックエンドサーバー
npm run server

# TypeScript 型チェック
npx tsc --noEmit
```

## 環境変数

| 変数名 | 用途 |
|--------|------|
| `VITE_SUPABASE_URL` | Supabase プロジェクト URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase 匿名キー |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase サービスロールキー (サーバー用) |
| `GEMINI_API_KEY` | Google Gemini API キー |
| `FREEE_CLIENT_ID` | freee OAuth クライアント ID |
| `FREEE_CLIENT_SECRET` | freee OAuth クライアントシークレット |
| `FREEE_REDIRECT_URI` | freee OAuth リダイレクト URI |
| `ENCRYPTION_KEY` | トークン暗号化キー (AES-256-GCM, 省略時は平文) |

## ドキュメント

| ファイル | 内容 |
|---------|------|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | アーキテクチャガイド（全体マップ・データフロー・設計原則・デプロイ） |
| [docs/SHIWAKE.md](./docs/SHIWAKE.md) | 仕訳処理の詳細仕様（書類分岐フロー・レイアウト構成・OCR抽出フィールド・DB格納情報） |
| [docs/FILE_MAP.md](./docs/FILE_MAP.md) | 全226ファイルの役割一覧 + アーキテクチャ図 |
| [docs/TASKS.md](./docs/TASKS.md) | リファクタリング計画・進捗管理 (BE 13バッチ + FE 15バッチ) |
