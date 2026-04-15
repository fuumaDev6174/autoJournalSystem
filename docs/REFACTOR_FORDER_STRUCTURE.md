# バックエンド ドメイン再編 — 完了記録

> 「技術的な基準（CRUD/route/module/core）」でのフォルダ分けから
> 「ドメインの単位（仕訳/証憑/マスタ/...）」でのフォルダ分けに移行した。
> APIのURLパスは変更していない。ファイル配置のみの変更。
>
> ステータス: **全Phase完了**

---

## 再編前 → 再編後の対応

### routes/ のドメイン再編

**Before**: `crud/`（15ファイル）と `routes/` 直下（7ファイル）が技術基準で分離

**After**: ドメイン別フォルダ（client / document / journal / master / export / system / user）

```
# 旧 → 新の対応表

src/api/routes/crud/account-items.crud.ts    → src/api/routes/master/account-items.crud.ts
src/api/routes/crud/client-ratios.crud.ts    → src/api/routes/client/client-ratios.crud.ts
src/api/routes/crud/clients.crud.ts          → src/api/routes/client/client.crud.ts
src/api/routes/crud/documents.crud.ts        → src/api/routes/document/document.crud.ts
src/api/routes/crud/industries.crud.ts       → src/api/routes/master/industries.crud.ts
src/api/routes/crud/items.crud.ts            → src/api/routes/master/items.crud.ts
src/api/routes/crud/journal-corrections.crud.ts → src/api/routes/journal/journal-corrections.crud.ts
src/api/routes/crud/journal-entries.crud.ts  → 分割（journal.crud.ts + journal-lines.crud.ts + journal.operations.ts）
src/api/routes/crud/notifications.crud.ts    → src/api/routes/user/notifications.crud.ts
src/api/routes/crud/rules.crud.ts            → src/api/routes/master/rules.crud.ts
src/api/routes/crud/storage.crud.ts          → src/api/routes/document/document.storage.ts
src/api/routes/crud/suppliers.crud.ts        → src/api/routes/master/suppliers.crud.ts
src/api/routes/crud/tax-categories.crud.ts   → src/api/routes/master/tax-categories.crud.ts
src/api/routes/crud/users.crud.ts            → src/api/routes/user/users.crud.ts
src/api/routes/crud/workflows.crud.ts        → src/api/routes/client/workflow.crud.ts

src/api/routes/journals.route.ts     → src/api/routes/journal/journal.generate.ts
src/api/routes/ocr.route.ts          → src/api/routes/document/document.ocr.ts
src/api/routes/batch.route.ts        → src/api/routes/document/document.batch.ts
src/api/routes/documents.route.ts    → src/api/routes/document/document.upload.ts
src/api/routes/freee.route.ts        → src/api/routes/export/freee.ts
src/api/routes/health.route.ts       → src/api/routes/system/health.ts
src/api/routes/validation.route.ts   → src/api/routes/system/validation.ts
```

各ドメインフォルダに `index.ts`（バレルファイル）を配置し、server.ts からドメイン単位でマウント:

```typescript
// src/server/index.ts
app.use('/api', journalRoutes);
app.use('/api', documentRoutes);
app.use('/api', masterRoutes);
app.use('/api', clientRoutes);
app.use('/api', userRoutes);
app.use('/api', exportRoutes);
app.use('/api', systemRoutes);
```

### core/ + modules/ → domain/ への統合

**Before**: `core/`（純粋関数）+ `modules/`（業務モジュール）+ `server/services/`（雑多なサービス）

**After**: `domain/`（ドメイン別に統合）

```
# 旧 → 新の対応表

src/core/accounting/double-entry.ts       → domain/accounting/accounting-utils.ts に統合
src/core/accounting/household-ratio.ts    → domain/accounting/accounting-utils.ts に統合
src/core/accounting/rounding.ts           → domain/accounting/accounting-utils.ts に統合
src/core/accounting/tax-calculation.ts    → domain/accounting/accounting-utils.ts に統合
src/core/accounting/withholding-tax.ts    → domain/accounting/accounting-utils.ts に統合
src/core/validation/amount-validator.ts   → domain/accounting/accounting-utils.ts に統合
src/core/validation/date-validator.ts     → domain/accounting/accounting-utils.ts に統合
src/core/matching/condition-evaluator.ts  → domain/rule-engine/condition-evaluator.ts
src/core/matching/priority-resolver.ts    → domain/rule-engine/priority-resolver.ts

src/modules/ocr/*                         → domain/ocr/*
src/modules/journal/*                     → domain/journal/*
src/modules/rule-engine/*                 → domain/rule-engine/*
src/modules/export/*                      → domain/export/*
src/modules/document/*                    → domain/document/*
src/modules/identity/role.types.ts        → domain/auth/role.types.ts
src/modules/identity/tenant.types.ts      → 削除（マルチテナント廃止）
src/modules/journal/generator.strategy.ts → 削除（journal-pipeline.service.ts に統合）

src/server/services/validation.service.ts → 解体:
  - バランス検証 → domain/accounting/balance-validator.ts
  - 重複チェック → domain/document/duplicate-checker.ts に統合
  - 取引先マッチ → domain/document/supplier-matcher.ts に統合

src/server/services/freee.service.ts      → 削除（domain/export/ に統合）
```

### master-data.ts の解体

**Before**: `api/helpers/master-data.ts` に20+の関数が集中

**After**: ドメインごとに分散

| 関数 | 移動先 |
|------|--------|
| `isValidUUID` | `shared/utils/request-helpers.ts` |
| `sanitizeBody` | `shared/utils/request-helpers.ts` |
| `isValidStoragePath` | `shared/utils/request-helpers.ts` |
| `safeErrorMessage` | `shared/utils/request-helpers.ts` |
| `verifyClientOwnership` 等 | `domain/auth/authorization.service.ts` |
| `createNotification` | `domain/notification/notification.service.ts` |
| `getOrganizationId` | `domain/master/master-data.service.ts` |
| `fetchAccountItems` | `domain/master/master-data.service.ts` |
| `fetchTaxCategories` | `domain/master/master-data.service.ts` |
| `findFallbackAccountId` | `domain/master/master-data.service.ts` |

### supabase.client.ts の移動

```
src/adapters/supabase/supabase.client.ts → src/web/shared/lib/supabase.ts
```

フロントエンド専用ファイルなので、adapters/（バックエンド層）から web/shared/ に移動。

### 新規作成されたサービス

| ファイル | 役割 |
|---------|------|
| `domain/journal/journal-pipeline.service.ts` | 仕訳生成パイプライン統合（旧 journals.route.ts 390行 → ルートは50行に） |
| `domain/ocr/ocr-pipeline.service.ts` | OCRパイプライン統合（旧 ocr.route.ts 150行 → ルートは31行に） |
| `domain/ocr/ocr-parse-utils.ts` | OCR結果のJSONパース・修復ユーティリティ |
| `domain/notification/notification.service.ts` | 通知作成サービス |
| `domain/master/master-data.service.ts` | マスタデータ取得サービス |
| `domain/auth/authorization.service.ts` | 認可サービス（組織所有権検証・IDOR防止） |
| `domain/accounting/balance-validator.ts` | 貸借バランスチェック |

### 削除されたファイル/フォルダ

```
src/api/routes/crud/                     # ドメインフォルダに移動済み
src/api/helpers/master-data.ts           # 解体して各所に分散済み
src/modules/                             # domain/ に移動済み
src/core/                                # domain/ に移動済み
src/server/services/                     # 各domainに移動済み
src/modules/identity/tenant.types.ts     # マルチテナント廃止で不要
src/modules/journal/generator.strategy.ts # pipeline に統合
src/adapters/freee/freee.oauth.ts        # 削除
src/adapters/supabase/supabase.client.ts # web/shared/lib/ に移動
src/shared/constants/accounting.ts       # domain/journal/ に移動
```

---

## 再編後の最終構成

```
src/
├── adapters/                  外部サービス接続
│   ├── freee/
│   │   └── freee.api-client.ts
│   ├── gemini/
│   │   ├── gemini.client.ts
│   │   └── gemini.config.ts
│   └── supabase/
│       └── supabase-admin.client.ts
│
├── api/                       Express ルート定義
│   ├── helpers/
│   │   ├── async-handler.ts
│   │   └── pagination.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── error-handler.middleware.ts
│   │   ├── logging.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   ├── rbac.middleware.ts
│   │   └── validate.middleware.ts
│   └── routes/
│       ├── client/       顧客・按分率・ワークフロー
│       ├── document/     書類CRUD・アップロード・OCR・バッチ・ストレージ
│       ├── journal/      仕訳CRUD・生成・操作・修正履歴・明細行
│       ├── master/       勘定科目・税区分・業種・取引先・品目・ルール
│       ├── export/       freee連携
│       ├── system/       ヘルスチェック・バリデーション
│       └── user/         ユーザー・通知
│
├── domain/                    ビジネスロジック
│   ├── accounting/       会計計算・バランス検証
│   ├── auth/             認可・ロール定義
│   ├── document/         書類型定義・重複チェック・取引先名寄せ
│   ├── export/           CSV生成（freee / 独自）
│   ├── journal/          仕訳パイプライン・AI生成・ルール生成
│   ├── master/           マスタデータサービス
│   ├── notification/     通知サービス
│   ├── ocr/              OCRパイプライン（分類→抽出→明細分割）
│   └── rule-engine/      ルールマッチング・競合検出
│
├── shared/                    サーバー/クライアント共有
│   ├── errors/
│   ├── types/
│   └── utils/
│
├── server/
│   └── index.ts               Express起動のみ
│
└── db/
    ├── schema.sql
    ├── migrations/
    ├── queries/
    ├── seeds/
    └── snapshots/
```
