import { useState, useEffect } from 'react';
import { Plus, Search, ChevronDown } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { rulesApi, accountItemsApi, taxCategoriesApi, industriesApi, clientsApi } from '@/web/shared/lib/api/backend.api';
import type { AccountItem, TaxCategory } from '@/types';
import { useAuth } from '@/web/app/providers/AuthProvider';

// ============================================
// スコープ別スタイル定義
// ============================================
export const SCOPE_STYLES = {
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

export function RuleRow({ rule, scope, expanded, onToggle, editable = true, onDelete, onSave, onCopyDerive, parentRule, accountItems, taxCategories }: RuleRowProps) {
  const s = SCOPE_STYLES[scope];
  const ratio = rule.actions?.business_ratio;
  const pct = ratio != null ? Math.round(Number(ratio) * 100) : null;
  const hasDerived = !!rule.derived_from_rule_id;
  const acctName = rule.actions?.account_item_id ? (accountItems.find(a => a.id === rule.actions.account_item_id)?.name || '—') : '—';
  const parentAcctName = parentRule?.actions?.account_item_id ? (accountItems.find(a => a.id === parentRule.actions.account_item_id)?.name || '—') : null;

  // トリガー条件を収集
  const cond = rule.conditions || {};
  const triggers: Array<{ label: string; value: string }> = [];
  if (cond.supplier_pattern) triggers.push({ label: '取引先', value: cond.supplier_pattern });
  if (cond.transaction_pattern) triggers.push({ label: '摘要', value: cond.transaction_pattern });
  if (cond.document_type) triggers.push({ label: '証憑', value: cond.document_type });
  if (cond.amount_min || cond.amount_max) triggers.push({ label: '金額', value: `¥${cond.amount_min?.toLocaleString() || '0'}〜¥${cond.amount_max?.toLocaleString() || '∞'}` });
  if (cond.item_pattern) triggers.push({ label: '品目', value: cond.item_pattern });
  if (cond.payment_method) triggers.push({ label: '支払', value: cond.payment_method });

  // 詳細テキストを組み立て
  const details: string[] = [];
  if (rule.actions?.description_template) details.push(rule.actions.description_template);
  if (pct != null && pct < 100) details.push(`按分${pct}%`);
  if (rule.actions?.business_ratio_note) details.push(rule.actions.business_ratio_note);
  if (hasDerived && parentAcctName) details.push(`派生: ${parentAcctName}`);
  const detailText = details.join(' / ') || '—';

  // 編集フォーム state
  const [formConditions, setFormConditions] = useState(rule.conditions || {});
  const [formActions, setFormActions] = useState(rule.actions || {});
  const [formPriority, setFormPriority] = useState(rule.priority);

  return (
    <div className="mb-px">
      {/* 行本体 */}
      <div
        onClick={editable ? onToggle : undefined}
        className={`flex items-center gap-3 px-3 py-2 ${s.bg} border-l-4 ${s.border} ${expanded ? 'rounded-t-md' : 'rounded-md'} ${editable ? 'cursor-pointer hover:brightness-95' : ''} ${!rule.is_active ? 'opacity-40' : ''} transition-all text-sm`}
      >
        {/* カラム1: スコープバッジ + マッチ回数 */}
        <div className="w-14 flex-shrink-0 text-center">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.badge}`}>{s.label}</span>
          {rule.match_count > 0 && <div className="text-[9px] text-gray-400 mt-0.5">{rule.match_count}回</div>}
        </div>

        {/* カラム2: トリガー（種別 + 項目のサブカ��ム） */}
        <div className="w-[260px] flex-shrink-0 overflow-hidden">
          {triggers.length === 0 ? (
            <span className="text-xs text-gray-400">—</span>
          ) : (
            <div className="space-y-0.5">
              {triggers.map((t, i) => (
                <div key={i} className="flex items-baseline gap-1.5">
                  <span className="text-[10px] text-gray-400 w-10 flex-shrink-0 text-right">{t.label}</span>
                  <span className="text-xs text-gray-800 truncate">{t.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* カラム3: 勘定科目 + 按分バッジ */}
        <div className="w-[140px] flex-shrink-0">
          <div className="font-semibold text-gray-900 text-xs truncate">{acctName}</div>
          {pct != null && pct < 100 && (
            <span className="text-[9px] font-semibold px-1 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">按分{pct}%</span>
          )}
        </div>

        {/* カラム4: 詳細（truncate） */}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-gray-500 truncate">{detailText}</div>
        </div>

        {/* カラム5: 操�� */}
        <div className="w-8 flex-shrink-0 flex items-center justify-center">
          {editable && <ChevronDown size={12} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />}
          {!editable && onCopyDerive && (
            <button onClick={(e) => { e.stopPropagation(); onCopyDerive(); }}
              className="text-[10px] font-semibold px-2 py-1 rounded bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 whitespace-nowrap">
              派生
            </button>
          )}
          {!editable && !onCopyDerive && <span className="text-[10px] text-gray-300">参照</span>}
        </div>
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

export function FormField({ label, value, onChange, ph, type = 'text' }: { label: string; value: any; onChange: (v: string) => void; ph?: string; type?: string }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={ph}
        className="w-full p-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none" />
    </div>
  );
}

// ============================================
// メインページ: 汎用ルール / 業種一覧 タブ切替
// ============================================
export default function RulesIndexPage() {
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
  const { userProfile } = useAuth();
  const canEdit = ['admin','manager','operator'].includes(userProfile?.role || 'viewer');
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
      rulesApi.getAll({ scope: 'shared', is_active: 'true' }),
      accountItemsApi.getAll({ is_active: 'true' }),
      taxCategoriesApi.getAll(),
    ]);
    if (rulesRes.data) setRules(rulesRes.data);
    if (acctRes.data) setAccountItems(acctRes.data as AccountItem[]);
    if (taxRes.data) setTaxCategories(taxRes.data as TaxCategory[]);
    setLoading(false);
  };

  const toggle = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleSave = async (ruleId: string, data: any) => {
    const { error } = await rulesApi.update(ruleId, {
      conditions: data.conditions,
      actions: data.actions,
      priority: data.priority,
    });
    if (error) alert('保存に失敗: ' + error);
    else loadData();
  };

  const handleDelete = async (rule: any) => {
    if (!confirm(`「${rule.rule_name}」を削除しますか？`)) return;
    const { error } = await rulesApi.delete(rule.id);
    if (error) { alert('削除に失敗しました: ' + error); return; }
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
        {canEdit && (
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-blue-600 text-white rounded-md hover:bg-blue-700">
            <Plus size={14} /> 新規汎用ルール
          </button>
        )}
      </div>

      <div className="space-y-px">
        {filtered.map(rule => (
          <RuleRow key={rule.id} rule={rule} scope="shared" expanded={expandedIds.has(rule.id)} onToggle={() => toggle(rule.id)}
            editable={canEdit}
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
    const { data: inds } = await industriesApi.getAll({ is_active: 'true' });

    // 各業種のルール数・顧客数を取得
    if (inds) {
      const enriched = await Promise.all(inds.map(async (ind: any) => {
        const [ruleRes, clientRes] = await Promise.all([
          rulesApi.getAll({ scope: 'industry', industry_id: ind.id, is_active: 'true' }),
          clientsApi.getAll(),
        ]);
        const ruleCount = ruleRes.data?.length || 0;
        const clientCount = clientRes.data?.filter((c: any) => c.industry_id === ind.id).length || 0;
        return { ...ind, ruleCount, clientCount };
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
