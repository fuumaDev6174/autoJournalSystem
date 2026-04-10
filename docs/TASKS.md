# タスク管理

> 完了タスクは1行サマリーのみ。未完了は詳細記載。

---

## 完了済み

- ✅ BE-1: master-data.ts 解体（19ファイル直接import化）
- ✅ BE-2: journal.generate.ts → パイプラインサービス抽出（380行→50行）
- ✅ BE-3: journal.crud.ts 分割（252行→3ファイル）
- ✅ BE-4: document.ocr.ts → パイプラインサービス抽出（143行→31行）
- ✅ BE-5: supabase.debug.ts をweb/に移動
- ✅ BE-7: shared/constants/accounting.ts → domain/journal/ に移動
- ✅ BE-8: db/ をmigrations/seeds/に整理
- ✅ BE-9: generator.strategy.ts 削除（pipeline に統合済み）
- ✅ FE-1: window.confirm → useConfirm（12ファイル21箇所）
- ✅ FE-3: ステータス定数適用（ReviewPage, MultiEntryPanel, ReviewDataContext）
- ✅ FE-4: 全94 button に type="button" 追加
- ✅ FE-5: インラインスタイル15箇所 → Tailwind + fadeSlideUp CSS化

---

## 意図的にスキップ

### BE-6: models.ts の分散

`@/types` が全ファイルから参照されるバレルファイルとして機能している。分散しても re-export が必要になり、ファイル数が増えるだけで実質的なメリットがない。現状維持。

### FE-6: workflow/ feature の分離

44ファイルが1つの feature に集中しているが、context/sections/layouts/doc-specific の内部構造は整理済み。無理に分離するとimportパスが深くなるだけ。現状維持。

---

## 未完了（低〜中優先）

### FE-2: マスタ系ページへの共通hooks適用（優先度：中）

useCrud, useModal, useSearchFilter は作成済み。適用すると各ページを300行程度に削減可能。

- [ ] `AccountsPage.tsx` (626行) — useCrud + useModal に置換
- [ ] `SuppliersPage.tsx` — 同上
- [ ] `ItemsPage.tsx` — 同上

### 将来課題

- [ ] correction hints の SQL GROUP BY 最適化（DB マイグレーション要）
- [ ] 6つのルートファイルの残り try-catch を asyncHandler に移行
- [ ] useReviewActions.ts の2箇所の window.confirm（hook内のため useConfirm 不可）
- [ ] index.css の .btn-primary 等をデザイントークン参照に更新

---

## 検証方法（共通）

1. `npx tsc --noEmit` — TypeScript コンパイルエラーなし
2. 全画面の手動操作確認
3. ブラウザコンソールにエラーなし
