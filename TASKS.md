# TASKS-industry-centric.md — 業種中心のルール管理UI改修
# ============================================================
# このシステムの核心: 「顧客の業種」がルール適用の最も重要な軸。
# 個人事業主向けなので、業種によって「何が経費になるか」「按分率は何%か」が決まる。
# 取引先は勘定科目の特定を助ける補助情報。
#
# 変更内容:
#   1. 名称変更: 「業種管理」→「顧客業種管理」
#   2. industries.tsx: 業種選択時にルール適用状況を表示
#   3. industries.tsx: 業種別の按分率テンプレート表示
#   4. clients.tsx: 顧客詳細に「ルール設定」タブを追加
#   5. Layout.tsx: サイドバーのメニュー構成変更
#
# DB変更: なし（既存のprocessing_rulesとindustries/clientsで実現）
# ============================================================


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# タスク1: 名称変更「業種管理」→「顧客業種管理」
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 全ファイルを横断して名称を変更する。

### ファイル: src/client/components/layout/Layout.tsx

91行目付近:
```
変更前: { label: '業種管理', icon: <Briefcase size={16} />, path: '/master/industries' },
変更後: { label: '顧客業種管理', icon: <Briefcase size={16} />, path: '/master/industries' },
```

さらに、Layout.tsxのサイドバー構成を以下のように再編成:

```typescript
  const masterSubGroups = [
    {
      key: 'master_仕訳ルール',
      label: '仕訳ルール',
      items: [
        { label: 'ルール管理',     icon: <List size={16} />,       path: '/master/rules' },
        { label: '顧客業種管理',   icon: <Briefcase size={16} />,  path: '/master/industries' },
        { label: '取引先マスタ',   icon: <Store size={16} />,      path: '/master/suppliers' },
      ],
    },
    {
      key: 'master_設定',
      label: '設定',
      items: [
        { label: '勘定科目',       icon: <List size={16} />,       path: '/master/accounts' },
        { label: '税区分・適用税率', icon: <Receipt size={16} />,   path: '/master/tax-categories' },
        { label: '品目マスタ',     icon: <Package size={16} />,    path: '/master/items' },
        { label: 'ユーザー権限',   icon: <User size={16} />,       path: '/settings' },
      ],
    },
  ];
```

変更理由:
- 「仕訳ルール」グループにルール管理・顧客業種管理・取引先マスタを集約（この3つが仕訳ルールの核心）
- 「設定」グループに勘定科目・税区分・品目・ユーザーを集約（低頻度で変更するマスタ）
- 「タグ管理」グループ名を廃止（タグは既に削除済み）

### ファイル: src/client/pages/master/industries.tsx

ページタイトル（198行目付近）:
```
変更前: <h1 className="text-2xl font-bold text-gray-900">業種管理</h1>
変更後: <h1 className="text-2xl font-bold text-gray-900">顧客業種管理</h1>
```

説明文（199行目付近）:
```
変更前: {maxLevel + 1}階層構成（...）
変更後: 業種ごとの仕訳ルール・按分率を管理します（{maxLevel + 1}階層）
```


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# タスク2: industries.tsx — 業種選択時にルール適用状況を表示
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ファイル: src/client/pages/master/industries.tsx

### 変更2-A: ルールデータのstate追加

既存のstate定義の近くに追加:

```typescript
const [industryRules, setIndustryRules] = useState<Array<{
  id: string;
  rule_name: string;
  priority: number;
  scope: string;
  conditions: any;
  actions: any;
  is_active: boolean;
}>>([]);
const [sharedRules, setSharedRules] = useState<Array<{
  id: string;
  rule_name: string;
  priority: number;
  conditions: any;
  actions: any;
  is_active: boolean;
}>>([]);
const [accountItems, setAccountItems] = useState<Array<{ id: string; name: string; code: string }>>([]);
```

### 変更2-B: loadData に汎用ルールと勘定科目の取得を追加

loadData関数のPromise.allに追加:

```typescript
const [indRes, clientRes, rulesRes, accountsRes] = await Promise.all([
  supabase.from('industries').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
  supabase.from('clients').select('id, industry_id'),
  supabase.from('processing_rules').select('id, rule_name, priority, scope, industry_id, conditions, actions, is_active').eq('is_active', true).order('priority'),
  supabase.from('account_items').select('id, name, code').eq('is_active', true).order('code'),
]);

// 汎用ルール（scope=shared）を保存
if (rulesRes.data) {
  setSharedRules(rulesRes.data.filter((r: any) => r.scope === 'shared'));
}
if (accountsRes.data) setAccountItems(accountsRes.data);
```

### 変更2-C: 業種選択時にその業種のルールをフィルタ

selectedIdが変更された時にルールを更新するuseEffect:

```typescript
useEffect(() => {
  if (!selectedId) { setIndustryRules([]); return; }
  const loadRules = async () => {
    // この業種と全祖先に適用される業種別ルールを取得
    // industry_closureを使って祖先IDを取得
    const { data: closureData } = await supabase
      .from('industry_closure')
      .select('ancestor_id, depth')
      .eq('descendant_id', selectedId);

    const ancestorIds = [selectedId, ...(closureData?.map(c => c.ancestor_id) || [])];

    const { data: rules } = await supabase
      .from('processing_rules')
      .select('id, rule_name, priority, scope, industry_id, conditions, actions, is_active')
      .eq('scope', 'industry')
      .in('industry_id', ancestorIds)
      .eq('is_active', true)
      .order('priority');

    setIndustryRules(rules || []);
  };
  loadRules();
}, [selectedId]);
```

### 変更2-D: 右パネルの詳細表示にルール一覧セクションを追加

右パネル（selectedNodeの詳細表示部分）の、子項目一覧の前に以下を追加:

```tsx
              {/* 適用される仕訳ルール */}
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  仕訳ルール
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    業種別 {industryRules.length}件 + 汎用 {sharedRules.length}件
                  </span>
                </h3>

                {/* 業種別ルール */}
                {industryRules.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-cyan-700 font-medium mb-1.5">この業種のルール</p>
                    <div className="space-y-1.5">
                      {industryRules.map(rule => {
                        const acctName = accountItems.find(a => a.id === rule.actions?.account_item_id)?.name || '-';
                        const ratio = rule.actions?.business_ratio ? Math.round(Number(rule.actions.business_ratio) * 100) : null;
                        return (
                          <div key={rule.id} className="flex items-center justify-between bg-cyan-50 rounded-lg p-2.5 border border-cyan-100">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{rule.rule_name}</div>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {rule.conditions?.supplier_pattern && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">取引先: {rule.conditions.supplier_pattern}</span>
                                )}
                                {rule.conditions?.item_pattern && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">品目: {rule.conditions.item_pattern}</span>
                                )}
                                {rule.conditions?.transaction_pattern && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">摘要: {rule.conditions.transaction_pattern}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                              <span className="text-xs font-medium text-gray-700">→ {acctName}</span>
                              {ratio != null && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ratio === 100 ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
                                  按分{ratio}%
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 汎用ルール（折りたたみ） */}
                <details className="group">
                  <summary className="text-xs text-green-700 font-medium cursor-pointer hover:underline">
                    汎用ルール（{sharedRules.length}件）を表示
                  </summary>
                  <div className="mt-1.5 space-y-1">
                    {sharedRules.map(rule => {
                      const acctName = accountItems.find(a => a.id === rule.actions?.account_item_id)?.name || '-';
                      return (
                        <div key={rule.id} className="flex items-center justify-between bg-green-50/50 rounded p-2 text-xs">
                          <span className="text-gray-700 truncate">{rule.rule_name}</span>
                          <span className="text-gray-500 flex-shrink-0 ml-2">→ {acctName}</span>
                        </div>
                      );
                    })}
                  </div>
                </details>

                {/* ルールが0件の場合 */}
                {industryRules.length === 0 && sharedRules.length === 0 && (
                  <div className="text-center py-4 text-gray-400">
                    <p className="text-sm mb-1">この業種にルールが設定されていません</p>
                    <button onClick={() => window.location.href = '/master/rules'}
                      className="text-sm text-blue-600 hover:underline">+ ルールを追加</button>
                  </div>
                )}
              </div>
```

### 変更2-E: サマリーカードに「ルール数」を追加

右パネルのサマリーカード（270〜273行目付近の3枚のカード）に1枚追加:

変更前: `grid-cols-3`
変更後: `grid-cols-4`

4枚目のカードを追加:
```tsx
<div className="bg-cyan-50 rounded-lg p-3">
  <div className="text-xl font-bold text-cyan-600">{industryRules.length}</div>
  <div className="text-xs text-gray-500">業種ルール</div>
</div>
```


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# タスク3: industries.tsx — 業種別の按分率テンプレート表示
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ファイル: src/client/pages/master/industries.tsx

### 変更3-A: ルール一覧セクションの下に按分率テンプレート一覧を追加

industryRulesからbusiness_ratioが設定されているルールを抽出して表示:

```tsx
              {/* 按分率テンプレート */}
              {(() => {
                const ratioRules = industryRules.filter(r => r.actions?.business_ratio != null);
                if (ratioRules.length === 0) return null;
                return (
                  <div className="mb-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">按分率テンプレート</h3>
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">勘定科目</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">条件</th>
                            <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase">事業用%</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">根拠</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {ratioRules.map(rule => {
                            const acctName = accountItems.find(a => a.id === rule.actions?.account_item_id)?.name || '-';
                            const ratio = Math.round(Number(rule.actions.business_ratio) * 100);
                            return (
                              <tr key={rule.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-sm font-medium text-gray-900">{acctName}</td>
                                <td className="px-3 py-2 text-xs text-gray-500">
                                  {rule.conditions?.supplier_pattern || rule.conditions?.item_pattern || rule.conditions?.transaction_pattern || '全取引'}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                                    ratio === 100 ? 'bg-blue-100 text-blue-700' :
                                    ratio >= 70 ? 'bg-green-100 text-green-700' :
                                    ratio >= 40 ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-orange-100 text-orange-700'
                                  }`}>{ratio}%</span>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">{rule.actions?.business_ratio_note || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">
                      按分率はルール管理画面で変更できます。ここでは閲覧のみ。
                    </p>
                  </div>
                );
              })()}
```


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# タスク4: clients.tsx — 顧客詳細に「ルール設定」セクションを追加
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ファイル: src/client/pages/clients.tsx

### 変更4-A: 顧客の行クリック時にルール詳細モーダルを表示

現在は顧客行をクリックするとワークフロー開始（handleStart）に遷移する。
これに加えて、顧客の「ルール設定」を確認できるモーダルまたは展開パネルを追加。

### 方針: テーブルの「編集/削除」列の横に「ルール」ボタンを追加

```tsx
<button onClick={(e) => { e.stopPropagation(); openClientRules(client); }}
  className="p-1.5 text-cyan-600 hover:bg-cyan-50 rounded" title="ルール設定">
  <Briefcase size={16} />
</button>
```

### 変更4-B: ルール設定モーダルのstateとロジック

```typescript
const [showRulesModal, setShowRulesModal] = useState(false);
const [selectedClient, setSelectedClient] = useState<ClientWithIndustry | null>(null);
const [clientRules, setClientRules] = useState<{
  clientSpecific: any[];  // scope=client のルール
  industryRules: any[];   // scope=industry（この顧客の業種に適用）
  sharedRules: any[];     // scope=shared
}>({ clientSpecific: [], industryRules: [], sharedRules: [] });
const [clientAccountItems, setClientAccountItems] = useState<Array<{ id: string; name: string; code: string }>>([]);
const [clientRatios, setClientRatios] = useState<Array<{ account_item_id: string; business_ratio: number }>>([]);

const openClientRules = async (client: ClientWithIndustry) => {
  setSelectedClient(client);

  // 勘定科目マスタ
  const { data: accounts } = await supabase.from('account_items').select('id, name, code').eq('is_active', true).order('code');
  if (accounts) setClientAccountItems(accounts);

  // 全ルール取得
  const { data: allRules } = await supabase
    .from('processing_rules')
    .select('id, rule_name, priority, scope, industry_id, client_id, conditions, actions, is_active')
    .eq('is_active', true)
    .order('priority');

  if (allRules) {
    // 顧客別ルール
    const clientSpecific = allRules.filter(r => r.scope === 'client' && r.client_id === client.id);

    // 業種別ルール（この顧客の業種に適用）
    let industryRules: any[] = [];
    if (client.industry_id) {
      // industry_closureから祖先IDを取得
      const { data: closure } = await supabase
        .from('industry_closure')
        .select('ancestor_id')
        .eq('descendant_id', client.industry_id);
      const ancestorIds = [client.industry_id, ...(closure?.map(c => c.ancestor_id) || [])];
      industryRules = allRules.filter(r => r.scope === 'industry' && ancestorIds.includes(r.industry_id));
    }

    // 汎用ルール
    const sharedRules = allRules.filter(r => r.scope === 'shared');

    setClientRules({ clientSpecific, industryRules, sharedRules });
  }

  // 家事按分率
  const { data: ratios } = await supabase
    .from('client_account_ratios')
    .select('account_item_id, business_ratio')
    .eq('client_id', client.id);
  setClientRatios(ratios || []);

  setShowRulesModal(true);
};
```

### 変更4-C: ルール設定モーダルのUI

```tsx
<Modal isOpen={showRulesModal} onClose={() => setShowRulesModal(false)}
  title={`${selectedClient?.name || ''} のルール設定`} size="xl">
  <div className="space-y-5 max-h-[70vh] overflow-y-auto">

    {/* 顧客情報サマリー */}
    <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-4">
      <div>
        <span className="text-sm font-bold text-gray-900">{selectedClient?.name}</span>
        <span className="text-xs text-gray-500 ml-2">
          業種: {selectedClient?.industry?.name || '未設定'}
        </span>
      </div>
      <div className="flex gap-2 ml-auto">
        <span className="text-[10px] px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
          顧客別 {clientRules.clientSpecific.length}件
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-100 text-cyan-700 font-medium">
          業種別 {clientRules.industryRules.length}件
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">
          汎用 {clientRules.sharedRules.length}件
        </span>
      </div>
    </div>

    {/* 顧客専用ルール */}
    <div>
      <h3 className="text-sm font-semibold text-violet-700 mb-2 flex items-center gap-2">
        顧客専用ルール
        <button onClick={() => window.location.href = '/master/rules'}
          className="text-[10px] text-blue-600 hover:underline font-normal">+ 追加</button>
      </h3>
      {clientRules.clientSpecific.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">顧客専用ルールはありません</p>
      ) : (
        <div className="space-y-1.5">
          {clientRules.clientSpecific.map(rule => {
            const acctName = clientAccountItems.find(a => a.id === rule.actions?.account_item_id)?.name || '-';
            const ratio = rule.actions?.business_ratio ? Math.round(Number(rule.actions.business_ratio) * 100) : null;
            return (
              <div key={rule.id} className="flex items-center justify-between bg-violet-50 rounded-lg p-2.5 border border-violet-100">
                <div>
                  <div className="text-sm font-medium text-gray-900">{rule.rule_name}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {rule.conditions?.supplier_pattern && `取引先: ${rule.conditions.supplier_pattern}`}
                    {rule.conditions?.item_pattern && ` 品目: ${rule.conditions.item_pattern}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-700">→ {acctName}</span>
                  {ratio != null && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ratio === 100 ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
                      {ratio}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* 家事按分率一覧 */}
    {clientRatios.length > 0 && (
      <div>
        <h3 className="text-sm font-semibold text-orange-700 mb-2">家事按分設定</h3>
        <div className="grid grid-cols-2 gap-2">
          {clientRatios.map(r => {
            const acctName = clientAccountItems.find(a => a.id === r.account_item_id)?.name || '-';
            const pct = Math.round(Number(r.business_ratio) * 100);
            return (
              <div key={r.account_item_id} className={`rounded-lg p-2 border text-sm ${pct === 100 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                <span className="font-medium text-gray-900">{acctName}</span>
                <span className={`ml-2 font-bold ${pct === 100 ? 'text-blue-700' : 'text-orange-700'}`}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {/* 業種別ルール（折りたたみ） */}
    <details open>
      <summary className="text-sm font-semibold text-cyan-700 cursor-pointer hover:underline">
        業種別ルール（{clientRules.industryRules.length}件）
      </summary>
      <div className="mt-2 space-y-1">
        {clientRules.industryRules.map(rule => {
          const acctName = clientAccountItems.find(a => a.id === rule.actions?.account_item_id)?.name || '-';
          return (
            <div key={rule.id} className="flex items-center justify-between bg-cyan-50/50 rounded p-2 text-xs">
              <span className="text-gray-700">{rule.rule_name}</span>
              <span className="text-gray-500">→ {acctName}</span>
            </div>
          );
        })}
      </div>
    </details>

    {/* 汎用ルール（折りたたみ） */}
    <details>
      <summary className="text-sm font-semibold text-green-700 cursor-pointer hover:underline">
        汎用ルール（{clientRules.sharedRules.length}件）
      </summary>
      <div className="mt-2 space-y-1">
        {clientRules.sharedRules.map(rule => {
          const acctName = clientAccountItems.find(a => a.id === rule.actions?.account_item_id)?.name || '-';
          return (
            <div key={rule.id} className="flex items-center justify-between bg-green-50/50 rounded p-2 text-xs">
              <span className="text-gray-700">{rule.rule_name}</span>
              <span className="text-gray-500">→ {acctName}</span>
            </div>
          );
        })}
      </div>
    </details>

  </div>
</Modal>
```

### 変更4-D: import追加

clients.tsxのlucide-react importに `Briefcase` を追加。
Modalのimportを追加（既にある場合はそのまま）。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# タスク5: ルールの優先順位表示を明確にする
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 概要
clients.tsxのルール設定モーダルとindustries.tsxのルール一覧で、
「どのルールが優先されるか」が視覚的にわかるようにする。

### 表示ルール:
- 顧客専用（scope=client）: 紫 + 「最優先」バッジ
- 業種別（scope=industry）: シアン + 「優先度{N}」バッジ
- 汎用（scope=shared）: 緑 + 「基本」バッジ

各セクションのヘッダーに優先順位の説明を追加:

```tsx
<p className="text-[10px] text-gray-400 mt-1">
  適用優先順位: 顧客専用（最優先）→ 業種別 → 汎用（最低優先）
</p>
```

同一スコープ内のルールは priority 値順で表示（既にorder('priority')しているはず）。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 完了チェックリスト
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. `npx tsc --noEmit` でコンパイルエラーがないこと
2. Layout.tsx: サイドバーに「顧客業種管理」と表示されること（「業種管理」ではない）
3. Layout.tsx: サイドバーが「仕訳ルール」「設定」の2グループに再編されること
4. industries.tsx: ページタイトルが「顧客業種管理」であること
5. industries.tsx: 業種選択時に業種別ルール + 汎用ルールが表示されること
6. industries.tsx: 按分率テンプレートが表形式で表示されること
7. industries.tsx: サマリーカードに「業種ルール」件数が表示されること
8. clients.tsx: 顧客テーブルに「ルール」ボタンが表示されること
9. clients.tsx: ルール設定モーダルに3層（顧客専用/業種別/汎用）が表示されること
10. clients.tsx: 家事按分設定一覧が表示されること
11. 優先順位の説明テキストが各所に表示されること