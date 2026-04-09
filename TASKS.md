# コメントリファクタリング実装計画

JSDoc ドキュメンテーション方式への統一。JSDoc + 複雑処理の why 以外のコメントは全削除。

## Batch 1: `modules/journal/` + `modules/rule-engine/`（11ファイル）
- [ ] `journal/ai-generator.service.ts` — `@module`、JSDoc、JSON修復の why
- [ ] `journal/ai-generator.prompt.ts` — `@module`、JSDoc
- [ ] `journal/rule-generator.service.ts` — `@module`、JSDoc
- [ ] `journal/line-mapper.service.ts` — `@module`、JSDoc、名寄せの why
- [ ] `journal/generator.strategy.ts` — `@module`、JSDoc
- [ ] `journal/journal.types.ts` — 各インターフェースに1行 JSDoc
- [ ] `rule-engine/matcher.service.ts` — `@module`、JSDoc、priority の why
- [ ] `rule-engine/matcher-with-candidates.ts` — `@module`、JSDoc
- [ ] `rule-engine/rule-engine.types.ts` — 各インターフェースに1行 JSDoc
- [ ] `rule-engine/rule-name-generator.ts` — `@module`、JSDoc
- [ ] `rule-engine/conflict-detector.ts` — `@module`

## Batch 2: `core/`（8ファイル）
- [ ] `accounting/double-entry.ts` — `@module`、JSDoc 補完
- [ ] `accounting/household-ratio.ts` — `@module`、JSDoc
- [ ] `accounting/tax-calculation.ts` — `@module`、JSDoc
- [ ] `accounting/withholding-tax.ts` — `@module`、JSDoc、100万円閾値の why
- [ ] `matching/condition-evaluator.ts` — `@module`、JSDoc、AND評価の why
- [ ] `matching/priority-resolver.ts` — `@module`、JSDoc
- [ ] `validation/amount-validator.ts` — `@module`、JSDoc
- [ ] `validation/date-validator.ts` — `@module`、JSDoc

## Batch 3: `modules/ocr/` + `document/` + `export/` + `identity/`（14ファイル）
- [ ] `ocr/ocr.types.ts` — `@module`、各インターフェースに1行 JSDoc、不要コメント削除
- [ ] `ocr/classifier.service.ts` — `@module`、不要コメント削除、JSDoc
- [ ] `ocr/extractor.service.ts` — `@module`、不要コメント削除、JSDoc
- [ ] `ocr/multi-extractor.service.ts` — `@module`、不要コメント削除、JSDoc
- [ ] `ocr/classifier.prompt.ts` — `@module`、JSDoc
- [ ] `ocr/extractor.prompt.ts` — `@module`、不要コメント削除、JSDoc
- [ ] `ocr/multi-extractor.prompt.ts` — `@module`、不要コメント削除、JSDoc
- [ ] `document/duplicate-checker.ts` — `@module`、JSDoc、ファジーマッチの why
- [ ] `document/supplier-matcher.ts` — `@module`、JSDoc
- [ ] `document/document.types.ts` — `@module`
- [ ] `export/freee-csv.builder.ts` — `@module`、JSDoc
- [ ] `export/simple-csv.builder.ts` — `@module`、JSDoc
- [ ] `identity/role.types.ts` — `@module`、JSDoc
- [ ] `identity/tenant.types.ts` — `@module`、JSDoc

## Batch 4: `api/routes/`（非CRUD）+ `middleware/` + `helpers/`（13ファイル）
- [ ] `routes/journals.route.ts` — `@module`、明細分割の why、不要コメント削除
- [ ] `routes/ocr.route.ts` — `@module`、2段階パイプラインの why
- [ ] `routes/batch.route.ts` — `@module`
- [ ] `routes/documents.route.ts` — `@module`
- [ ] `routes/freee.route.ts` — `@module`、OAuth の why
- [ ] `routes/health.route.ts` — `@module`
- [ ] `routes/validation.route.ts` — `@module`
- [ ] `middleware/auth.middleware.ts` — `@module`、PUBLIC_PATHS の why
- [ ] `middleware/error-handler.middleware.ts` — `@module`
- [ ] `middleware/logging.middleware.ts` — `@module`
- [ ] `middleware/rate-limit.middleware.ts` — `@module`
- [ ] `helpers/master-data.ts` — `@module`、各ヘルパーに JSDoc
- [ ] `api/server.ts` — `@module`

## Batch 5: `api/routes/crud/`（15ファイル）
各ファイルに `@module` ヘッダーのみ。不要コメント削除。複雑クエリには why。
- [ ] `account-items.crud.ts`
- [ ] `client-ratios.crud.ts`
- [ ] `clients.crud.ts`
- [ ] `documents.crud.ts`
- [ ] `industries.crud.ts`
- [ ] `items.crud.ts`
- [ ] `journal-corrections.crud.ts`
- [ ] `journal-entries.crud.ts` — 複雑クエリに why
- [ ] `notifications.crud.ts`
- [ ] `rules.crud.ts`
- [ ] `storage.crud.ts`
- [ ] `suppliers.crud.ts` — 複雑クエリに why
- [ ] `tax-categories.crud.ts`
- [ ] `users.crud.ts`
- [ ] `workflows.crud.ts`

## Batch 6: `adapters/` + `server/` + `shared/`（14ファイル）
- [ ] `adapters/gemini/gemini.client.ts` — `@module`、キューの why
- [ ] `adapters/gemini/gemini.config.ts` — `@module`
- [ ] `adapters/freee/freee.api-client.ts` — `@module`、JSDoc
- [ ] `adapters/freee/freee.oauth.ts` — `@module`
- [ ] `adapters/supabase/supabase.client.ts` — `@module`
- [ ] `adapters/supabase/supabase-admin.client.ts` — `@module`、admin の why
- [ ] `adapters/supabase/supabase.debug.ts` — `@module`
- [ ] `server/index.ts` — `@module`
- [ ] `server/services/validation.service.ts` — `@module`、JSDoc
- [ ] `server/services/freee.service.ts` — `@module`、JSDoc
- [ ] `shared/types/models.ts` — `@module`、全インターフェースに1行 JSDoc
- [ ] `shared/types/enums.ts` — `@module`
- [ ] `shared/utils/normalize-japanese.ts` — `@module`、正規化の why

## Batch 7: `web/`（フロントエンド）
- [ ] 7a: `context/` + `providers/`（7ファイル）— `@module`、hooks に JSDoc、不要コメント削除
- [ ] 7b: `shared/`（4ファイル）— `@module`、`backend.api.ts` の API に JSDoc
- [ ] 7c: `doc-types/`（2ファイル）— `@module`
- [ ] 7d: `pages/` + `layouts/` + `sections/`（~35ファイル）— `@module` のみ、不要コメント削除

## 検証（各バッチ後）
- `npx tsc --noEmit` でエラーなし
- 機能コードの変更なし
