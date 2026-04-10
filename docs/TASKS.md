# タスク管理

> 未完了タスクのみ記載。完了済みバッチは削除済み。

---

## バックエンド残タスク

### BE-1: master-data.ts re-export ラッパーの解体 ✅ 完了

### BE-2: journal.generate.ts のパイプラインサービス抽出 ✅ 完了

### BE-3: journal.crud.ts の分割 ✅ 完了

### BE-4: document.ocr.ts のパイプラインサービス抽出 ✅ 完了

### BE-5: supabase.debug.ts のレイヤー違反修正 ✅ 完了

`adapters/supabase/supabase.debug.ts` → `web/shared/lib/supabase.debug.ts` に移動。

### BE-6: shared/types/models.ts の分散（優先度：低）

474行のモノリス。domain/ にドメイン分割したなら型もドメインごとに配置する方が一貫性がある。

- [ ] `JournalEntry`, `JournalEntryLine` → `domain/journal/journal.types.ts` に統合検討
- [ ] `Document` → `domain/document/document.types.ts` に統合検討
- [ ] `models.ts` は共通型（Client, User, Organization 等）のみ残す

### BE-7: shared/ のBE専用とBE/FE共用の分離（優先度：低）

- [ ] BE専用の `shared/constants/accounting.ts` を `domain/` 配下に移動するか、明示的に分離

### BE-8: db/ の整理（優先度：低）

- [ ] `db/migrations/`, `db/seeds/` にサブフォルダ分け
- [ ] タイムスタンプ付き命名規則の導入

### BE-9: domain/rule-engine/ と domain/journal/ の境界整理（優先度：低）

- [ ] `journal-pipeline.service.ts` 作成済み。generator.strategy.ts を統合して削除
- [ ] rule-engine/ は純粋なマッチングロジックのみに限定

### BE-将来課題

- [ ] correction hints の SQL GROUP BY 最適化（Supabase RPC 関数の DB マイグレーション要）
- [ ] 6つのルートファイルの残り try-catch を asyncHandler に移行

---

## フロントエンド残タスク

### FE-1: window.alert/confirm → useConfirm/Toast 置換 ✅ 完了

12ファイル21箇所の window.confirm を useConfirm に置換完了。

- [ ] `useReviewActions.ts` の2箇所 — hook内のため useConfirm 不可。将来対応

### FE-2: マスタ系ページへの共通hooks適用（優先度：中）

- [ ] `AccountsPage.tsx` — useCrud + useModal に置換
- [ ] `SuppliersPage.tsx` — 同上
- [ ] `ItemsPage.tsx` — 同上

### FE-3: ステータス定数の全ページ適用（優先度：低）

- [ ] 全ページのステータスバッジ表示を定数参照に置換

### FE-4: button type + label htmlFor の全ファイル適用（優先度：低）

- [ ] 残りの `<button>` への `type="button"` 追加
- [ ] 全フォームの `<label htmlFor>` と `<input id>` 紐づけ

### FE-5: インラインスタイル + デザイントークン適用 ✅ 完了

- [x] fadeSlideUp アニメーションを CSS クラス化（5レイアウト）
- [x] minHeight/minWidth/background の固定値を Tailwind クラスに置換（15箇所）
- [ ] 動的値（width: ${%}）と writingMode は Tailwind 不可のため残存（7箇所）
- [ ] `index.css` の `.btn-primary` 等をデザイントークン参照に更新（後続対応）

### FE-6: workflow/ feature の肥大化対策（優先度：低）

- [ ] review/ をサブ feature として分離検討
- [ ] または現状維持で、ファイル名規則で管理

---

## 検証方法（共通）

1. `npx tsc --noEmit` — TypeScript コンパイルエラーなし
2. 全画面の手動操作確認
3. ブラウザコンソールにエラーなし
