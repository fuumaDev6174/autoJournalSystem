# TASKS: 仕訳ルール管理 大改修

## 参照ファイル

実装時に以下のファイルを参照すること:

- **`docs/rules-mockup-v3.jsx`** — UIモックアップ（5画面の完全なインタラクティブプロトタイプ）。  
  各画面の色分け（汎用=グレー、業種別=薄青、顧客別=薄赤）、アコーディオン展開、  
  派生ルール表示、トグルスイッチ、パンくず等のUI仕様はこのファイルが正。  
  Tailwind CSSで書き直す際の見た目・レイアウト・インタラクションの参考にすること。

- **`migration-rules-redesign.sql`** — DBマイグレーションSQL（Step 1で使用）

- **`ClientList.tsx`** / **`ClientDetail.tsx`** — 完成済みのコンポーネント。  
  `src/client/pages/master/rules/` にコピーして配置すること。

## 実行順序
1. DBマイグレーション（Supabase SQL Editor で手動実行 — Claude Codeはスキップ）
2. types/index.ts 修正
3. server/services.ts 修正
4. server/api.ts 修正
5. フロントエンド新規ファイル4つ作成
6. main.tsx ルーティング追加
7. Layout.tsx サイドバー修正
8. 既存ページ波及修正（industries.tsx, review.tsx）

---

## 1. DBマイグレーション

Supabase SQL Editor で `migration-rules-redesign.sql` を実行する。
（別ファイルとして提供済み。Claude Codeはこのステップをスキップ。）

---

## 2. types/index.ts 修正

### Industry 型を修正（parent_id, level 削除）:

```typescript
export interface Industry {
  id: string;
  code: string;
  name: string;
  description: string | null;
  // parent_id 削除
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### Rule 型に derived_from_rule_id を追加:

```typescript
export interface Rule {
  // ... 既存フィールド全て維持
  derived_from_rule_id: string | null;  // ← 追加
  // ... JOINリレーション
  derived_from?: Rule;  // ← 追加（JOIN結果）
}
```

---

## 3. server/services.ts 修正

### 3-1. RuleMatchInput の変更

**ファイル内の位置:** `export interface RuleMatchInput` （約821行）

変更前:
```typescript
export interface RuleMatchInput {
  supplier: string;
  amount: number;
  description?: string;
  client_id: string;
  industry_ids: string[];
  industry_ids_with_ancestors: string[];
  industry_depths: Map<string, number>;
  // ... 残り全てそのまま
}
```

変更後:
```typescript
export interface RuleMatchInput {
  supplier: string;
  amount: number;
  description?: string;
  client_id: string;
  industry_ids: string[];  // フラット業種IDのみ（N階層廃止）
  // industry_ids_with_ancestors 削除
  // industry_depths 削除
  payment_method?: string | null;
  item_name?: string | null;
  document_type?: string | null;
  has_invoice_number?: boolean | null;
  tax_rate_hint?: number | null;
  is_internal_tax?: boolean | null;
  frequency_hint?: string | null;
  tategaki?: string | null;
  withholding_tax_amount?: number | null;
  invoice_qualification?: string | null;
  addressee?: string | null;
  transaction_type?: string | null;
  transfer_fee_bearer?: string | null;
}
```

### 3-2. matchProcessingRules の簡素化

**ファイル内の位置:** `export function matchProcessingRules(` （約950行）

industry scope のフィルタとソートを変更:

変更前:
```typescript
  const industryRules = activeRules
    .filter(r => r.scope === 'industry' && r.industry_id && input.industry_ids_with_ancestors.includes(r.industry_id))
    .sort((a, b) => {
      const depthA = input.industry_depths.get(a.industry_id!) ?? 999;
      const depthB = input.industry_depths.get(b.industry_id!) ?? 999;
      if (depthA !== depthB) return depthA - depthB;
      return a.priority - b.priority;
    });
```

変更後:
```typescript
  const industryRules = activeRules
    .filter(r => r.scope === 'industry' && r.industry_id && input.industry_ids.includes(r.industry_id))
    .sort((a, b) => a.priority - b.priority);
```

ログメッセージも変更:
```typescript
// 変更前:
console.log(`[ルールマッチ] ✅ マッチ: "${rule.rule_name}" (priority=${rule.priority}, scope=${rule.scope}, industry_depth=${rule.industry_id ? input.industry_depths.get(rule.industry_id) : 'N/A'})`);
// 変更後:
console.log(`[ルールマッチ] ✅ マッチ: "${rule.rule_name}" (priority=${rule.priority}, scope=${rule.scope})`);
```

### 3-3. matchProcessingRulesWithCandidates も同様に修正

**ファイル内の位置:** 約1049行

変更前:
```typescript
  const industryRules = activeRules
    .filter(r => r.scope === 'industry' && r.industry_id && input.industry_ids_with_ancestors.includes(r.industry_id))
    .sort((a, b) => {
      const depthA = input.industry_depths.get(a.industry_id!) ?? 999;
      const depthB = input.industry_depths.get(b.industry_id!) ?? 999;
      if (depthA !== depthB) return depthA - depthB;
      return a.priority - b.priority;
    });
```

変更後:
```typescript
  const industryRules = activeRules
    .filter(r => r.scope === 'industry' && r.industry_id && input.industry_ids.includes(r.industry_id))
    .sort((a, b) => a.priority - b.priority);
```

---

## 4. server/api.ts 修正

### 4-1. `/journal-entries/generate` の industry_closure 遡りロジック削除

**ファイル内の位置:** 約608〜630行

変更前の該当ブロック全体を削除:
```typescript
    // industry_closure で全祖先IDを取得（階層遡り）
    let industryIdsWithAncestors: string[] = [...industryIds];
    const industryDepths = new Map<string, number>();
    
    if (industryIds.length > 0) {
      const { data: closureData } = await supabaseAdmin
        .from('industry_closure')
        .select('ancestor_id, descendant_id, depth')
        .in('descendant_id', industryIds);
      
      if (closureData) {
        for (const row of closureData) {
          if (!industryIdsWithAncestors.includes(row.ancestor_id)) {
            industryIdsWithAncestors.push(row.ancestor_id);
          }
          const existing = industryDepths.get(row.ancestor_id);
          if (existing == null || row.depth < existing) {
            industryDepths.set(row.ancestor_id, row.depth);
          }
        }
      }
    }
```

### 4-2. ruleMatchInput の変更

変更前:
```typescript
      const ruleMatchInput = {
        supplier: supplierName,
        amount: amount,
        description: ocr_result.extracted_items?.[0]?.name || ocr_result.extracted_supplier || '',
        client_id: client_id,
        industry_ids: industryIds,
        industry_ids_with_ancestors: industryIdsWithAncestors,
        industry_depths: industryDepths,
        // ... 残りは同じ
      };
```

変更後:
```typescript
      const ruleMatchInput = {
        supplier: supplierName,
        amount: amount,
        description: ocr_result.extracted_items?.[0]?.name || ocr_result.extracted_supplier || '',
        client_id: client_id,
        industry_ids: industryIds,
        // industry_ids_with_ancestors 削除
        // industry_depths 削除
        payment_method: ocr_result.extracted_payment_method || null,
        item_name: ocr_result.extracted_items?.[0]?.name || null,
        document_type: ocr_result.document_type || null,
        has_invoice_number: ocr_result.extracted_invoice_number ? true : null,
        tax_rate_hint: ocr_result.transactions?.[0]?.items?.[0]?.tax_rate ?? null,
        is_internal_tax: ocr_result.transactions?.[0]?.tax_included ?? null,
        frequency_hint: null,
        tategaki: ocr_result.extracted_tategaki || null,
        withholding_tax_amount: ocr_result.extracted_withholding_tax ?? null,
        invoice_qualification: ocr_result.extracted_invoice_qualification || null,
        addressee: ocr_result.extracted_addressee || null,
        transaction_type: ocr_result.extracted_transaction_type || null,
        transfer_fee_bearer: ocr_result.extracted_transfer_fee_bearer || null,
      };
```

---

## 5. フロントエンド新規ファイル

### ファイル配置:
```
src/client/pages/master/rules/
  ├── index.tsx
  ├── IndustryDetail.tsx
  ├── ClientList.tsx
  └── ClientDetail.tsx
```

旧ファイル `src/client/pages/master/rules.tsx` は削除する。

### 5-1. 共通コンポーネント: RuleRow

全4画面で共有するRuleRowコンポーネントを `index.tsx` の先頭、
またはsrc/client/components/rules/RuleRow.tsxとして作成。

以下のコードを `src/client/pages/master/rules/index.tsx` の先頭に配置する（後で分離してもOK）:

```typescript
import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, ChevronDown, ChevronRight, ArrowLeft, Trash2, Copy, ExternalLink, ToggleLeft, ToggleRight } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/client/lib/supabase';
import type { Rule, Industry, AccountItem, TaxCategory } from '@/types';

// ============================================
// スコープ別スタイル定義
// ============================================
const SCOPE_STYLES = {
  shared:   { bg: 'bg-gray-50',    border: 'border-l-gray-300',   badge: 'bg-gray-200 text-gray-600',   label: '汎用' },
  industry: { bg: 'bg-blue-50/60', border: 'border-l-blue-400',   badge: 'bg-blue-100 text-blue-700',   label: '業種別' },
  client:   { bg: 'bg-red-50/60',  border: 'border-l-red-400',    badge: 'bg-red-100 text-red-700',     label: '顧客別' },
};

// ============================================
// RuleRow: アコーディオン展開式ルール行
// ============================================
interface RuleRowProps {
  rule: any;
  scope: 'shared' | 'industry' | 'client';
  expanded: boolean;
  onToggle: () => void;
  editable?: boolean;
  onDelete?: () => void;
  onSave?: (data: any) => void;
  onCopyDerive?: () => void;
  parentRule?: any;
  accountItems: AccountItem[];
  taxCategories: TaxCategory[];
}

function RuleRow({ rule, scope, expanded, onToggle, editable = true, onDelete, onSave, onCopyDerive, parentRule, accountItems, taxCategories }: RuleRowProps) {
  const s = SCOPE_STYLES[scope];
  const ratio = rule.actions?.business_ratio;
  const pct = ratio != null ? Math.round(Number(ratio) * 100) : null;
  const hasDerived = !!rule.derived_from_rule_id;
  const acctName = rule.actions?.account_item_id ? (accountItems.find(a => a.id === rule.actions.account_item_id)?.name || '—') : '—';
  const taxName = rule.actions?.tax_category_id ? (taxCategories.find(t => t.id === rule.actions.tax_category_id)?.name || '—') : '—';
  const parentAcctName = parentRule?.actions?.account_item_id ? (accountItems.find(a => a.id === parentRule.actions.account_item_id)?.name || '—') : null;

  // 編集フォーム state
  const [formConditions, setFormConditions] = useState(rule.conditions || {});
  const [formActions, setFormActions] = useState(rule.actions || {});
  const [formPriority, setFormPriority] = useState(rule.priority);

  return (
    <div className="mb-px">
      {/* 行本体 */}
      <div
        onClick={editable ? onToggle : undefined}
        className={`flex items-center gap-2 px-3 py-2.5 ${s.bg} border-l-4 ${s.border} ${expanded ? 'rounded-t-md' : 'rounded-md'} ${editable ? 'cursor-pointer hover:brightness-95' : ''} ${!rule.is_active ? 'opacity-40' : ''} transition-all text-sm`}
      >
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.badge} flex-shrink-0`}>{s.label}</span>
        <div className="min-w-[110px] flex-shrink-0">
          <div className="font-semibold text-gray-900 text-xs">{rule.conditions?.supplier_pattern || rule.conditions?.document_type || rule.conditions?.transaction_pattern || '—'}</div>
          {rule.conditions?.transaction_pattern && rule.conditions?.supplier_pattern && (
            <div className="text-[10px] text-gray-400">摘要: {rule.conditions.transaction_pattern}</div>
          )}
          {(rule.conditions?.amount_min || rule.conditions?.amount_max) && (
            <div className="text-[10px] text-gray-400">¥{rule.conditions?.amount_min?.toLocaleString() || '0'}〜¥{rule.conditions?.amount_max?.toLocaleString() || '∞'}</div>
          )}
        </div>
        <span className="text-gray-300 text-sm flex-shrink-0">→</span>
        <div className="font-semibold text-gray-700 text-xs min-w-[70px] flex-shrink-0">{acctName}</div>
        <div className="text-[11px] text-gray-500 min-w-[70px] flex-shrink-0">{taxName}</div>
        {pct != null && pct < 100 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 flex-shrink-0">按分{pct}%</span>
        )}
        {hasDerived && parentAcctName && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 flex-shrink-0">
            ↑ 派生: {parentAcctName}
          </span>
        )}
        <div className="ml-auto text-[10px] text-gray-400 flex-shrink-0">
          {rule.match_count > 0 && `${rule.match_count}回`}
        </div>
        {editable && <ChevronDown size={12} className={`text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />}
        {!editable && onCopyDerive && (
          <button onClick={(e) => { e.stopPropagation(); onCopyDerive(); }}
            className="text-[10px] font-semibold px-2 py-1 rounded bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 flex-shrink-0">
            派生ルール作成
          </button>
        )}
        {!editable && !onCopyDerive && <span className="text-[10px] text-gray-300 flex-shrink-0">参照</span>}
      </div>

      {/* アコーディオン展開 */}
      {expanded && (
        <div className={`bg-white border border-t-0 ${scope === 'industry' ? 'border-blue-200' : scope === 'client' ? 'border-red-200' : 'border-gray-200'} rounded-b-md p-4`}>
          {/* 派生元表示 */}
          {hasDerived && parentRule && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mb-4">
              <div className="text-[10px] font-bold text-gray-500 mb-2 flex items-center gap-1">↑ 派生元の汎用ルール</div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">汎用</span>
                <span className="font-semibold text-gray-500">{parentRule.conditions?.supplier_pattern || '—'}</span>
                <span className="text-gray-300">→</span>
                <span className="font-semibold text-gray-500 line-through">{parentAcctName}</span>
                <span className="text-blue-600 font-semibold text-[11px] ml-2">この業種では「{acctName}」に変更</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* 条件 */}
            <div>
              <div className="text-[10px] font-bold text-gray-600 mb-2 border-b border-gray-100 pb-1">条件</div>
              <div className="space-y-2">
                <FormField label="取引先パターン" value={formConditions.supplier_pattern || ''} onChange={v => setFormConditions({...formConditions, supplier_pattern: v})} ph="取引先名（部分一致）" />
                <FormField label="摘要パターン（取引内容）" value={formConditions.transaction_pattern || ''} onChange={v => setFormConditions({...formConditions, transaction_pattern: v})} ph="摘要キーワード" />
                <div className="grid grid-cols-2 gap-1.5">
                  <FormField label="金額下限" value={formConditions.amount_min || ''} onChange={v => setFormConditions({...formConditions, amount_min: v ? Number(v) : null})} ph="0" type="number" />
                  <FormField label="金額上限" value={formConditions.amount_max || ''} onChange={v => setFormConditions({...formConditions, amount_max: v ? Number(v) : null})} ph="∞" type="number" />
                </div>
                <FormField label="品目パターン" value={formConditions.item_pattern || ''} onChange={v => setFormConditions({...formConditions, item_pattern: v})} ph="品目キーワード" />
                <FormField label="支払方法" value={formConditions.payment_method || ''} onChange={v => setFormConditions({...formConditions, payment_method: v})} ph="cash / credit_card / bank_transfer" />
                <FormField label="証憑種別" value={formConditions.document_type || ''} onChange={v => setFormConditions({...formConditions, document_type: v})} ph="receipt / invoice" />
              </div>
            </div>
            {/* アクション */}
            <div>
              <div className="text-[10px] font-bold text-gray-600 mb-2 border-b border-gray-100 pb-1">アクション</div>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">勘定科目</label>
                  <select value={formActions.account_item_id || ''} onChange={e => setFormActions({...formActions, account_item_id: e.target.value})}
                    className="w-full p-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none">
                    <option value="">-- 選択 --</option>
                    {accountItems.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">税区分</label>
                  <select value={formActions.tax_category_id || ''} onChange={e => setFormActions({...formActions, tax_category_id: e.target.value})}
                    className="w-full p-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none">
                    <option value="">-- 選択 --</option>
                    {taxCategories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <FormField label="摘要テンプレート" value={formActions.description_template || ''} onChange={v => setFormActions({...formActions, description_template: v})} ph="{supplier} ガソリン代" />
                <div className="grid grid-cols-2 gap-1.5">
                  <FormField label="家事按分率(%)" value={formActions.business_ratio ? Math.round(Number(formActions.business_ratio) * 100) : ''} onChange={v => setFormActions({...formActions, business_ratio: v ? Number(v) / 100 : null})} ph="100" type="number" />
                  <FormField label="按分根拠" value={formActions.business_ratio_note || ''} onChange={v => setFormActions({...formActions, business_ratio_note: v})} ph="理由" />
                </div>
                <FormField label="優先度" value={formPriority} onChange={v => setFormPriority(Number(v))} type="number" />
              </div>
              <div className="flex gap-1.5 mt-4 justify-end">
                {onDelete && <button onClick={onDelete} className="px-3 py-1.5 text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100">削除</button>}
                <button onClick={() => onSave?.({ conditions: formConditions, actions: formActions, priority: formPriority })}
                  className="px-4 py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({ label, value, onChange, ph, type = 'text' }: { label: string; value: any; onChange: (v: string) => void; ph?: string; type?: string }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={ph}
        className="w-full p-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none" />
    </div>
  );
}
```

### 5-2. index.tsx（汎用ルール + 業種一覧タブ）

上記の共通コンポーネントの後に続けて:

```typescript
// ============================================
// メインページ: 汎用ルール / 業種一覧 タブ切替
// ============================================
export default function RulesIndexPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'industry' ? 'industry' : 'shared';

  const setActiveTab = (tab: string) => {
    if (tab === 'industry') setSearchParams({ tab: 'industry' });
    else setSearchParams({});
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-gray-900">仕訳ルール管理</h1>
        <p className="text-xs text-gray-500 mt-1">仕訳自動生成のルールを管理します</p>
      </div>

      {/* タブ */}
      <div className="flex border-b-2 border-gray-200">
        {[
          { key: 'shared', label: '🌐 汎用ルール' },
          { key: 'industry', label: '🏢 業種別テンプレート' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-[3px] -mb-[2px] transition-colors ${
              activeTab === tab.key ? 'border-blue-600 text-blue-700 font-bold' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'shared' && <SharedRulesTab />}
      {activeTab === 'industry' && <IndustryListTab />}
    </div>
  );
}

// ============================================
// 汎用ルールタブ
// ============================================
function SharedRulesTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [rulesRes, acctRes, taxRes] = await Promise.all([
      supabase.from('processing_rules').select('*').eq('scope', 'shared').eq('is_active', true).order('priority'),
      supabase.from('account_items').select('id, code, name').eq('is_active', true).order('code'),
      supabase.from('tax_categories').select('id, code, name').eq('is_active', true).order('sort_order'),
    ]);
    if (rulesRes.data) setRules(rulesRes.data);
    if (acctRes.data) setAccountItems(acctRes.data);
    if (taxRes.data) setTaxCategories(taxRes.data);
    setLoading(false);
  };

  const toggle = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleSave = async (ruleId: string, data: any) => {
    const { error } = await supabase.from('processing_rules').update({
      conditions: data.conditions,
      actions: data.actions,
      priority: data.priority,
    }).eq('id', ruleId);
    if (error) alert('保存に失敗: ' + error.message);
    else loadData();
  };

  const handleDelete = async (rule: any) => {
    if (!confirm(`「${rule.rule_name}」を削除しますか？`)) return;
    await supabase.from('processing_rules').delete().eq('id', rule.id);
    loadData();
  };

  const filtered = rules.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.rule_name || '').toLowerCase().includes(q) ||
      (r.conditions?.supplier_pattern || '').toLowerCase().includes(q);
  });

  if (loading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700"><strong className="text-lg">{rules.length}</strong> 件の汎用ルール</span>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ルールを検索..."
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md w-56 outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-blue-600 text-white rounded-md hover:bg-blue-700">
          <Plus size={14} /> 新規汎用ルール
        </button>
      </div>

      <div className="space-y-px">
        {filtered.map(rule => (
          <RuleRow key={rule.id} rule={rule} scope="shared" expanded={expandedIds.has(rule.id)} onToggle={() => toggle(rule.id)}
            onDelete={() => handleDelete(rule)} onSave={(data) => handleSave(rule.id, data)}
            accountItems={accountItems} taxCategories={taxCategories} />
        ))}
      </div>
      {filtered.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">{search ? '検索結果なし' : '汎用ルールがありません'}</div>}
    </div>
  );
}

// ============================================
// 業種一覧タブ
// ============================================
function IndustryListTab() {
  const navigate = useNavigate();
  const [industries, setIndustries] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: inds } = await supabase.from('industries').select('*').eq('is_active', true).order('sort_order');

    // 各業種のルール数・顧客数を取得
    if (inds) {
      const enriched = await Promise.all(inds.map(async (ind: any) => {
        const [ruleRes, clientRes] = await Promise.all([
          supabase.from('processing_rules').select('id', { count: 'exact', head: true }).eq('scope', 'industry').eq('industry_id', ind.id).eq('is_active', true),
          supabase.from('clients').select('id', { count: 'exact', head: true }).eq('industry_id', ind.id),
        ]);
        return { ...ind, ruleCount: ruleRes.count || 0, clientCount: clientRes.count || 0 };
      }));
      setIndustries(enriched);
    }
    setLoading(false);
  };

  const filtered = industries.filter(ind => {
    if (!search.trim()) return true;
    return ind.name.includes(search) || ind.code.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700"><strong className="text-lg">{industries.length}</strong> 業種</span>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="業種を検索..."
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md w-56 outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">業種名</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">コード</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">説明</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">ルール</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">顧客</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(ind => (
              <tr key={ind.id} onClick={() => navigate(`/master/rules/industry/${ind.id}`)}
                className="border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 font-semibold text-gray-900">{ind.name}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-gray-400">{ind.code}</td>
                <td className="px-3 py-2.5 text-gray-500 text-xs max-w-[280px] truncate">{ind.description?.slice(0, 50)}...</td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{ind.ruleCount}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{ind.clientCount}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### 5-3. IndustryDetail.tsx

```typescript
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Plus, ChevronRight, Users } from 'lucide-react';
import { supabase } from '@/client/lib/supabase';
import type { AccountItem, TaxCategory } from '@/types';
// RuleRowは index.tsx からexportするか、共通コンポーネントとして配置

export default function IndustryDetailPage() {
  const { industryId } = useParams<{ industryId: string }>();
  const navigate = useNavigate();

  const [industry, setIndustry] = useState<any>(null);
  const [industryRules, setIndustryRules] = useState<any[]>([]);
  const [sharedRules, setSharedRules] = useState<any[]>([]);
  const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showShared, setShowShared] = useState(false);
  const [derivingRule, setDerivingRule] = useState<any>(null);
  const [deriveAccountId, setDeriveAccountId] = useState('');
  const [deriveTaxCatId, setDeriveTaxCatId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (industryId) loadData(); }, [industryId]);

  const loadData = async () => {
    setLoading(true);
    const [indRes, indRulesRes, sharedRes, acctRes, taxRes, clientRes] = await Promise.all([
      supabase.from('industries').select('*').eq('id', industryId).single(),
      supabase.from('processing_rules').select('*').eq('scope', 'industry').eq('industry_id', industryId).eq('is_active', true).order('priority'),
      supabase.from('processing_rules').select('*').eq('scope', 'shared').eq('is_active', true).order('priority'),
      supabase.from('account_items').select('id, code, name').eq('is_active', true).order('code'),
      supabase.from('tax_categories').select('id, code, name').eq('is_active', true).order('sort_order'),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('industry_id', industryId),
    ]);
    if (indRes.data) setIndustry(indRes.data);
    if (indRulesRes.data) setIndustryRules(indRulesRes.data);
    if (sharedRes.data) setSharedRules(sharedRes.data);
    if (acctRes.data) setAccountItems(acctRes.data);
    if (taxRes.data) setTaxCategories(taxRes.data);
    setClientCount(clientRes.count || 0);
    setLoading(false);
  };

  const toggle = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  // 派生済み汎用ルールIDを収集
  const derivedSharedIds = new Set(industryRules.filter(r => r.derived_from_rule_id).map(r => r.derived_from_rule_id));
  const filteredShared = sharedRules.filter(r => !derivedSharedIds.has(r.id));
  const hiddenCount = sharedRules.length - filteredShared.length;

  // 派生元ルール取得ヘルパー
  const getParentRule = (derivedFromId: string | null) => derivedFromId ? sharedRules.find(r => r.id === derivedFromId) : null;

  const handleSave = async (ruleId: string, data: any) => {
    const { error } = await supabase.from('processing_rules').update({
      conditions: data.conditions, actions: data.actions, priority: data.priority,
    }).eq('id', ruleId);
    if (error) alert('保存失敗: ' + error.message);
    else loadData();
  };

  const handleDelete = async (rule: any) => {
    if (!confirm(`「${rule.rule_name}」を削除しますか？`)) return;
    await supabase.from('processing_rules').delete().eq('id', rule.id);
    loadData();
  };

  const handleDerive = async () => {
    if (!derivingRule || !deriveAccountId) { alert('勘定科目を選択してください'); return; }
    const acctName = accountItems.find(a => a.id === deriveAccountId)?.name || '';
    const { error } = await supabase.from('processing_rules').insert({
      scope: 'industry',
      industry_id: industryId,
      rule_name: `${derivingRule.conditions?.supplier_pattern || '—'} → ${acctName}`,
      priority: 150,
      rule_type: derivingRule.rule_type || '支出',
      conditions: { ...derivingRule.conditions },
      actions: { ...derivingRule.actions, account_item_id: deriveAccountId, tax_category_id: deriveTaxCatId || null },
      derived_from_rule_id: derivingRule.id,
      is_active: true, auto_apply: true,
    });
    if (error) alert('作成失敗: ' + error.message);
    else { setDerivingRule(null); setDeriveAccountId(''); setDeriveTaxCatId(''); loadData(); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!industry) return <div className="text-center py-20 text-gray-400">業種が見つかりません</div>;

  return (
    <div className="space-y-4">
      {/* パンくず */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="cursor-pointer text-blue-600 font-medium" onClick={() => navigate('/master/rules?tab=industry')}>仕訳ルール管理</span>
        <ChevronRight size={12} className="text-gray-300" />
        <span className="font-semibold text-gray-900">{industry.name}</span>
      </div>

      {/* 業種説明 */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-1.5">
          <div>
            <h1 className="text-xl font-extrabold text-gray-900">{industry.name}</h1>
            <span className="text-[11px] text-gray-400 font-mono">{industry.code}</span>
          </div>
          <div className="flex gap-2">
            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-xs font-bold">📋 {industryRules.length} ルール</span>
            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-md text-xs font-bold">👤 {clientCount} 顧客</span>
          </div>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">{industry.description}</p>
      </div>

      {/* 顧客一覧リンク */}
      <Link to={`/master/rules/industry/${industryId}/clients`}
        className="block bg-white rounded-lg border border-gray-200 p-3.5 hover:border-blue-300 hover:bg-gray-50 transition-all">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Users size={18} className="text-gray-400" />
            <div>
              <div className="text-sm font-bold text-gray-900">顧客一覧へ</div>
              <div className="text-[11px] text-gray-500">{clientCount}名の顧客と顧客別ルールを管理</div>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-400" />
        </div>
      </Link>

      {/* 業種別ルール */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-gray-900">業種別ルール</h2>
            {/* トグルスイッチ */}
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <div onClick={() => setShowShared(!showShared)}
                className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${showShared ? 'bg-blue-600' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow ${showShared ? 'left-[18px]' : 'left-0.5'}`} />
              </div>
              <span className={`text-xs font-medium ${showShared ? 'text-blue-700' : 'text-gray-500'}`}>
                汎用ルールも表示（{filteredShared.length}件）
              </span>
            </label>
            {showShared && hiddenCount > 0 && (
              <span className="text-[10px] text-gray-400 italic">※ 派生済み{hiddenCount}件は非表示</span>
            )}
          </div>
          <button className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-md hover:bg-blue-700">
            <Plus size={13} /> 業種ルール追加
          </button>
        </div>

        {/* 派生作成パネル */}
        {derivingRule && (
          <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-2">
            <div className="text-xs font-bold text-blue-700 mb-3">✨ 汎用ルール「{derivingRule.rule_name}」から業種ルールを派生</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-semibold text-gray-500 mb-1.5">条件（引き継ぎ）</div>
                <div className="bg-white p-2 rounded border border-blue-200 text-xs">
                  取引先: <strong>{derivingRule.conditions?.supplier_pattern || '—'}</strong>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">勘定科目（変更先）</label>
                  <select value={deriveAccountId} onChange={e => setDeriveAccountId(e.target.value)}
                    className="w-full p-1.5 text-xs border border-gray-300 rounded">
                    <option value="">-- 選択 --</option>
                    {accountItems.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">税区分</label>
                  <select value={deriveTaxCatId} onChange={e => setDeriveTaxCatId(e.target.value)}
                    className="w-full p-1.5 text-xs border border-gray-300 rounded">
                    <option value="">-- 選択 --</option>
                    {taxCategories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-1.5 mt-3 justify-end">
              <button onClick={() => setDerivingRule(null)} className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50">キャンセル</button>
              <button onClick={handleDerive} className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700">派生ルールとして保存</button>
            </div>
          </div>
        )}

        {/* ルール一覧 */}
        <div className="space-y-px">
          {industryRules.map(rule => (
            <RuleRow key={rule.id} rule={rule} scope="industry" expanded={expandedIds.has(rule.id)} onToggle={() => toggle(rule.id)}
              onDelete={() => handleDelete(rule)} onSave={(data) => handleSave(rule.id, data)}
              parentRule={getParentRule(rule.derived_from_rule_id)}
              accountItems={accountItems} taxCategories={taxCategories} />
          ))}
          {showShared && filteredShared.map(rule => (
            <RuleRow key={`s-${rule.id}`} rule={rule} scope="shared" expanded={false} onToggle={() => {}} editable={false}
              onCopyDerive={() => { setDerivingRule(rule); setDeriveAccountId(''); setDeriveTaxCatId(rule.actions?.tax_category_id || ''); }}
              accountItems={accountItems} taxCategories={taxCategories} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

注: RuleRow コンポーネントは index.tsx から export して IndustryDetail.tsx で import する。
実装時は以下をindex.tsxに追加:
```typescript
export { RuleRow, FormField, SCOPE_STYLES };
```

### 5-4. ClientList.tsx と 5-5. ClientDetail.tsx

同様のパターンで実装する。モックアップ rules-mockup-v3.jsx の画面4・画面5を参考にTailwindで書き直す。

ClientList.tsx のデータ取得:
```typescript
const { data: clients } = await supabase.from('clients').select('*').eq('industry_id', industryId).order('name');
// 各顧客のルール件数
for (const client of clients) {
  const { count } = await supabase.from('processing_rules').select('id', { count: 'exact', head: true })
    .eq('scope', 'client').eq('client_id', client.id).eq('is_active', true);
  client.clientRuleCount = count || 0;
}
```

ClientDetail.tsx は IndustryDetail.tsx とほぼ同じ構造で、scope='client' のルールをCRUD対応。
派生作成は業種ルール・汎用ルールの両方から可能（derivingScope state で区別）。

---

## 6. main.tsx ルーティング修正

### import の変更:
```typescript
// 変更前:
import RulesPage from './pages/master/rules';

// 変更後:
import RulesIndexPage from './pages/master/rules/index';
import IndustryDetailPage from './pages/master/rules/IndustryDetail';
import ClientListPage from './pages/master/rules/ClientList';
import ClientDetailPage from './pages/master/rules/ClientDetail';
```

### Routes の変更:
```tsx
// 変更前:
<Route path="/master/rules" element={<RulesPage />} />

// 変更後:
<Route path="/master/rules" element={<RulesIndexPage />} />
<Route path="/master/rules/industry/:industryId" element={<IndustryDetailPage />} />
<Route path="/master/rules/industry/:industryId/clients" element={<ClientListPage />} />
<Route path="/master/rules/industry/:industryId/client/:clientId" element={<ClientDetailPage />} />
```

---

## 7. Layout.tsx サイドバー修正

### isActive の判定を変更:
```typescript
// 変更前:
const isActive = (path: string) => location.pathname === path;

// 変更後:
const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
```

これにより `/master/rules/industry/xxx` でも「ルール管理」がハイライトされる。

---

## 8. 既存ページ波及修正

### 8-1. industries.tsx

N階層UIの完全削除。フラットテーブルに書き直す。

削除する関数・state:
- `expanded`, `setExpanded`, `toggleExpand`, `expandAll`, `collapseAll`
- `getLevel`, `buildTree` 再帰関数
- `parentOptions` の useMemo
- `levelCounts`, `maxLevel`
- `IndustryNode` インターフェース
- `renderTreeItem` 再帰レンダリング
- `industry_closure` へのクエリ
- フォームの `parent_id` フィールド

フラットテーブルに変更:
```tsx
<table>
  <thead><tr><th>業種名</th><th>コード</th><th>説明</th><th>操作</th></tr></thead>
  <tbody>
    {industries.map(ind => (
      <tr key={ind.id}>
        <td>{ind.name}</td>
        <td>{ind.code}</td>
        <td>{ind.description?.slice(0, 50)}</td>
        <td><Edit /> <Trash2 /></td>
      </tr>
    ))}
  </tbody>
</table>
```

### 8-2. review.tsx スコープラベル変更

**位置:** 約1756〜1761行

```tsx
// 変更前:
<option value="shared">共通</option>
<option value="industry">業種</option>
<option value="client">この顧客</option>

// 変更後:
<option value="shared">汎用</option>
<option value="industry">業種別</option>
<option value="client">顧客別</option>
```

### 8-3. review.tsx supplier_aliases カラム名修正

**位置:** 約446行

```typescript
// 変更前:
const { data: aliasData } = await supabase.from('supplier_aliases').select('supplier_id, alias');

// 変更後:
const { data: aliasData } = await supabase.from('supplier_aliases').select('supplier_id, alias_name');
```

**位置:** 約466行のalias参照:
```typescript
// 変更前:
const normAlias = normalizeJapanese(a.alias).toLowerCase();

// 変更後:
const normAlias = normalizeJapanese(a.alias_name).toLowerCase();
```

---

## 確認事項

- 全画面でアコーディオンが複数同時展開可能であること
- 業種詳細で汎用ルールのトグルON/OFF時、派生済みルールが正しく非表示になること
- 派生ルール作成後、汎用ルール一覧から該当ルールが消えること（再読み込みで確認）
- パンくずナビゲーションが全階層で正しく動作すること
- サイドバーの「ルール管理」が全ページでハイライトされること