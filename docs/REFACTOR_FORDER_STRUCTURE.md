# バックエンド ドメイン再編タスク

> REFACTOR-folder-structure.md と REFACTOR-code-quality.md の内容を統合・置換する。  
> 目的：「技術的な基準（CRUD/route/module/core）」でのフォルダ分けから  
>       「ドメインの単位（仕訳/証憑/マスタ/...）」でのフォルダ分けに移行する。  
> 前提：APIのURLパスは変更しない。ファイル配置だけの変更。

---

## 現状の問題（なぜドメイン再編が必要か）

### routes/ の問題
- `crud/` フォルダ（15ファイル）と `routes/` 直下（7ファイル）が技術基準で分離されている
- 「仕訳の承認処理はどこ？」→ `crud/journal-entries.crud.ts` にある（routeではない）
- 「仕訳のAI生成はどこ？」→ `routes/journals.route.ts` にある（crudではない）
- 同じドメインのコードが2箇所に分散し、探すのに毎回2箇所見る必要がある

### modules/ の問題
- `modules/document/` に supplier-matcher.ts がある（取引先マッチングは「証憑」のドメインか？）
- `modules/identity/` は型定義だけ（マルチテナント廃止で存在意義がない）
- `modules/journal/` と `modules/rule-engine/` は密結合だが別フォルダ
  （journals.route.ts が両方を呼び出して390行になっている原因）

### core/ の問題
- `core/matching/` はルールエンジン専用だが名前が汎用的すぎる
- `core/validation/` と `server/services/validation.service.ts` で同じ種類のロジックが分散

### server/services/ の問題
- `validation.service.ts` に4つの無関係な責務が混在（前回の指摘 #1）
- `freee.service.ts` が server/services/ にあるが、adapters/freee/ とも modules/export/ とも関係する

---

## 再編後のバックエンド構成

```
src/
├── adapters/                              ← 変更なし（外部サービス接続）
│   ├── freee/
│   │   ├── freee.api-client.ts
│   │   └── freee.oauth.ts
│   ├── gemini/
│   │   ├── gemini.client.ts
│   │   └── gemini.config.ts
│   └── supabase/
│       ├── supabase-admin.client.ts       ← サーバー用のみ残す
│       └── supabase.debug.ts
│
├── api/                                   ← ドメインごとに再編
│   ├── middleware/                         ← 変更なし
│   │   ├── auth.middleware.ts
│   │   ├── error-handler.middleware.ts
│   │   ├── logging.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   ├── rbac.middleware.ts
│   │   └── validate.middleware.ts
│   │
│   ├── helpers/                           ← 大幅縮小
│   │   ├── async-handler.ts              ← 変更なし
│   │   └── pagination.ts                 ← 変更なし
│   │   # master-data.ts は解体（後述）
│   │
│   └── routes/                            ★ ドメイン再編の主戦場
│       ├── journal/                       仕訳ドメイン
│       │   ├── journal.crud.ts            GET/POST/PUT/DELETE（基本CRUD）
│       │   ├── journal-lines.crud.ts      明細行の個別更新
│       │   ├── journal.operations.ts      status変更/bulk-status/approve/excluded取得
│       │   ├── journal.generate.ts        AI仕訳生成（現journals.route.ts → 薄いルートに）
│       │   └── journal-corrections.crud.ts 修正履歴CRUD + mark-suggested
│       │
│       ├── document/                      証憑ドメイン
│       │   ├── document.crud.ts           GET/POST/PUT/DELETE（基本CRUD）
│       │   ├── document.upload.ts         multerアップロード（現documents.route.ts）
│       │   ├── document.ocr.ts            OCR処理（現ocr.route.ts → 薄いルートに）
│       │   ├── document.batch.ts          一括処理（現batch.route.ts）
│       │   └── document.storage.ts        署名付きURL/ファイル操作（現storage.crud.ts）
│       │
│       ├── master/                        マスタデータドメイン
│       │   ├── account-items.crud.ts      勘定科目 CRUD
│       │   ├── account-categories.crud.ts 勘定科目カテゴリ GET（account-items.crudから分離）
│       │   ├── tax-categories.crud.ts     税区分 CRUD
│       │   ├── industries.crud.ts         業種 CRUD
│       │   ├── suppliers.crud.ts          取引先 CRUD + /suppliers/:id/aliases（サブリソース）
│       │   ├── supplier-aliases.crud.ts   /supplier-aliases の独立エンドポイント（分離）
│       │   ├── items.crud.ts              品目 CRUD + /items/:id/aliases（サブリソース）
│       │   ├── item-aliases.crud.ts       /item-aliases の独立エンドポイント（分離）
│       │   └── rules.crud.ts             仕訳ルール CRUD
│       │
│       ├── client/                        顧客ドメイン
│       │   ├── client.crud.ts             顧客 CRUD
│       │   ├── client-ratios.crud.ts      家事按分率 CRUD
│       │   └── workflow.crud.ts           ワークフロー CRUD + complete/cancel
│       │
│       ├── user/                          ユーザードメイン
│       │   ├── users.crud.ts              ユーザー CRUD
│       │   └── notifications.crud.ts      通知 CRUD + read/read-all/unread-count
│       │
│       ├── export/                        エクスポートドメイン
│       │   └── freee.ts                   freee連携（OAuth + API + CSV）
│       │
│       └── system/                        システム
│           ├── health.ts                  ヘルスチェック
│           └── validation.ts              バリデーションエンドポイント
│
├── domain/                                ★ core/ + modules/ を統合再編
│   │
│   ├── journal/                           仕訳ドメイン（modules/journal/ + 関連ロジック統合）
│   │   ├── journal.types.ts              型定義
│   │   ├── ai-generator.prompt.ts        AI仕訳生成プロンプト
│   │   ├── ai-generator.service.ts       AI仕訳生成サービス
│   │   ├── journal-pipeline.service.ts   ★新規: 仕訳生成パイプライン統合サービス
│   │   │                                  （ルールマッチ → AI → UUIDマッピング → バランスチェック）
│   │   ├── line-mapper.service.ts        仕訳明細行マッピング
│   │   ├── rule-generator.service.ts     修正パターンからルール自動生成
│   │   └── approval.service.ts           ★新規: 承認処理サービス（将来の申請制のベース）
│   │   # generator.strategy.ts は journal-pipeline.service.ts に統合して削除
│   │
│   ├── document/                          証憑ドメイン
│   │   ├── document.types.ts             型定義（ClassificationResult等を集約）
│   │   ├── duplicate-checker.ts          重複チェック（ハッシュ + 内容ベース）
│   │   └── supplier-matcher.ts           取引先自動マッチング
│   │
│   ├── ocr/                               OCRドメイン
│   │   ├── ocr.types.ts                  OCR関連型定義（★ tax_payment_type 追加必要）
│   │   ├── classifier.prompt.ts          書類分類プロンプト（63コード）
│   │   ├── classifier.service.ts         書類分類サービス
│   │   ├── extractor.prompt.ts           データ抽出プロンプト
│   │   ├── extractor.service.ts          データ抽出サービス
│   │   ├── multi-extractor.prompt.ts     明細分割プロンプト
│   │   ├── multi-extractor.service.ts    明細分割サービス
│   │   └── ocr-pipeline.service.ts       ★新規: OCRパイプライン統合サービス
│   │                                      （画像取得 → classify → extract → 重複チェック）
│   │
│   ├── rule-engine/                       ルールエンジンドメイン
│   │   ├── rule-engine.types.ts          型定義
│   │   ├── matcher.service.ts            ルールマッチング
│   │   ├── matcher-with-candidates.ts    候補付きマッチング
│   │   ├── conflict-detector.ts          ルール競合検出
│   │   └── rule-name-generator.ts        ルール名自動生成
│   │
│   ├── export/                            エクスポートドメイン
│   │   ├── freee-csv.builder.ts          freee CSV ビルダー
│   │   ├── freee.service.ts              freee API連携サービス（server/services/から移動）
│   │   └── simple-csv.builder.ts         独自CSV ビルダー
│   │
│   ├── accounting/                        会計計算ドメイン（core/accounting/ から移動）
│   │   ├── double-entry.ts               複式簿記バランスチェック
│   │   ├── household-ratio.ts            家事按分計算
│   │   ├── rounding.ts                   消費税四捨五入 + 源泉税切捨
│   │   ├── tax-calculation.ts            消費税計算
│   │   ├── withholding-tax.ts            源泉徴収税計算
│   │   ├── balance-validator.ts          ★新規: 貸借バランスチェック
│   │   │                                  （validation.service.tsから移動）
│   │   ├── amount-validator.ts           金額バリデーション（core/validation/から移動）
│   │   └── date-validator.ts             日付バリデーション（core/validation/から移動）
│   │
│   ├── master/                            マスタデータドメイン
│   │   └── master-data.service.ts        ★新規: マスタデータ取得サービス
│   │                                      （master-data.tsから移動: getOrganizationId,
│   │                                       fetchAccountItems, fetchTaxCategories,
│   │                                       findFallbackAccountId）
│   │
│   ├── notification/                      通知ドメイン
│   │   └── notification.service.ts       ★新規: 通知作成サービス
│   │                                      （master-data.tsのcreateNotificationから移動）
│   │
│   └── auth/                              認証・認可ドメイン
│       ├── role.types.ts                 ロール・権限定義（modules/identity/から移動）
│       └── authorization.service.ts      ★新規: 認可サービス
│                                          （verifyClientOwnership等をここに集約）
│
├── shared/                                ← 変更あり
│   ├── constants/
│   │   └── accounting.ts
│   ├── errors/
│   │   └── app-errors.ts
│   ├── types/
│   │   ├── index.ts
│   │   ├── models.ts
│   │   └── enums.ts
│   └── utils/
│       ├── csv-escape.ts
│       ├── encryption.ts
│       ├── normalize-japanese.ts
│       ├── request-helpers.ts            ★新規: isValidUUID, sanitizeBody, isValidStoragePath,
│       │                                  safeErrorMessage（master-data.tsから移動）
│       └── __tests__/
│           └── normalizeJapanese.test.ts
│
├── server/                                ← 大幅縮小
│   └── index.ts                           Express起動のみ（services/ は解体）
│
└── db/
    ├── schema.sql
    └── migration-*.sql
```

---

## 変更の詳細

### Phase 1: routes/ のドメイン再編（最優先）

#### 1-1. crud/ フォルダの廃止 → ドメインフォルダに再配置

```bash
# 現在のcrud/フォルダの中身と移動先
src/api/routes/crud/account-items.crud.ts    → src/api/routes/master/account-items.crud.ts
src/api/routes/crud/client-ratios.crud.ts    → src/api/routes/client/client-ratios.crud.ts
src/api/routes/crud/clients.crud.ts          → src/api/routes/client/client.crud.ts
src/api/routes/crud/documents.crud.ts        → src/api/routes/document/document.crud.ts
src/api/routes/crud/industries.crud.ts       → src/api/routes/master/industries.crud.ts
src/api/routes/crud/items.crud.ts            → src/api/routes/master/items.crud.ts
src/api/routes/crud/journal-corrections.crud.ts → src/api/routes/journal/journal-corrections.crud.ts
src/api/routes/crud/journal-entries.crud.ts  → 分割（後述）
src/api/routes/crud/notifications.crud.ts    → src/api/routes/user/notifications.crud.ts
src/api/routes/crud/rules.crud.ts            → src/api/routes/master/rules.crud.ts
src/api/routes/crud/storage.crud.ts          → src/api/routes/document/document.storage.ts
src/api/routes/crud/suppliers.crud.ts        → 分割（後述）
src/api/routes/crud/tax-categories.crud.ts   → src/api/routes/master/tax-categories.crud.ts
src/api/routes/crud/users.crud.ts            → src/api/routes/user/users.crud.ts
src/api/routes/crud/workflows.crud.ts        → src/api/routes/client/workflow.crud.ts
```

#### 1-2. journal-entries.crud.ts の分割

```bash
# 基本CRUD（GET/POST/PUT/DELETE）
→ src/api/routes/journal/journal.crud.ts

# 明細行の個別更新（PUT /journal-entry-lines/:id）
→ src/api/routes/journal/journal-lines.crud.ts

# ビジネスオペレーション（status変更/bulk-status/approve）
→ src/api/routes/journal/journal.operations.ts
```

journal-corrections.crud.ts 内の `GET /excluded-entries` も
journal.operations.ts に移動する（除外仕訳の取得は「修正履歴のCRUD」ではない）。

#### 1-3. suppliers.crud.ts の分割

```bash
# 取引先 CRUD + /suppliers/:id/aliases（サブリソース）
→ src/api/routes/master/suppliers.crud.ts（そのまま残す部分）

# /supplier-aliases の独立エンドポイント（GET/PUT/DELETE）
→ src/api/routes/master/supplier-aliases.crud.ts（分離）
```

items.crud.ts も同様に `/item-aliases` を分離。

#### 1-4. account-items.crud.ts から account-categories を分離

```bash
# GET /account-categories
→ src/api/routes/master/account-categories.crud.ts（新規）
```

#### 1-5. routes/ 直下のルートファイルをドメインフォルダに移動

```bash
src/api/routes/journals.route.ts     → src/api/routes/journal/journal.generate.ts
src/api/routes/ocr.route.ts          → src/api/routes/document/document.ocr.ts
src/api/routes/batch.route.ts        → src/api/routes/document/document.batch.ts
src/api/routes/documents.route.ts    → src/api/routes/document/document.upload.ts
src/api/routes/freee.route.ts        → src/api/routes/export/freee.ts
src/api/routes/health.route.ts       → src/api/routes/system/health.ts
src/api/routes/validation.route.ts   → src/api/routes/system/validation.ts
```

#### 1-6. server.ts のルート登録を更新

各ドメインフォルダに `index.ts`（バレルファイル）を作成し、
server.ts からはドメイン単位でマウントする:

```typescript
// src/server/index.ts
import journalRoutes from '../api/routes/journal/index.js';
import documentRoutes from '../api/routes/document/index.js';
import masterRoutes from '../api/routes/master/index.js';
import clientRoutes from '../api/routes/client/index.js';
import userRoutes from '../api/routes/user/index.js';
import exportRoutes from '../api/routes/export/index.js';
import systemRoutes from '../api/routes/system/index.js';

app.use('/api', journalRoutes);
app.use('/api', documentRoutes);
app.use('/api', masterRoutes);
app.use('/api', clientRoutes);
app.use('/api', userRoutes);
app.use('/api', exportRoutes);
app.use('/api', systemRoutes);
```

各 `index.ts` の例（`src/api/routes/journal/index.ts`）:
```typescript
import { Router } from 'express';
import journalCrud from './journal.crud.js';
import journalLinesCrud from './journal-lines.crud.js';
import journalOps from './journal.operations.js';
import journalGenerate from './journal.generate.js';
import journalCorrections from './journal-corrections.crud.js';

const router = Router();
router.use(journalCrud);
router.use(journalLinesCrud);
router.use(journalOps);
router.use(journalGenerate);
router.use(journalCorrections);
export default router;
```

---

### Phase 2: core/ + modules/ → domain/ への統合

#### 2-1. なぜ「domain/」か

現在の構成:
- `core/` = フレームワーク非依存の純粋ロジック
- `modules/` = DB/APIに依存する機能モジュール

この分離は教科書的には正しいが、実際の開発では:
- 「仕訳の税計算ロジックはどこ？」→ `core/accounting/tax-calculation.ts`
- 「仕訳のAI生成はどこ？」→ `modules/journal/ai-generator.service.ts`
- 「仕訳のルールマッチングはどこ？」→ `core/matching/` + `modules/rule-engine/`
- 同じ「仕訳」の文脈なのに3箇所に分散している

`domain/` に統合すれば「仕訳のことは全部 `domain/journal/`」で済む。

#### 2-2. 統合ルール

- `core/accounting/` の純粋関数 → `domain/accounting/` にそのまま移動
  （ドメイン名は「accounting」のまま。journal/ に入れると純粋関数の意味が薄れる）
- `core/matching/` → `domain/rule-engine/` に統合
  （condition-evaluator.ts と priority-resolver.ts は
   ルールエンジン専用なので rule-engine/ に属する）
- `core/validation/` → `domain/accounting/` に統合
  （amount-validator と date-validator は会計ドメインのバリデーション）
- `modules/identity/` → `domain/auth/` に移動（role.types.ts のみ。tenant.types.ts は削除）
- `modules/export/` → `domain/export/` にそのまま移動 + freee.service.ts を統合
- `server/services/validation.service.ts` → 解体して各ドメインに分散:
  - checkDocumentDuplicate, checkReceiptDuplicate → `domain/document/duplicate-checker.ts` に統合
  - findSupplierAliasMatch → `domain/document/supplier-matcher.ts` に統合
  - validateDebitCreditBalance, validateJournalBalance → `domain/accounting/balance-validator.ts`（新規）
- `server/services/freee.service.ts` → `domain/export/freee.service.ts` に移動

#### 2-3. 新規作成するサービス

**domain/journal/journal-pipeline.service.ts**
journals.route.ts の390行のロジックをここに移動:
```typescript
export async function processJournalGeneration(params: {
  document_id: string;
  client_id: string;
  ocr_result: any;
  industry?: string;
  organization_id: string;
}): Promise<JournalGenerationResult> {
  // 1. マスタデータ取得
  // 2. 明細分割判定
  // 3. ルールマッチング or AI生成
  // 4. UUIDマッピング
  // 5. バランスチェック
  // 6. 取引先名寄せ
}
```

**domain/ocr/ocr-pipeline.service.ts**
ocr.route.ts の150行のロジックをここに移動:
```typescript
export async function processDocumentOCR(params: {
  document_id: string;
  file_url: string;
}): Promise<OCRPipelineResult> {
  // 1. 画像取得
  // 2. classify
  // 3. 非仕訳対象判定
  // 4. extract
  // 5. 重複チェック
}
```

**domain/journal/approval.service.ts**
journal-entries.crud.ts の承認処理をここに移動:
```typescript
export async function approveJournalEntry(
  entryId: string, approverId: string, params: { ... }
): Promise<ApprovalResult> {
  // 1. journal_entry_approvals にINSERT
  // 2. journal_entries.status を更新
}
```

**domain/notification/notification.service.ts**
master-data.ts の createNotification をここに移動。

**domain/master/master-data.service.ts**
master-data.ts の getOrganizationId, fetchAccountItems, fetchTaxCategories,
findFallbackAccountId をここに移動。

**domain/auth/authorization.service.ts**
master-data.ts の verifyClientOwnership をここに移動。

---

### Phase 3: master-data.ts の解体 + shared/ の整理

#### 3-1. master-data.ts の分配先

| 関数 | 移動先 |
|------|--------|
| `isValidUUID` | `src/shared/utils/request-helpers.ts` |
| `sanitizeBody` | `src/shared/utils/request-helpers.ts` |
| `isValidStoragePath` | `src/shared/utils/request-helpers.ts` |
| `safeErrorMessage` | `src/shared/utils/request-helpers.ts` |
| `verifyClientOwnership` | `src/domain/auth/authorization.service.ts` |
| `createNotification` | `src/domain/notification/notification.service.ts` |
| `getOrganizationId` | `src/domain/master/master-data.service.ts` |
| `fetchAccountItems` | `src/domain/master/master-data.service.ts` |
| `fetchTaxCategories` | `src/domain/master/master-data.service.ts` |
| `findFallbackAccountId` | `src/domain/master/master-data.service.ts` |
| `export { supabaseAdmin }` | 削除。各ファイルが adapters/ から直接インポート |

#### 3-2. supabase.client.ts の移動

```bash
src/adapters/supabase/supabase.client.ts → src/web/shared/lib/supabase.ts
```
フロントエンド専用ファイル。adapters/ はバックエンドのレイヤー。

---

### Phase 4: 削除するファイル/フォルダ

```bash
# 完全削除
src/api/routes/crud/                     # フォルダごと削除（中身はドメインフォルダに移動済み）
src/modules/identity/                    # tenant.types.ts 削除、role.types.ts は domain/auth/ に移動
src/modules/journal/generator.strategy.ts # journal-pipeline.service.ts に統合
src/modules/document/document.types.ts   # re-exportだけのファイル
src/server/services/                     # validation.service.ts と freee.service.ts は各domainに移動済み
src/core/                                # 全ファイル domain/ に移動済み
src/modules/                             # 全ファイル domain/ に移動済み
src/api/helpers/master-data.ts           # 解体して各所に分散済み

# 削除確認用コマンド（移動前に参照元がないことを確認）
grep -rn "modules/identity" src/ --include="*.ts"
grep -rn "generator.strategy" src/ --include="*.ts"
grep -rn "document.types" src/ --include="*.ts"
grep -rn "server/services" src/ --include="*.ts"
grep -rn "core/matching" src/ --include="*.ts"
grep -rn "core/validation" src/ --include="*.ts"
grep -rn "core/accounting" src/ --include="*.ts"
grep -rn "helpers/master-data" src/ --include="*.ts"
```

---

## セキュリティ修正（ドメイン再編と同時にやるべき）

以下は配置に関係なく修正が必要:

### GET /journal-entries/:id の org_id チェック漏れ
```typescript
// journal.crud.ts に移動後、以下を追加
const orgId = (req as AuthenticatedRequest).user.organization_id;
query = query.eq('organization_id', orgId);
```

### GET /documents/:id の org_id チェック漏れ
同上。

### GET /workflows/:id の org_id チェック漏れ
同上。

### PUT /journal-entries/bulk-status の org_id チェック漏れ
```typescript
// 任意のIDリストのステータスを変更できてしまう
// → organization_id フィルタを追加
.eq('organization_id', orgId)
```

### GET /supplier-aliases の org_id フィルタ追加
supplier_aliases テーブルに organization_id がないため、
suppliers テーブルと JOIN してフィルタする必要がある。

---

## ocr.types.ts の型更新（前回の議論の残タスク）

domain/ 再編とは独立して先にやれる:

```typescript
// OCRTransaction に追加
tax_payment_type: 'income_tax' | 'consumption_tax' | 'resident_tax' | 'property_tax'
  | 'auto_tax' | 'national_health_insurance' | 'national_pension'
  | 'business_tax' | 'other_tax' | null;

// transaction_type に 'tax_payment' を追加
transaction_type: 'purchase' | 'expense' | 'asset' | 'sales' | 'fee' | 'tax_payment' | null;

// OCRResult に追加
extracted_tax_payment_type: string | null;

// OCRResult.document_type を string に拡張（extractor_prompt.ts の返却値が増えたため）
document_type: string;
```

---

## 実行順序

| 順序 | タスク | 工数目安 | 備考 |
|------|--------|---------|------|
| 0 | ocr.types.ts の型更新 | 0.5h | 前回の議論の残タスク。先にやれる |
| 1 | routes/ ドメインフォルダ作成 + ファイル移動 | 2h | Phase 1-1〜1-5。mv + インポートパス更新 |
| 2 | journal-entries.crud.ts / suppliers.crud.ts の分割 | 1.5h | Phase 1-2〜1-4 |
| 3 | 各ドメインの index.ts 作成 + server.ts 更新 | 1h | Phase 1-6 |
| 4 | セキュリティ修正（org_idチェック漏れ） | 1h | routes/ 移動と同時にやる |
| 5 | domain/ フォルダ作成 + core/ modules/ 移動 | 2h | Phase 2-1〜2-2 |
| 6 | パイプラインサービス新規作成 | 3h | Phase 2-3。最も工数が大きい |
| 7 | master-data.ts 解体 | 2h | Phase 3。影響範囲が広い |
| 8 | 削除・クリーンアップ | 1h | Phase 4 |

**合計: 約14h**

**注意:** Phase 1（routes/ の再編）だけでも十分に価値がある。
Phase 2（domain/ 統合）は Phase A 完成後でもよい。
無理に一度にやらず、Phase 1 → 動作確認 → Phase 2 → 動作確認 の順で進めること。