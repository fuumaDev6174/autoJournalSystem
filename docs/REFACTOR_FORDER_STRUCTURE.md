# フォルダ構成改善タスク

> 優先度：低（Phase A完成後に対応）  
> 目的：レイヤー間の一貫性を高め、不要になった設計を整理する  
> 前提：SaaS → 社内システムに変更済み。マルチテナント不要。  
> 最終精査：2026-04-10

---

## 1. identity/ モジュールの解体（優先度：中）

### 現状の問題
`src/modules/identity/` は型定義ファイル2つだけで、ビジネスロジックが存在しない。
modules/ は「機能を実装するモジュール」の場所であり、型定義だけのディレクトリは shared/types/ に属すべき。
さらに `tenant.types.ts` はマルチテナント前提の設計であり、社内システムでは不要。

### 現在の参照状況（2026-04-10 調査済み）

| ファイル | 参照元 | 状態 |
|---------|--------|------|
| `role.types.ts` | `src/api/middleware/rbac.middleware.ts` のみ（1箇所） | 移動可能 |
| `tenant.types.ts` | **参照なし**（自身の定義のみ） | **削除可能** |

### 作業内容

**tenant.types.ts → 削除**
```
削除: src/modules/identity/tenant.types.ts
理由: TenantContext はどこからも参照されていない。マルチテナント構想は消滅済み。
```

**role.types.ts → shared/types/ に移動**
```
移動元: src/modules/identity/role.types.ts
移動先: src/shared/types/role.types.ts
```
- `src/api/middleware/rbac.middleware.ts` の import パスを更新
- `src/shared/types/index.ts` に re-export を追加

**ディレクトリ削除**
```
削除: src/modules/identity/（上記2ファイルの移動/削除後）
```

---

## 2. validation.service.ts の移動（優先度：中）

### 現状の問題
バリデーションロジックが3箇所に分散している:
- `src/core/validation/amount-validator.ts` — 金額バリデーション（純粋関数）
- `src/core/validation/date-validator.ts` — 日付バリデーション（純粋関数）
- `src/server/services/validation.service.ts` — 貸借バランスチェック + re-export集約

`server/` はエントリーポイント（Express起動）だけを置く場所。
ビジネスバリデーションのロジックが server/ にあると、
「バリデーションを探すとき core/ を見るのか server/ を見るのか分からない」問題が発生する。

### 現在の参照状況（2026-04-10 調査済み）

| 参照元 | インポート内容 |
|--------|---------------|
| `src/api/routes/journals.route.ts` | `validateDebitCreditBalance` |
| `src/api/routes/validation.route.ts` | `validateJournalBalance` |

### validation.service.ts の中身（2026-04-10 確認済み）

```
実装内容:
  - validateDebitCreditBalance() — 貸借バランスチェック（純粋関数）
  - validateJournalBalance() — 仕訳バランス検証
  - re-export: duplicate-checker, supplier-matcher の型と関数

判定: 貸借バランスチェックは純粋関数 → core/validation/ に移動が適切
      re-export 部分は呼び出し元から直接 import に変更
```

### 作業内容

**validateDebitCreditBalance を core/ に移動**
```
移動元: src/server/services/validation.service.ts
移動先: src/core/validation/balance-validator.ts
```

**re-export を直接 import に変更**
- `journals.route.ts` — `import { validateDebitCreditBalance } from '../../core/validation/balance-validator.js'`
- `validation.route.ts` — 同上 + duplicate-checker/supplier-matcher を直接 import

**server/services/ ディレクトリ削除**
```
削除: src/server/services/validation.service.ts
削除: src/server/services/（ディレクトリ自体）
→ server/ は index.ts のみのフラットな構造になる
```

---

## 3. supabase.client.ts のフロントエンド側への移動（優先度：低）

### 現状の問題
`src/adapters/supabase/supabase.client.ts` はフロントエンド専用（認証用）だが、
adapters/ はバックエンドのレイヤー。フロントエンドが adapters/ を参照しているのは
レイヤー違反。

### 現在の参照状況（2026-04-10 調査済み）

| 参照元 | インポート内容 |
|--------|---------------|
| `src/web/app/layouts/Sidebar.tsx` | `auth` |
| `src/web/app/providers/AuthProvider.tsx` | `supabase` |
| `src/web/features/approvals/pages/ApprovalsPage.tsx` | `supabase` |
| `src/web/features/auth/pages/LoginPage.tsx` | `auth` |
| `src/web/features/workflow/pages/UploadOnlyPage.tsx` | `auth` |
| `src/web/shared/lib/api/backend.api.ts` | `supabase` |
| **src/api/ や src/modules/ からの参照** | **なし** — サーバー側は supabase-admin.client.ts を使用 |

### 作業内容

**supabase.client.ts を web/shared/lib/ に移動**
```
移動元: src/adapters/supabase/supabase.client.ts
移動先: src/web/shared/lib/supabase.ts
```

**インポートパスの更新（6箇所）**
```
変更前: import { supabase } from '@/adapters/supabase/supabase.client'
変更後: import { supabase } from '@/web/shared/lib/supabase'

変更前: import { auth } from '@/adapters/supabase/supabase.client'
変更後: import { auth } from '@/web/shared/lib/supabase'
```

対象ファイル:
1. `src/web/app/layouts/Sidebar.tsx`
2. `src/web/app/providers/AuthProvider.tsx`
3. `src/web/features/approvals/pages/ApprovalsPage.tsx`
4. `src/web/features/auth/pages/LoginPage.tsx`
5. `src/web/features/workflow/pages/UploadOnlyPage.tsx`
6. `src/web/shared/lib/api/backend.api.ts`

**adapters/supabase/ の後始末**
- supabase.client.ts 削除後、adapters/supabase/ には以下が残る:
  - `supabase-admin.client.ts` — サーバー用（RLSバイパス）→ そのまま
  - `supabase.debug.ts` — デバッグ用 → そのまま

---

## 確認用コマンド（作業前に実行）

```bash
# 1. identity/ の参照確認
grep -rn "identity/role" src/ --include="*.ts" --include="*.tsx"
grep -rn "identity/tenant\|TenantContext" src/ --include="*.ts" --include="*.tsx"

# 2. validation.service の参照確認
grep -rn "validation\.service" src/ --include="*.ts"

# 3. supabase.client の参照確認（フロントエンド側）
grep -rn "supabase\.client\|supabase/supabase" src/web/ --include="*.ts" --include="*.tsx"

# 4. サーバー側が supabase.client を参照していないことを確認
grep -rn "supabase\.client" src/api/ src/modules/ --include="*.ts"
```

---

## やらないこと（意図的にスキップ）

- **api/routes/crud/ の15ファイル統合** — 動いているものを壊すリスクが高い。各ファイルが十分に小さい（2.5〜8.5KB）ため現状維持。
- **RLSポリシーの簡略化** — 社内システムになったが、Supabase側の設定でありコードベースの改修ではない。将来の申請制機能で権限分離が必要になる可能性もあるため保留。
- **rbac.middleware.ts の削除** — 社内システムでも4ロール（admin/manager/operator/viewer）の権限分離は有用。申請制機能で使う予定あり。
- **shared/constants/ と web/shared/constants/ の統合** — バックエンド用（accounting.ts）とフロントエンド用（statuses.ts, keyboard.ts, ui.ts）で用途が異なるため分離を維持。
- **shared/errors/ の拡張** — AppError 系は十分機能している。フロントエンド用エラー型は必要になった時点で追加。
