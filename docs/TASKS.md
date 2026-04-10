# タスク管理

> 未完了タスクのみ記載。完了済みバッチは削除済み。

---

## バックエンド残タスク

### BE-1: master-data.ts re-export ラッパーの解体（優先度：高）

19個のルートファイルが `api/helpers/master-data.ts` の re-export 経由で domain/ にアクセスしている。全ルートファイルを直接 import に書き換え、master-data.ts を削除する。

- [ ] 全ルートファイルの `from '../../helpers/master-data.js'` を以下に分散:
  - `sanitizeBody, isValidUUID, isValidStoragePath, safeErrorMessage` → `shared/utils/request-helpers.js`
  - `verifyClientOwnership, verifyDocumentOwnership, verifyJournalEntryOwnership, verifyWorkflowOwnership` → `domain/auth/authorization.service.js`
  - `createNotification` → `domain/notification/notification.service.js`
  - `getOrganizationId, fetchAccountItems, fetchTaxCategories, findFallbackAccountId` → `domain/master/master-data.service.js`
  - `supabaseAdmin` → `adapters/supabase/supabase-admin.client.js`（直接 import）
- [ ] `src/api/helpers/master-data.ts` を削除

### BE-2: journal.generate.ts のパイプラインサービス抽出（優先度：高）

`journal.generate.ts` が380行。ルールマッチング→AI生成→UUIDマッピング→バランスチェックのパイプライン全体がルートファイルに直書き。routes/ は HTTP リクエスト/レスポンスの薄いレイヤーであるべき。

- [ ] 新規: `src/domain/journal/journal-pipeline.service.ts` — 仕訳生成パイプライン統合サービス
- [ ] `journal.generate.ts` → パイプラインサービスを呼ぶだけの薄いルートに削減（~50行目標）

### BE-3: journal.crud.ts の分割（優先度：中）

252行に CRUD + status変更 + bulk-status + approve + 明細行更新が混在。

- [ ] `src/api/routes/journal/journal.operations.ts` — status変更/bulk-status/approve/excluded取得
- [ ] `src/api/routes/journal/journal-lines.crud.ts` — 明細行の個別更新
- [ ] `journal.crud.ts` → 純粋な GET/POST/PUT/DELETE のみ（~80行目標）
- [ ] `journal/index.ts` のバレルファイルを更新

### BE-4: document.ocr.ts のパイプラインサービス抽出（優先度：中）

ルートファイルが画像取得→分類→抽出→重複チェックの全ステップを直接実行している。

- [ ] 新規: `src/domain/ocr/ocr-pipeline.service.ts` — OCRパイプライン統合サービス
- [ ] `document.ocr.ts` → パイプラインサービスを呼ぶだけの薄いルートに削減

### BE-5: supabase.debug.ts のレイヤー違反修正（優先度：低）

`adapters/supabase/supabase.debug.ts` が `web/shared/lib/supabase.ts` を import している。バックエンドレイヤーがフロントエンドレイヤーを参照するレイヤー違反。

- [ ] debug.ts が必要なら `supabase-admin.client.ts` を使うか、`adapters/` 内に専用クライアントを持つ
- [ ] 不要なら debug.ts 自体を削除

### BE-6: shared/types/models.ts の分散（優先度：低）

474行のモノリス。domain/ にドメイン分割したなら型もドメインごとに配置する方が一貫性がある。

- [ ] `JournalEntry`, `JournalEntryLine` → `domain/journal/journal.types.ts` に統合検討
- [ ] `Document` → `domain/document/document.types.ts` に統合検討
- [ ] `models.ts` は共通型（Client, User, Organization 等）のみ残す

### BE-7: shared/ のBE専用とBE/FE共用の分離（優先度：低）

`shared/constants/accounting.ts` はバックエンド専用（freee税コード等）だが、`shared/types/` や `shared/utils/normalize-japanese.ts` はBE/FE共用。同じフォルダに混在。

- [ ] BE専用の constants/ を `domain/` 配下に移動するか、明示的に分離

### BE-8: db/ の整理（優先度：低）

`schema.sql`, `seed_*.sql`, `migration-*.sql` がフラットに並んでいる。

- [ ] `db/migrations/`, `db/seeds/` にサブフォルダ分け
- [ ] タイムスタンプ付き命名規則の導入

### BE-9: domain/rule-engine/ と domain/journal/ の境界整理（優先度：低）

`journal/generator.strategy.ts` が `rule-engine/matcher.service.ts` を呼ぶ。仕訳生成とルールマッチングは実質1つのパイプライン。

- [ ] `journal-pipeline.service.ts`（BE-2）作成時に generator.strategy.ts を統合して削除
- [ ] rule-engine/ は純粋なマッチングロジックのみに限定

### BE-将来課題

- [ ] correction hints の SQL GROUP BY 最適化（Supabase RPC 関数の DB マイグレーション要）
- [ ] 6つのルートファイルの残り try-catch を asyncHandler に移行

---

## フロントエンド残タスク

### FE-1: window.alert/confirm → useConfirm/Toast 置換（優先度：中）

基盤（ConfirmDialog, Toast, useConfirm）は作成済み。13ファイル22箇所の置換が未完了。

- [ ] `useReviewActions.ts`, `AccountsPage.tsx`, `SuppliersPage.tsx`, `TaxCategoriesPage.tsx`, `IndustriesPage.tsx`, `ItemsPage.tsx`, `SettingsPage.tsx`, `ClientListPage.tsx`, `ApprovalsPage.tsx`, `UploadPage.tsx`, `OCRPage.tsx`, `ExportPage.tsx`, `ReviewPage.tsx`

### FE-2: マスタ系ページへの共通hooks適用（優先度：中）

useCrud, useModal, useSearchFilter は作成済み。AccountsPage/SuppliersPage/ItemsPage への適用が未完了。

- [ ] `AccountsPage.tsx` — useCrud + useModal に置換
- [ ] `SuppliersPage.tsx` — 同上
- [ ] `ItemsPage.tsx` — 同上

### FE-3: ステータス定数の全ページ適用（優先度：低）

statuses.ts の `getStatusLabel()`/`getStatusBadgeClass()` が定義済みだが、各ページではまだハードコード文字列が残っている。

- [ ] 全ページのステータスバッジ表示を定数参照に置換

### FE-4: button type + label htmlFor の全ファイル適用（優先度：低）

- [ ] 残りの `<button>` への `type="button"` 追加
- [ ] 全フォームの `<label htmlFor>` と `<input id>` 紐づけ

### FE-5: インラインスタイル + デザイントークン適用（優先度：低）

Tailwind config にトークン定義済み。各コンポーネントへの適用が未完了。

- [ ] `index.css` の `.btn-primary` 等をトークン参照に更新
- [ ] 全コンポーネントの `style={{ }}` インラインスタイル22箇所を Tailwind クラスに置換

### FE-6: workflow/ feature の肥大化対策（優先度：低）

44ファイルが1つの feature に集中。他の feature（auth: 1, approvals: 1）と規模が全く違う。

- [ ] review/ をサブ feature として分離検討（context/, sections/, layouts/ を含む）
- [ ] または現状維持で、ファイル名規則で管理

---

## 検証方法（共通）

1. `npx tsc --noEmit` — TypeScript コンパイルエラーなし
2. 全画面の手動操作確認
3. ブラウザコンソールにエラーなし
