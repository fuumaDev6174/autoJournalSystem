# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# タスク: workflowStorage.ts の supabase.from() をバックエンドAPI経由に変更
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 重要度: 中
# 理由: workflowStorage.ts がフロントから supabase.from('workflows') を
#       直接呼んでいる最後のファイル。
#       backend.api.ts に workflowsApi が既に定義済みなので、そちらに切替可能。
#       これが完了すれば、フロントの supabase 使用は認証（auth）のみになる。

## ファイル: src/web/features/workflow/hooks/workflowStorage.ts
## （または src/client/lib/workflowStorage.ts — 実際の配置場所に応じて）

### 変更内容:

変更前（import部分）:
```typescript
import { supabase } from './supabase';
```

変更後:
```typescript
import { workflowsApi } from '@/web/shared/lib/api/backend.api';
```

### 各関数の置換パターン:

#### getByClient:
変更前:
```typescript
const { data, error } = await supabase
  .from('workflows')
  .select('*')
  .eq('client_id', clientId)
  .eq('status', 'in_progress')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();
```
変更後:
```typescript
const { data: list, error } = await workflowsApi.getAll({ client_id: clientId, status: 'in_progress' });
const data = list && list.length > 0 ? list[0] : null;
```

#### getById:
変更前:
```typescript
const { data, error } = await supabase
  .from('workflows')
  .select('*')
  .eq('id', id)
  .single();
```
変更後:
```typescript
const { data, error } = await workflowsApi.getAll({ client_id: undefined });
const found = (data || []).find((w: any) => w.id === id) || null;
```
※ workflows_crud.ts にGET /api/workflows/:id がない場合は追加するか、
  上記のようにフィルタで代用。

#### create:
変更前:
```typescript
await supabase.from('workflows').update({ status: 'cancelled' }).eq('client_id', clientId).eq('status', 'in_progress');
const { data, error } = await supabase.from('workflows').insert({ ... }).select().single();
```
変更後:
```typescript
await workflowsApi.cancel(existingWorkflowId);  // 既存があればキャンセル
const { data, error } = await workflowsApi.create({ client_id: clientId, current_step: 1, completed_steps: [], status: 'in_progress', data: {} });
```

#### update:
変更前:
```typescript
const { data, error } = await supabase.from('workflows').update(dbUpdates).eq('id', id).select().single();
```
変更後:
```typescript
const { data, error } = await workflowsApi.update(id, dbUpdates);
```

#### complete:
変更前:
```typescript
const { error } = await supabase.from('workflows').update({ status: 'completed', ... }).eq('id', id);
```
変更後:
```typescript
const { error } = await workflowsApi.complete(id, completedBy);
```

#### cancel:
変更前:
```typescript
const { error } = await supabase.from('workflows').update({ status: 'cancelled' }).eq('id', id);
```
変更後:
```typescript
const { error } = await workflowsApi.cancel(id);
```

### 変更後の確認:
```bash
grep -n "supabase" src/web/features/workflow/hooks/workflowStorage.ts
# または
grep -n "supabase" src/client/lib/workflowStorage.ts
```
何もヒットしなければ成功。
```bash
npm run build
```