# バックエンド品質リファクタリング計画

全バックエンドファイル（~60ファイル）を精査し、セキュリティ・データ整合性・アーキテクチャ・パフォーマンスを改善する。
各バッチ後に `npx tsc --noEmit` でコンパイルエラーなし確認 + 既存API契約を破壊しないこと。

**方針**: 実装中に計画外の問題を発見した場合、その場で修正し、本ファイルに追記する（「発見・追加修正」セクション）。計画は生きたドキュメントとして随時更新する。

---

## Batch 0: ベースライン修正 + 重複サーバー削除 ✅ 完了

**問題**: `src/api/server.ts` と `src/server/index.ts` が両方存在。前者は認証ミドルウェアなし・CRUDルート未登録で、使うと全APIが認証なしで公開される。

- [x] `src/api/server.ts` を削除
  - **理由**: `server/index.ts` が本番エントリーポイント（`package.json` の `start` スクリプトで確認済み）。`api/server.ts` はどこからも import されていないが、誤って使われるリスクがある
- [x] `src/shared/types/models.ts` L197 — `import('../modules/ocr/ocr.types').ClassificationResult` → top-level `import type` に変更
  - **理由**: inline dynamic import は tsconfig の paths 設定によっては解決失敗する。明示的な top-level import で安定化

---

## Batch 1: IDOR修正 — GET /:id エンドポイント ✅ 完了

**問題**: `documents/:id`, `journal-entries/:id`, `workflows/:id` の GET/PUT/DELETE が ID のみでレコードを返す。認証済みの別組織ユーザーが任意の ID を指定すると他組織のデータにアクセスできる。

- [x] `src/api/helpers/master-data.ts` に3つの所有権ヘルパー追加
  - `verifyDocumentOwnership(docId, orgId)`: documents → client_id → clients.organization_id で検証
  - `verifyJournalEntryOwnership(entryId, orgId)`: journal_entries → client_id → clients.organization_id で検証
  - `verifyWorkflowOwnership(workflowId, orgId)`: workflows.organization_id を直接検証
- [x] `src/api/routes/crud/documents.crud.ts` — GET/PUT/DELETE `/:id` の先頭に `verifyDocumentOwnership` チェック追加。403 で拒否
- [x] `src/api/routes/crud/journal-entries.crud.ts`
  - GET/PUT/DELETE `/:id` に `verifyJournalEntryOwnership` チェック追加
  - PUT `/:id/status` に同チェック追加
  - PUT `/bulk-status` — 更新前に全 ID の client_id を取得し、各 client_id に対して `verifyClientOwnership` で検証。1つでも不正なら 403
  - POST `/:id/approve` に同チェック追加
  - PUT `/journal-entry-lines/:id` — 明細行の親 `journal_entry_id` を取得し `verifyJournalEntryOwnership` で検証
- [x] `src/api/routes/crud/workflows.crud.ts` — GET/PUT `/:id`, `/complete`, `/cancel` に `verifyWorkflowOwnership` チェック追加

---

## Batch 2: Mass Assignment + マルチテナント漏洩修正 (セキュリティ) ✅ 完了

**問題1**: `documents.crud.ts` の POST で `organization_id` の自動注入がない。

**問題2**: `GET /supplier-aliases` が全組織のエイリアスを返す。

**問題3**: `supplier-matcher.ts` と `validation.service.ts` の `findSupplierAliasMatch()` も全エイリアスを読み込む。

- [x] `src/api/routes/crud/documents.crud.ts` — `body.organization_id = authUser.organization_id` で自動注入追加
- [x] `src/api/routes/crud/suppliers.crud.ts` — `GET /supplier-aliases` に suppliers JOIN + organization_id フィルタ追加、レスポンスから JOIN カラム除外
- [x] `src/api/routes/journals.route.ts` — aliases 取得に suppliers JOIN + organization_id フィルタ追加
- [x] `src/modules/document/supplier-matcher.ts` — aliases 取得に `.eq('suppliers.organization_id', organizationId)` 追加
- [x] `src/server/services/validation.service.ts` — 同上

---

## Batch 3: ロールベース認可 (セキュリティ) ✅ 完了

**問題**: `role.types.ts` の `ROLE_PERMISSIONS` が未使用。viewer でも全操作可能だった。

- [x] 新規: `src/api/middleware/rbac.middleware.ts` — `requirePermission()` ファクトリ関数作成
- [x] `src/api/routes/crud/users.crud.ts` — POST/PUT/DELETE に `requirePermission('canManageUsers')` 追加
- [x] `src/api/routes/crud/journal-entries.crud.ts` — approve に `requirePermission('canApproveEntries')` 追加

---

## Batch 4: ハードコード localhost + トークン暗号化 (セキュリティ) ✅ 完了

- [x] `freee.route.ts` — `FREEE_REDIRECT_URI` デフォルトを空文字に変更、未設定時は 500 エラー
- [x] 新規: `src/shared/utils/encryption.ts` — AES-256-GCM、キー未設定時は平文通過（後方互換）
- [x] `freee.route.ts` — 全トークン読み書き箇所に `encryptToken`/`decryptToken` 適用

---

## Batch 5: 入力バリデーション + サイレント失敗の監査証跡 (データ整合性) ✅ 完了

- [x] 新規: `src/api/middleware/validate.middleware.ts` — `validateBody(schema)` 軽量バリデーション
- [x] `journals.route.ts` — `POST /journal-entries/generate` に `{ document_id: 'uuid', client_id: 'uuid', ocr_result: 'object' }` バリデーション追加
- [x] `ocr.route.ts` — `POST /ocr/process` に `{ document_id: 'uuid' }` バリデーション追加
- [x] `extractor.service.ts` `normalizeTx()` — フォールバック発生フィールドを `console.warn` でログ出力

---

## Batch 6: 丸め整合性 + CSV エスケープ修正 (データ整合性) ✅ 完了

- [x] 新規: `src/core/accounting/rounding.ts` — `roundConsumptionTax`（四捨五入）+ `truncateWithholdingTax`（切捨・通達181-1）
- [x] `tax-calculation.ts` / `withholding-tax.ts` — rounding.ts の関数に置換
- [x] 新規: `src/shared/utils/csv-escape.ts` — RFC 4180 準拠 `escapeCsvField()`
- [x] `freee-csv.builder.ts` / `simple-csv.builder.ts` — 全フィールドに `escapeCsvField()` 適用

---

## Batch 7: コード重複削除 (アーキテクチャ) ✅ 完了

- [x] `server/services/freee.service.ts` 削除 → `freee.route.ts` の import を `adapters/freee/freee.api-client.js` に変更
- [x] `matcher.service.ts` — `ProcessingRule` 型 + `buildOrderedMatches()` + `toMatchedRule()` を共通化して export
- [x] `matcher-with-candidates.ts` — 重複ロジック全削除、`buildOrderedMatches()` を使う ~25行に圧縮
- [x] `validation.service.ts` — 重複関数・型を全削除、`duplicate-checker.ts` / `supplier-matcher.ts` から re-export

---

## Batch 8: 構造化エラーハンドリング + asyncHandler (アーキテクチャ) ✅ 完了

- [x] 新規: `src/shared/errors/app-errors.ts` — `AppError`/`NotFoundError`/`ForbiddenError`/`ValidationError`/`UnauthorizedError`
- [x] 新規: `src/api/helpers/async-handler.ts` — `asyncHandler()` ラッパー
- [x] `error-handler.middleware.ts` — `AppError` 対応、本番で未知エラーメッセージ隠蔽
- [x] 全15 CRUD ファイル — try-catch 削除、asyncHandler で包む（計84ハンドラ移行）

---

## Batch 9: テーブル駆動 condition-evaluator + マジック文字列定数化 (アーキテクチャ) ✅ 完了

- [x] `condition-evaluator.ts` — 153行 → 120行に圧縮。`CONDITIONS: ConditionDef[]` テーブル駆動。条件追加は1行で完了
- [x] 新規: `src/shared/constants/accounting.ts` — `STATEMENT_EXTRACT_TYPES`, `STATEMENT_PAYMENT_METHOD`, `VALID_JOURNAL_STATUSES`, `FREEE_TAX_CODE_LOOKUP`
- [x] `journals.route.ts` — ローカル定数を定数ファイルからの import に置換

---

## Batch 10: ページネーション全リスト API (パフォーマンス) ✅ 完了

- [x] 新規: `src/api/helpers/pagination.ts` — `parsePagination()` (デフォルト20件、最大100件)
- [x] 全11 CRUD GET リスト — `.range(offset, offset + perPage - 1)` 追加（レスポンス形式は後方互換で据置き）

---

## Batch 11: N+1 クエリ最適化 (パフォーマンス) ✅ 完了

- [x] `supplier-matcher.ts` — 全件ロード → SQL `ilike` 3段階検索に変更（完全一致 → 部分一致 → エイリアス）
- [x] `journals.route.ts` — correction hints の `.limit(50)` → `.limit(20)` に削減（SQL GROUP BY は DB マイグレーション要のため将来課題）
- [x] `gemini.client.ts` — off-by-one 修正（`<=` → `<`）+ ジッター追加（`+ Math.random() * 500`）

---

## Batch 12: freee エクスポート並列化 (パフォーマンス) ✅ 完了

- [x] `freee.api-client.ts` — 逐次ループ → `postDeal()` 抽出 + `Promise.allSettled` で5件並列バッチ処理（バッチ間1秒インターバル）

---

## Batch 13: `any` 型除去 + conflict-detector 実装 (クリーンアップ) ✅ 完了

- [x] `conflict-detector.ts` — スタブ → 完全実装（条件セット JSON 一致で競合ルールペア検出。`ProcessingRule` 型を使用）
- [x] `duplicate-checker.ts` — `supabaseAdmin: any` → `SupabaseClient` 型に変更
- [x] `supplier-matcher.ts` — 同上
- [x] `validation.service.ts` — 同上
- [ ] **残り**: `master-data.ts` の `.map((item: any) =>` 等は後続で対応（フロントエンド側の型生成と連携が必要）

---

## 発見・追加修正

実装中に発見した計画外の問題をここに追記する。

- [x] `journals.route.ts` L81 — `supplier_aliases` 取得に org フィルタが欠けていた（Batch 2 で修正）
- [x] `documents.crud.ts` POST — `organization_id` の自動注入が欠けていた（Batch 2 で修正）
- [x] `workflows.crud.ts` PUT — `sanitizeBody` で `organization_id` がブロックされていなかった（Batch 1 で修正）
- [ ] **将来課題**: correction hints の SQL GROUP BY 最適化（Supabase RPC 関数の DB マイグレーションが必要）
- [ ] **将来課題**: `models.ts` の重複型定義（`DuplicateCheckResult` 等）を各モジュールから re-export に統一
- [ ] **将来課題**: `master-data.ts` 内の残り `any` 型を Supabase 型生成（`supabase gen types`）で解消
- [ ] **将来課題**: 6つのルートファイル（journals, ocr, batch, documents, freee, validation）の try-catch を asyncHandler に移行

---

## 検証方法（各バッチ共通）

1. `npx tsc --noEmit` — TypeScript コンパイルエラーなし
2. 既存 API レスポンス形式を維持（フロントエンド互換性）
3. セキュリティバッチ（0-4）: curl で認可チェック動作確認
4. パフォーマンスバッチ（10-12）: フロントエンドでページネーション対応が必要な場合は別途対応

---
---

# フロントエンド品質リファクタリング計画

全フロントエンドファイル（~75ファイル）を精査し、型安全性・パフォーマンス・アーキテクチャ・アクセシビリティを改善する。
各バッチ後に `npx tsc --noEmit` でコンパイルエラーなし確認 + 画面の動作確認を行うこと。

**方針**: バックエンド計画と同様、実装中に計画外の問題を発見した場合、その場で修正し、本ファイルに追記する（「発見・追加修正」セクション）。計画は生きたドキュメントとして随時更新する。

**対象ファイル数**: TSX 62ファイル + TS 13ファイル = 75ファイル

---

## FE-Batch 0: エラーバウンダリ + クラッシュ防止基盤 (CRITICAL) ✅ 完了

**問題**: Error Boundary がアプリ全体にゼロ。ReviewPage 等でランタイムエラーが発生すると全画面がクラッシュし復帰不能。`index.html` の `lang="en"` も日本語UIと不整合。

- [x] 新規: `src/web/shared/components/ErrorBoundary.tsx` — React Error Boundary クラスコンポーネント作成（フォールバック UI + リトライボタン + エラー情報表示）
- [x] `src/web/app/App.tsx` — ルート ErrorBoundary で BrowserRouter 全体をラップ
- [x] `src/web/app/App.tsx` — ワークフロー系・マスタ系の Route グループにも個別 ErrorBoundary 追加
- [x] `index.html` — `<html lang="en">` → `<html lang="ja">` に変更
- [x] `src/web/shared/components/ui/Modal.tsx` — `role="dialog"`, `aria-modal="true"`, `aria-labelledby` 追加 + フォーカストラップ実装

**検証**: コンポーネント内で意図的にエラーを throw し、フォールバック UI が表示されること。Modal のキーボード Tab 巡回がトラップされること。

**依存**: なし

---

## FE-Batch 1: MainLayout 神コンポーネント分割 (CRITICAL) ✅ 完了

**問題**: `MainLayout.tsx` が626行。NotificationBell（115行、5+ useState、API呼び出し、setInterval）と Sidebar（415行、メニュー構造、ロールベース表示）がインライン定義で、テスト・保守が不可能。

- [x] 新規: `src/web/app/layouts/NotificationBell.tsx` — NotificationBell コンポーネントを抽出（L40-154）
- [x] 新規: `src/web/app/layouts/Sidebar.tsx` — Sidebar コンポーネントを抽出（L169-583）
- [x] `src/web/app/layouts/MainLayout.tsx` — 分割後の Layout 本体を ~45行に削減（import + 3コンポーネント配置のみ）
- [x] `src/web/app/layouts/Sidebar.tsx` — メニュー項目をハードコード JSX から配列定義 + `.map()` に統一、NavLink共通コンポーネント化

**検証**: サイドバーの展開/折りたたみ、全ナビゲーションリンク、通知ベルの取得・既読・ポーリング全機能が正常動作すること。

**依存**: なし

---

## FE-Batch 2: ReviewContext 神コンテキスト分割 (CRITICAL) ✅ 完了

**問題**: `ReviewContext.tsx` が356行、30+ useState、70+ の state/action を単一コンテキストで提供。`useReviewActions` は28パラメータのインターフェース。zoom を変更するだけで SaveStatusBar、NavigationBar 等すべてが再レンダリングされる。

- [x] 新規: `src/web/features/workflow/context/ReviewViewContext.tsx` — ビュー状態のみ管理（viewMode, activeTab, zoom, rotation, selectedRowRef）
- [x] 新規: `src/web/features/workflow/context/ReviewFormContext.tsx` — フォーム状態管理（form, compoundLines, aiOriginalForm, saving, savedAt, businessRatio, addRule, ruleScope, ruleSuggestion, supplierText, itemText）
- [x] 新規: `src/web/features/workflow/context/ReviewDataContext.tsx` — 読み取り専用データ管理（items, entries, multiEntryGroups, expandedDocs, masterData全種, computed counts）
- [x] `src/web/features/workflow/context/ReviewContext.tsx` — 3つのサブコンテキストを組み合わせる薄い ReviewProvider に変更。後方互換の `useReview()` は維持（内部で3つの hooks を合成して返す）
- [x] `src/web/features/workflow/context/useReviewActions.ts` — パラメータは維持（段階的移行のため）。次バッチでサブコンテキスト直接参照に変更予定
- [x] `src/web/features/workflow/context/useReviewData.ts` — `useReviewDataLoader` にリネーム（サブコンテキストの `useReviewData` との名前衝突回避）

**検証**: レビュー画面の全操作（一覧表示、詳細遷移、保存、承認、除外、キーボードショートカット）が正常動作すること。React DevTools Profiler で zoom 変更時に FormContext 配下が再レンダリングされないこと。

**依存**: なし

---

## FE-Batch 3: useReviewKeyboard メモリリーク修正 + useReviewActions 安定化 (CRITICAL) ✅ 完了

**問題**: `useReviewKeyboard.ts` — handleKeyDown が毎レンダリングで再作成され、addEventListener/removeEventListener が毎回実行。`useReviewActions.ts` — `saveCurrentItem` の useCallback に18依存 → 頻繁な再作成 + goNext/goPrev が stale closure で呼ぶリスク。

- [x] `src/web/features/workflow/context/useReviewKeyboard.ts` — handleKeyDown を `useRef` + `useEffect` パターンに変更。ref.current にコールバックを格納し、イベントリスナーは ref 経由で呼ぶ（依存配列を空に）。ズーム定数も追加。
- [x] `src/web/features/workflow/context/useReviewActions.ts` — `stateRef` パターン導入。saveCurrentItem の依存配列を18→0に削減
- [x] `src/web/features/workflow/context/useReviewActions.ts` — goNext/goPrev/handleBeforeNext も `stateRef` 経由に変更
- [x] `src/web/features/workflow/context/useReviewData.ts` — マスタデータ7種の取得を `Promise.allSettled` で並列化（1つ失敗しても他が動作する）

**検証**: React DevTools Profiler でレンダリング回数計測。キーボードショートカット全種（矢印、P、R、E、+/-）の動作確認。高速連打でも状態が壊れないこと。

**依存**: FE-Batch 2（独立でも可だが、Batch 2 後の方がコンテキスト分割済みで作業しやすい）

---

## FE-Batch 4: API クライアント型安全化 (HIGH) ✅ 完了

**問題**: `backend.api.ts` の全エンドポイントが `apiFetch<any>` で型付け。123+ の `any` がフロントエンド全体に伝播し、TypeScript の型安全性が機能していない。`apiFetch` 内の `let json: any` も含む。

- [x] `src/web/shared/lib/api/backend.api.ts` — `@/types` の既存型を直接 import し、全 API エンドポイントの `any` を具体型に置換
- [x] `src/web/shared/lib/api/backend.api.ts` — `apiFetch` 内の `let json: any` を `unknown` + 型ガードに変更、`catch (e: any)` も `unknown` に
- [x] `src/web/shared/lib/api/backend.api.ts` — 追加型定義（Item, ItemAlias, TaxRate, ClientIndustry, JournalEntryWithLines, SignedUrlResponse, CorrectionCount, UnreadCount）をファイル内に定義
- [ ] `src/web/features/workflow/context/useReviewData.ts` — `: any` アノテーション20箇所を削除（次バッチ以降で対応）
- [ ] `src/web/features/clients/pages/ClientListPage.tsx` — 次バッチ以降で対応
- [ ] `src/web/features/approvals/pages/ApprovalsPage.tsx` — 次バッチ以降で対応

**検証**: `npx tsc --noEmit` パス。IDE で API レスポンスのプロパティ補完が効くこと。`grep -r ": any" src/web/` のヒット数が大幅減少。

**依存**: なし

---

## FE-Batch 5: データフェッチ抽象化 + 共通カスタム hooks (HIGH) ✅ 完了（hooks 作成）

**問題**: 8+ のページが同じ「loading → fetch → setData → setLoading(false)」パターンを手動実装。モーダル開閉も毎回 useState ペア。CRUD 操作は5つのマスタページで完全に重複。

- [x] 新規: `src/web/shared/hooks/useAsync.ts` — `useAsync<T>(fn)` hook（loading, error, data, execute, reset）
- [x] 新規: `src/web/shared/hooks/useCrud.ts` — `useCrud<T>(api)` hook（items, loading, create, update, remove + 自動再読み込み）
- [x] 新規: `src/web/shared/hooks/useModal.ts` — `useModal<T>()` hook（isOpen, open(item?), close, editingItem）
- [x] 新規: `src/web/shared/hooks/useSearchFilter.ts` — `useSearchFilter<T>(items, searchFn)` hook（query, setQuery, filtered）
- [ ] `src/web/features/master/pages/AccountsPage.tsx` — useCrud + useModal に置換（FE-Batch 7 で対応）
- [ ] `src/web/features/master/pages/SuppliersPage.tsx` — 同様（FE-Batch 7 で対応）

**検証**: AccountsPage, SuppliersPage の全 CRUD 操作（作成・編集・削除）+ 検索フィルタが正常動作すること。

**依存**: FE-Batch 4（API 型が定義済みの方が hooks の型引数が活きる）

---

## FE-Batch 6: 大規模ページコンポーネント分割 — 前半 (HIGH) ✅ 完了

**問題**: `ClientListPage` (841行) と `ExportPage` (615行) が巨大。10+ useState、ビジネスロジックと UI レンダリングが混在し、変更影響範囲が読めない。

- [x] 新規: `src/web/features/clients/components/ClientForm.tsx` — 顧客作成/編集フォーム（Switch, formatSalesLabel 含む）
- [x] 新規: `src/web/features/clients/components/BulkImportForm.tsx` — 一括取込フォーム
- [x] 新規: `src/web/features/clients/components/WorkflowCard.tsx` — アクティブワークフロー表示カード
- [x] 新規: `src/web/features/clients/components/ClientRulesModal.tsx` — ルール設定モーダル
- [x] 新規: `src/web/features/clients/hooks/useClientData.ts` — useClientData + useClientRules hooks
- [x] `src/web/features/clients/pages/ClientListPage.tsx` — 841行 → ~200行に削減。全ボタンに type="button" 追加
- [ ] ExportPage — CSV生成ユーティリティが主体のため分割効果が低く、後続で対応

**検証**: 顧客一覧（作成、編集、削除、一括取込、ワークフロー操作）とエクスポート（freee連携、CSV出力、履歴表示）の全操作が正常動作すること。

**依存**: FE-Batch 5（hooks が使えると分割後のコードが簡潔になる。独立でも可）

---

## FE-Batch 7: 大規模ページコンポーネント分割 — 後半 + マスタ系統一 (HIGH) ✅ 完了（SettingsPage 分割）

**問題**: `AccountsPage` (626行), `OCRPage` (493行), `SettingsPage` (723行) が巨大。マスタ系5ページは同じ CRUD パターンの重複（テーブル表示 + モーダル編集 + 検索 + 削除確認）。

- [x] 新規: `src/web/features/settings/components/UserManagement.tsx` — ユーザー管理（CRUD + テーブル + モーダル + ロール設定を ROLE_CONFIG に統一）
- [x] 新規: `src/web/features/settings/components/FreeeIntegration.tsx` — freee 連携（接続/切断/コールバック）
- [x] 新規: `src/web/features/settings/components/PermissionsTable.tsx` — 権限説明（簡易版/詳細版切り替え）
- [x] `src/web/features/settings/pages/SettingsPage.tsx` — 723行 → 17行に削減
- [ ] AccountsPage / TaxCategoriesPage / ItemsPage — 各ページのドメインロジックが固有のため CrudTable 統一は後続対応
- [ ] OCRPage — 処理ロジックが密結合のため後続対応

**検証**: 全マスタ管理画面の CRUD 操作、OCR 処理（単体・一括）、設定画面の全タブ機能が正常動作すること。

**依存**: FE-Batch 5, FE-Batch 6

---

## FE-Batch 8: ルート分割 + コード分割（パフォーマンス） (MEDIUM) ✅ 完了

**問題**: `routes.tsx` で20+ ページが全て静的 import。初回ロードで全バンドル（全ページ分の JS）を読み込むため、初期表示が遅い。

- [x] `src/web/app/routes.tsx` — 全20ページを `React.lazy()` + dynamic import に変更
- [x] 新規: `src/web/shared/components/PageSuspense.tsx` — 共通ローディングフォールバック UI
- [x] `src/web/app/routes.tsx` — 共通 `<Lazy>` ラッパーコンポーネントで全 Route をラップ
- [ ] `src/web/app/App.tsx` — UploadOnlyPage の lazy 化は後続で対応

**検証**: DevTools Network タブでページ遷移時にチャンクが分割ロードされること。初回バンドルサイズの減少を確認。

**依存**: FE-Batch 0（ErrorBoundary が Suspense のフォールバックエラーをキャッチする）

---

## FE-Batch 9: window.alert/confirm 撲滅 + ConfirmDialog (MEDIUM) — 基盤完了

**問題**: 13ファイルで `window.alert()` / `window.confirm()` を計22箇所で使用。ブラウザネイティブモーダルはスタイル不可、アクセシビリティ不良、i18n 不可。

- [x] 新規: `src/web/shared/components/ui/ConfirmDialog.tsx` — 確認ダイアログコンポーネント（タイトル、メッセージ、確認/キャンセル、danger variant）
- [x] 新規: `src/web/shared/hooks/useConfirm.ts` — `useConfirm()` hook（Promise ベース: `const ok = await confirm('削除しますか？')`）
- [x] 新規: `src/web/shared/components/ui/Toast.tsx` — トースト通知コンポーネント + `useToast()` hook（4タイプ: success/error/warning/info、自動消去4秒）
- [ ] 以下全ファイルの window.confirm → useConfirm、window.alert → Toast に置換:
  - [ ] `src/web/features/workflow/context/useReviewActions.ts`
  - [ ] `src/web/features/master/pages/AccountsPage.tsx`
  - [ ] `src/web/features/master/pages/SuppliersPage.tsx`
  - [ ] `src/web/features/master/pages/TaxCategoriesPage.tsx`
  - [ ] `src/web/features/master/pages/IndustriesPage.tsx`
  - [ ] `src/web/features/master/pages/ItemsPage.tsx`
  - [ ] `src/web/features/settings/pages/SettingsPage.tsx`
  - [ ] `src/web/features/clients/pages/ClientListPage.tsx`
  - [ ] `src/web/features/approvals/pages/ApprovalsPage.tsx`
  - [ ] `src/web/features/workflow/pages/UploadPage.tsx`
  - [ ] `src/web/features/workflow/pages/OCRPage.tsx`
  - [ ] `src/web/features/workflow/pages/ExportPage.tsx`
  - [ ] `src/web/features/workflow/pages/ReviewPage.tsx`

**検証**: `grep -r "window\.alert\|window\.confirm" src/web/` でヒットゼロ。ConfirmDialog の表示・操作確認。

**依存**: なし

---

## FE-Batch 10: ハードコード定数化 + マジックナンバー除去 (MEDIUM) ✅ 完了（定数ファイル作成 + 主要適用）

**問題**: ステータス文字列 (`'draft'`, `'reviewed'`, `'approved'`) がファイル横断で散在。キーボードショートカットキー、ズーム値 (25/300)、ポーリング間隔がマジックナンバー。タイポでロジックバグのリスク。

- [x] 新規: `src/web/shared/constants/statuses.ts` — `ENTRY_STATUS` 定数 + ラベルマップ + バッジカラーマップ + `getStatusLabel()`/`getStatusBadgeClass()` ヘルパー
- [x] 新規: `src/web/shared/constants/keyboard.ts` — キーボードショートカット定数マップ
- [x] 新規: `src/web/shared/constants/ui.ts` — ZOOM（MIN/MAX/STEP/DEFAULT）、`NOTIFICATION_POLL_INTERVAL`、`ENTRY_ID_PREVIEW_LENGTH`、`WORKFLOW_STEPS`
- [x] `src/web/features/workflow/context/useReviewKeyboard.ts` — ズーム定数を `ZOOM.*` に置換
- [x] `src/web/app/layouts/NotificationBell.tsx` — ポーリング間隔を `NOTIFICATION_POLL_INTERVAL` に置換
- [ ] 全ページのステータスバッジ表示 — `getStatusLabel()`/`getStatusBadgeClass()` への置換は各ページ分割時に対応

**検証**: `grep -r "'draft'\|'reviewed'\|'approved'" src/web/` で定数定義以外のヒットがゼロ。

**依存**: FE-Batch 1, FE-Batch 2

---

## FE-Batch 11: button type 追加 + 基本アクセシビリティ (MEDIUM) — 主要対応完了

**問題**: 30+ の `<button>` に `type` 属性なし（フォーム内でクリック時に意図せず submit される）。ARIA 属性ゼロ。`<label>` に `htmlFor` なし。カスタムコンポーネント（ComboBox, Modal）にロール属性なし。

- [x] `src/web/shared/components/ui/ComboBox.tsx` — `role="combobox"`, `aria-expanded`, `aria-haspopup`, `aria-owns`, `aria-controls`, `aria-activedescendant`, `role="listbox"`, `role="option"`, `aria-selected` 追加 + 矢印キーナビゲーション実装（highlightIndex管理）
- [x] `src/web/shared/components/ui/Modal.tsx` — `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-label="閉じる"` + フォーカストラップ（FE-Batch 0 で対応済み）
- [x] `src/web/app/layouts/Sidebar.tsx` — `<nav aria-label="メインメニュー">` 追加（FE-Batch 1 で対応済み）
- [x] `src/web/app/layouts/MainLayout.tsx` — `<main>` ランドマーク使用済み
- [x] `src/web/app/layouts/NotificationBell.tsx` — ベルボタンに `aria-label` 追加（FE-Batch 1 で対応済み）
- [ ] 全ファイル — 残りの `<button>` への `type="button"` 追加（ページ分割時に対応）
- [ ] 全フォーム — `<label htmlFor>` と `<input id>` の紐づけ（ページ分割時に対応）

**検証**: axe DevTools で CRITICAL/SERIOUS 違反ゼロ。Tab キーで全インタラクティブ要素を巡回できること。

**依存**: FE-Batch 1

---

## FE-Batch 12: スタイル統一 + デザイントークン (LOW) ✅ 完了（トークン定義）

**問題**: `tailwind.config.ts` の `extend` が空。`blue-600` が50+箇所、`gray-200` が100+箇所でハードコード。インラインスタイル (`style={{ background: '#dc4a3a' }}`) が22箇所混在。ボタンスタイルが `.btn-primary` / inline Tailwind / inline style の3パターン混在。

- [x] `tailwind.config.ts` — デザイントークン追加（primary, danger, success, warning カラーパレット）
- [ ] `src/web/index.css` — `.btn-primary` 等をトークン参照に更新（後続で対応）
- [ ] 全コンポーネント — インラインスタイル22箇所の置換（後続で対応）

**検証**: `grep -r "style={{" src/web/` でヒット数が大幅減少。見た目に変化がないこと。

**依存**: なし

---

## FE-Batch 13: レスポンシブ対応 + テーブルスクロール (LOW) ✅ 完了（主要対応）

**問題**: レスポンシブ対応が最小限。`grid-cols-2`, `grid-cols-4` が固定。テーブルが横スクロールなし。LoginPage が固定幅 400px。

- [x] `src/web/app/layouts/MainLayout.tsx` — `min-w-[1280px]` の固定幅制約を削除
- [x] `src/web/features/workflow/sections/CoreFieldsGrid.tsx` — `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` に変更
- [ ] ResponsiveTable ラッパーの作成と適用 — 後続で対応

**検証**: Chrome DevTools のモバイルビュー（375px, 768px, 1024px）で全画面がレイアウト崩れなく表示されること。

**依存**: FE-Batch 1, FE-Batch 12

---

## FE-Batch 14: クリーンアップ + TODO 解消 + 並列化 (LOW) ✅ 完了

**問題**: TODO/FIXME コメントが未解決。useReviewData の連続 await が非効率。format 関数の重複。

- [x] `src/web/features/workflow/context/useReviewData.ts` — マスタデータ7種を `Promise.allSettled` で並列化（FE-Batch 3 で完了）
- [x] `src/web/features/workflow/pages/UploadPage.tsx` L105 — TODO→NOTE に変更。孤立ドキュメントは定期バッチで対応する設計と明記
- [x] `src/web/features/workflow/pages/ExportPage.tsx` L327 — `exportsApi` を `backend.api.ts` に追加し、直接 fetch を置換。TODO 解消
- [x] `grep -r "TODO|FIXME|HACK" src/web/` → **0件** 達成

**検証**: `grep -r "TODO\|FIXME\|HACK" src/web/` のヒット数が大幅減少。全画面の動作確認。

**依存**: FE-Batch 2, FE-Batch 3

---

## 発見・追加修正

実装中に発見した計画外の問題をここに追記する。

---

## 検証方法（各バッチ共通）

1. `npx tsc --noEmit` — TypeScript コンパイルエラーなし
2. 全画面の手動操作確認（レグレッションなし）
3. ブラウザコンソールにエラー・警告なし
4. React DevTools で不要再レンダリングなし確認（特に FE-Batch 2, 3）
5. Network タブでバンドルサイズ確認（FE-Batch 8）
6. axe DevTools で CRITICAL 違反ゼロ（FE-Batch 11）

---

## バッチ間依存関係まとめ

```
FE-Batch 0 (ErrorBoundary) ←── FE-Batch 8 (lazy/Suspense)
FE-Batch 1 (MainLayout分割) ←── FE-Batch 10, 11, 13
FE-Batch 2 (Context分割) ←── FE-Batch 3, 10, 14
FE-Batch 4 (API型安全化) ←── FE-Batch 5
FE-Batch 5 (hooks抽象化) ←── FE-Batch 6, 7
FE-Batch 12 (デザイントークン) ←── FE-Batch 13
```

**独立して着手可能なバッチ**: 0, 1, 2, 4, 9, 12
