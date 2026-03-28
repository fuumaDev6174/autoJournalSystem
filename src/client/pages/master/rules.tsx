import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, ArrowLeft, Search, User, Building2, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Rule, Industry, Client, AccountItem, TaxCategory } from '@/types';
import Modal from '@/client/components/ui/Modal';
import { supabase } from '@/client/lib/supabase';


// ============================================
// メインコンポーネント
// ============================================
export default function RulesPage() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<Rule[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'shared' | 'industry' | 'client'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState('');

  const [formData, setFormData] = useState({
    rule_name: '',
    priority: '100',
    rule_type: '支出' as '支出' | '収入',
    scope: 'shared' as 'shared' | 'industry' | 'client',
    industry_id: '',
    client_id: '',
    supplier_pattern: '',
    transaction_pattern: '',
    amount_min: '',
    amount_max: '',
    account_item_id: '',
    tax_category_id: '',
    description_template: '',
    business_ratio: '',
    auto_apply: true,
    require_confirmation: false,
    // 新条件フィールド
    item_pattern: '',
    payment_method_condition: '',
    document_type_condition: '',
    // 新アクションフィールド
    business_ratio_note: '',
    entry_type_hint: 'normal',
    requires_manual_review: false,
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [rulesRes, industriesRes, clientsRes, accountsRes, taxRes] = await Promise.all([
      supabase.from('processing_rules').select('*, industry:industries(*), client:clients(*)').order('priority', { ascending: true }),
      supabase.from('industries').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('account_items').select('*').eq('is_active', true).is('industry_id', null).order('code'),
      supabase.from('tax_categories').select('*').eq('is_active', true).order('sort_order'),
    ]);
    if (rulesRes.data) setRules(rulesRes.data as Rule[]);
    if (industriesRes.data) setIndustries(industriesRes.data as Industry[]);
    if (clientsRes.data) setClients(clientsRes.data as Client[]);
    if (accountsRes.data) setAccountItems(accountsRes.data as AccountItem[]);
    if (taxRes.data) setTaxCategories(taxRes.data as TaxCategory[]);
    setLoading(false);
  };

  // ============================================
  // モーダル操作
  // ============================================
  const resetForm = () => {
    setFormData({
      rule_name: '', priority: '100', rule_type: '支出', scope: 'shared',
      industry_id: '', client_id: '', supplier_pattern: '', transaction_pattern: '',
      amount_min: '', amount_max: '', account_item_id: '', tax_category_id: '',
      description_template: '', business_ratio: '', auto_apply: true, require_confirmation: false,
      item_pattern: '', payment_method_condition: '', document_type_condition: '',
      business_ratio_note: '', entry_type_hint: 'normal', requires_manual_review: false,
    });
    setDuplicateWarning('');
  };

  const handleOpenNewModal = () => { setEditingRule(null); resetForm(); setShowModal(true); };

  const handleOpenEditModal = (rule: Rule) => {
    setEditingRule(rule);
    setDuplicateWarning('');
    setFormData({
      rule_name: rule.rule_name,
      priority: rule.priority.toString(),
      rule_type: rule.rule_type,
      scope: rule.scope ?? 'shared',
      industry_id: rule.industry_id || '',
      client_id: rule.client_id || '',
      supplier_pattern: rule.conditions?.supplier_pattern || '',
      transaction_pattern: rule.conditions?.transaction_pattern || '',
      amount_min: rule.conditions?.amount_min?.toString() || '',
      amount_max: rule.conditions?.amount_max?.toString() || '',
      account_item_id: rule.actions?.account_item_id || '',
      tax_category_id: rule.actions?.tax_category_id || '',
      description_template: rule.actions?.description_template || '',
      business_ratio: rule.actions?.business_ratio ? (Number(rule.actions.business_ratio) * 100).toString() : '',
      auto_apply: rule.auto_apply,
      require_confirmation: rule.require_confirmation,
      item_pattern: rule.conditions?.item_pattern || '',
      payment_method_condition: rule.conditions?.payment_method || '',
      document_type_condition: rule.conditions?.document_type || '',
      business_ratio_note: rule.actions?.business_ratio_note || '',
      entry_type_hint: rule.actions?.entry_type_hint || 'normal',
      requires_manual_review: rule.actions?.requires_manual_review || false,
    });
    setShowModal(true);
  };

  // ============================================
  // 重複チェック（R2）
  // ============================================
  const checkDuplicate = (supplierPattern: string, accountItemId: string) => {
    if (!supplierPattern || !accountItemId) { setDuplicateWarning(''); return; }
    const dup = rules.find(r =>
      r.id !== editingRule?.id &&
      r.conditions?.supplier_pattern?.toLowerCase() === supplierPattern.toLowerCase() &&
      r.actions?.account_item_id === accountItemId
    );
    if (dup) {
      setDuplicateWarning(`類似ルールが存在します: 「${dup.rule_name}」（優先度${dup.priority}）`);
    } else {
      setDuplicateWarning('');
    }
  };

  // ============================================
  // 送信
  // ============================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.account_item_id) { alert('勘定科目を選択してください'); return; }

    // ルール名を自動生成（ユーザー入力がなければ）
    const autoName = formData.rule_name ||
      `${formData.supplier_pattern || formData.transaction_pattern || '全一致'} → ${accountItems.find(a => a.id === formData.account_item_id)?.name || '不明'}`;

    const ruleData = {
      rule_name: autoName,
      priority: Number(formData.priority),
      rule_type: formData.rule_type,
      scope: formData.scope,
      industry_id: formData.scope === 'industry' ? formData.industry_id || null : null,
      client_id: formData.scope === 'client' ? formData.client_id || null : null,
      conditions: {
        supplier_pattern: formData.supplier_pattern || null,
        transaction_pattern: formData.transaction_pattern || null,
        amount_min: formData.amount_min ? Number(formData.amount_min) : null,
        amount_max: formData.amount_max ? Number(formData.amount_max) : null,
        item_pattern: formData.item_pattern || null,
        payment_method: formData.payment_method_condition || null,
        document_type: formData.document_type_condition || null,
      },
      actions: {
        account_item_id: formData.account_item_id || null,
        tax_category_id: formData.tax_category_id || null,
        description_template: formData.description_template || null,
        business_ratio: formData.business_ratio ? Number(formData.business_ratio) / 100 : null,
        business_ratio_note: formData.business_ratio_note || null,
        entry_type_hint: formData.entry_type_hint !== 'normal' ? formData.entry_type_hint : null,
        requires_manual_review: formData.requires_manual_review || null,
      },
      auto_apply: formData.auto_apply,
      require_confirmation: formData.require_confirmation,
      is_active: true,
    };

    if (editingRule) {
      const { error } = await supabase.from('processing_rules').update(ruleData).eq('id', editingRule.id);
      if (error) { alert('更新に失敗しました: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('processing_rules').insert([ruleData]);
      if (error) { alert('登録に失敗しました: ' + error.message); return; }
    }
    setShowModal(false); setEditingRule(null); resetForm(); loadData();
  };

  const handleDelete = async (rule: Rule) => {
    if (!window.confirm(`このルールを削除しますか？\n取引先: ${rule.conditions?.supplier_pattern || '-'}\n勘定科目: ${getAccountName(rule)}`)) return;
    const { error } = await supabase.from('processing_rules').delete().eq('id', rule.id);
    if (error) alert('削除に失敗しました: ' + error.message);
    else loadData();
  };

  const handleToggleActive = async (rule: Rule) => {
    await supabase.from('processing_rules').update({ is_active: !rule.is_active }).eq('id', rule.id);
    loadData();
  };

  // ============================================
  // フィルタリング（タブ + 検索）
  // ============================================
  const filteredRules = useMemo(() => {
    return rules.filter(rule => {
      if (activeTab !== 'all' && rule.scope !== activeTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const ruleName = (rule.rule_name || '').toLowerCase();
        const supplierPattern = (rule.conditions?.supplier_pattern || '').toLowerCase();
        const transactionPattern = (rule.conditions?.transaction_pattern || '').toLowerCase();
        const itemPattern = (rule.conditions?.item_pattern || '').toLowerCase();
        const accountName = getAccountName(rule).toLowerCase();
        const taxName = getTaxCategoryName(rule).toLowerCase();
        const scopeName = getScopeName(rule).toLowerCase();
        return ruleName.includes(q) || supplierPattern.includes(q) || transactionPattern.includes(q) ||
          itemPattern.includes(q) || accountName.includes(q) || taxName.includes(q) || scopeName.includes(q);
      }
      return true;
    });
  }, [rules, activeTab, searchQuery]);

  // ============================================
  // ヘルパー
  // ============================================
  const getAccountName = (rule: Rule) => {
    const id = rule.actions?.account_item_id;
    return id ? (accountItems.find(a => a.id === id)?.name || '-') : '-';
  };

  const getTaxCategoryName = (rule: Rule) => {
    const id = rule.actions?.tax_category_id;
    if (!id) return '-';
    const tc = taxCategories.find(t => t.id === id);
    return tc?.display_name ?? tc?.name ?? '-';
  };

  const getScopeName = (rule: Rule) => {
    if (rule.scope === 'client') return rule.client?.name || '顧客別';
    if (rule.scope === 'industry') return rule.industry?.name || '業種別';
    return '共通';
  };

  const getScopeStyle = (rule: Rule) => {
    if (rule.scope === 'client') return { icon: <User size={16} />, color: 'text-violet-600' };
    if (rule.scope === 'industry') return { icon: <Building2 size={16} />, color: 'text-cyan-600' };
    return { icon: <Globe size={16} />, color: 'text-green-600' };
  };

  const getAmountRange = (rule: Rule) => {
    const min = rule.conditions?.amount_min;
    const max = rule.conditions?.amount_max;
    if (!min && !max) return '-';
    return `${min?.toLocaleString() ?? '0'}〜${max?.toLocaleString() ?? '∞'}`;
  };

  const getBusinessRatio = (rule: Rule) => {
    const ratio = rule.actions?.business_ratio;
    if (!ratio) return null;
    return Math.round(Number(ratio) * 100);
  };

  const sharedCount = rules.filter(r => r.scope === 'shared').length;
  const industryCount = rules.filter(r => r.scope === 'industry').length;
  const clientCount = rules.filter(r => r.scope === 'client').length;

  // U1: 全ルール一括重複チェック
  const [duplicates, setDuplicates] = useState<Array<{ rule1: Rule; rule2: Rule }>>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);

  const handleCheckAllDuplicates = () => {
    const dups: Array<{ rule1: Rule; rule2: Rule }> = [];
    const activeRules = rules.filter(r => r.is_active);
    for (let i = 0; i < activeRules.length; i++) {
      for (let j = i + 1; j < activeRules.length; j++) {
        const a = activeRules[i];
        const b = activeRules[j];
        // 同じ取引先パターン AND 同じ勘定科目
        const sameSupplier = a.conditions?.supplier_pattern && b.conditions?.supplier_pattern &&
          a.conditions.supplier_pattern.toLowerCase() === b.conditions.supplier_pattern.toLowerCase();
        //const sameAccount = a.actions?.account_item_id && b.actions?.account_item_id &&
          //a.actions.account_item_id === b.actions.account_item_id;
        // 同じ取引先パターン（勘定科目違い）も警告
        if (sameSupplier) {
          dups.push({ rule1: a, rule2: b });
        }
      }
    }
    setDuplicates(dups);
    setShowDuplicates(true);
    if (dups.length === 0) alert('重複ルールは見つかりませんでした');
  };

  // ============================================
  // レンダリング
  // ============================================
  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">読み込み中...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">仕訳ルール管理</h1>
          <p className="text-sm text-gray-500 mt-1">仕訳自動生成のルールを管理します。優先度が低い（数字が小さい）ほど優先的に適用されます。</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCheckAllDuplicates} className="flex items-center gap-2 px-3 py-2 border border-orange-300 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-50">
            ⚠ 重複チェック
          </button>
          <button onClick={handleOpenNewModal} className="flex items-center gap-2 btn-primary">
            <Plus size={18} /> 新規ルール作成
          </button>
        </div>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-4 gap-3">
        {([
          { key: 'all' as const, label: '全ルール', count: rules.length, color: 'text-gray-900' },
          { key: 'shared' as const, label: '共通', count: sharedCount, color: 'text-green-600' },
          { key: 'industry' as const, label: '業種別', count: industryCount, color: 'text-cyan-600' },
          { key: 'client' as const, label: '顧客別', count: clientCount, color: 'text-violet-600' },
        ]).map(({ key, label, count, color }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`bg-white rounded-lg border p-4 text-left transition-all ${activeTab === key ? 'border-blue-400 shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}>
            <div className={`text-2xl font-bold ${color} mb-1`}>{count}</div>
            <div className="text-sm text-gray-600">{label}</div>
          </button>
        ))}
      </div>

      {/* U1: 重複チェック結果 */}
      {showDuplicates && duplicates.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-orange-800">⚠ 重複の可能性があるルール（{duplicates.length}組）</h3>
            <button onClick={() => setShowDuplicates(false)} className="text-xs text-orange-600 hover:underline">閉じる</button>
          </div>
          <div className="space-y-2">
            {duplicates.map((d, i) => {
              const lowerPriority = d.rule1.priority >= d.rule2.priority ? d.rule1 : d.rule2;
              return (
              <div key={i} className="bg-white rounded p-2 text-xs text-gray-700 border border-orange-100 flex items-center justify-between">
                <div>
                  <span className="font-medium">#{d.rule1.priority} {d.rule1.rule_name}</span>
                  <span className="mx-2 text-orange-400">↔</span>
                  <span className="font-medium">#{d.rule2.priority} {d.rule2.rule_name}</span>
                  <span className="ml-2 text-gray-400">（パターン: {d.rule1.conditions?.supplier_pattern}）</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                  <button onClick={async () => {
                    if (!window.confirm(`「${lowerPriority.rule_name}」（優先度${lowerPriority.priority}）を無効化しますか？`)) return;
                    await supabase.from('processing_rules').update({ is_active: false }).eq('id', lowerPriority.id);
                    loadData();
                    setDuplicates(prev => prev.filter((_, idx) => idx !== i));
                  }} className="px-2 py-1 text-[10px] bg-orange-100 text-orange-700 rounded hover:bg-orange-200 whitespace-nowrap">
                    低優先を無効化
                  </button>
                  <button onClick={async () => {
                    if (!window.confirm(`「${lowerPriority.rule_name}」を完全に削除しますか？この操作は元に戻せません。`)) return;
                    await supabase.from('processing_rules').delete().eq('id', lowerPriority.id);
                    loadData();
                    setDuplicates(prev => prev.filter((_, idx) => idx !== i));
                  }} className="px-2 py-1 text-[10px] bg-red-100 text-red-700 rounded hover:bg-red-200 whitespace-nowrap">
                    削除
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ツールバー: タブ + 検索 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {([
            { key: 'all' as const, label: 'すべて' },
            { key: 'shared' as const, label: '共通' },
            { key: 'industry' as const, label: '業種別' },
            { key: 'client' as const, label: '顧客別' },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="取引先・勘定科目・摘要で検索..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">ルール一覧</h2>
          <p className="text-xs text-gray-400 mt-0.5">顧客別ルール ＞ 業種別ルール ＞ 共通ルールの順で適用されます。</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" style={{ width: 70 }}>優先度</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap" style={{ width: 90 }}>種別</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">適用範囲</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">ルール名 / 条件</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">金額範囲</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">勘定科目</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">税区分</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">按分/フラグ</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap" style={{ width: 80 }}>状態</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase" style={{ width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-gray-500">
                    {rules.length === 0 ? 'ルールがまだ登録されていません。「新規ルール作成」から追加してください。' : '該当するルールがありません'}
                  </td>
                </tr>
              ) : filteredRules.map(rule => {
                const scopeStyle = getScopeStyle(rule);
                const ratio = getBusinessRatio(rule);
                return (
                  <tr key={rule.id} className={`hover:bg-gray-50 transition-colors ${!rule.is_active ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-sm font-bold text-gray-700">{rule.priority}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${rule.rule_type === '支出' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                        {rule.rule_type === '支出' ? '↓' : '↑'} {rule.rule_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${scopeStyle.color}`}>
                        {scopeStyle.icon} {getScopeName(rule)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{rule.rule_name}</div>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {rule.conditions?.supplier_pattern && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700">取引先: {rule.conditions.supplier_pattern}</span>
                        )}
                        {rule.conditions?.item_pattern && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700">品目: {rule.conditions.item_pattern}</span>
                        )}
                        {rule.conditions?.transaction_pattern && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">摘要: {rule.conditions.transaction_pattern}</span>
                        )}
                        {rule.conditions?.payment_method && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-700">支払: {rule.conditions.payment_method}</span>
                        )}
                        {rule.conditions?.document_type && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-orange-50 text-orange-700">種別: {rule.conditions.document_type}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{getAmountRange(rule)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{getAccountName(rule)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{getTaxCategoryName(rule)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        {ratio != null && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">{ratio}%</span>
                        )}
                        {rule.actions?.entry_type_hint && rule.actions.entry_type_hint !== 'normal' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700">
                            {rule.actions.entry_type_hint === 'fixed_asset' ? '資産' : rule.actions.entry_type_hint === 'prepaid' ? '前払' : '逆仕訳'}
                          </span>
                        )}
                        {rule.actions?.requires_manual_review && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-red-50 text-red-700">要確認</span>
                        )}
                        {!ratio && !rule.actions?.entry_type_hint && !rule.actions?.requires_manual_review && (
                          <span className="text-gray-300">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleToggleActive(rule)}>
                        {rule.is_active ? (
                          <span className="inline-flex px-2.5 py-0.5 rounded-md text-xs font-semibold bg-green-50 text-green-600 border border-green-200 whitespace-nowrap">有効</span>
                        ) : (
                          <span className="inline-flex px-2.5 py-0.5 rounded-md text-xs font-semibold bg-gray-50 text-gray-400 border border-gray-200 whitespace-nowrap">無効</span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleOpenEditModal(rule)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="編集"><Edit size={16} /></button>
                        <button onClick={() => handleDelete(rule)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="削除"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 text-sm text-gray-500">
          {filteredRules.length} 件表示 / 全 {rules.length} 件
        </div>
      </div>

      {/* ===== モーダル ===== */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingRule(null); resetForm(); }}
        title={editingRule ? 'ルール編集' : '新規ルール作成'} size="xl">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ルール名（内部識別用・任意） */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">ルール名 <span className="text-xs text-gray-400">（任意・内部識別用）</span></label>
              <input type="text" value={formData.rule_name} onChange={e => setFormData({ ...formData, rule_name: e.target.value })}
                className="input" placeholder="空欄なら自動生成されます" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">優先度 <span className="text-red-500">*</span></label>
              <input type="number" required min="1" value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value })}
                className="input" placeholder="100" />
              <p className="text-xs text-gray-500 mt-1">小さいほど優先</p>
            </div>
          </div>

          {/* 種別・適用範囲 */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">種別 *</label>
              <div className="flex gap-4">
                {(['支出', '収入'] as const).map(type => (
                  <label key={type} className="flex items-center cursor-pointer">
                    <input type="radio" name="rule_type" value={type} checked={formData.rule_type === type}
                      onChange={e => setFormData({ ...formData, rule_type: e.target.value as any })} className="mr-2" />
                    <span className="text-sm text-gray-700">{type}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">適用範囲 *</label>
              <div className="flex gap-4">
                {([
                  { value: 'shared', label: '共通', icon: <Globe size={14} /> },
                  { value: 'industry', label: '業種別', icon: <Building2 size={14} /> },
                  { value: 'client', label: '顧客別', icon: <User size={14} /> },
                ] as const).map(({ value, label, icon }) => (
                  <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="scope" value={value} checked={formData.scope === value}
                      onChange={e => setFormData({ ...formData, scope: e.target.value as any })} />
                    {icon}<span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {formData.scope === 'industry' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">業種 *</label>
              <select required value={formData.industry_id} onChange={e => setFormData({ ...formData, industry_id: e.target.value })} className="input">
                <option value="">選択してください</option>
                {industries.map(ind => <option key={ind.id} value={ind.id}>{ind.name}</option>)}
              </select>
            </div>
          )}
          {formData.scope === 'client' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">顧客 *</label>
              <select required value={formData.client_id} onChange={e => setFormData({ ...formData, client_id: e.target.value })} className="input">
                <option value="">選択してください</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {/* 条件 */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">マッチ条件</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">取引先パターン</label>
              <input type="text" value={formData.supplier_pattern}
                onChange={e => { setFormData({ ...formData, supplier_pattern: e.target.value }); checkDuplicate(e.target.value, formData.account_item_id); }}
                className="input" placeholder="例: エネオス（部分一致）" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">摘要パターン</label>
              <input type="text" value={formData.transaction_pattern} onChange={e => setFormData({ ...formData, transaction_pattern: e.target.value })}
                className="input" placeholder="例: ガソリン（部分一致）" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">最小金額</label>
                <input type="number" value={formData.amount_min} onChange={e => setFormData({ ...formData, amount_min: e.target.value })}
                  className="input" placeholder="0" min="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">最大金額</label>
                <input type="number" value={formData.amount_max} onChange={e => setFormData({ ...formData, amount_max: e.target.value })}
                  className="input" placeholder="上限なし" min="0" />
              </div>
            </div>
            {/* 品目パターン */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">品目パターン</label>
              <input type="text" value={formData.item_pattern} onChange={e => setFormData({ ...formData, item_pattern: e.target.value })}
                className="input" placeholder="例: コピー用紙（部分一致）" />
            </div>

            {/* 支払方法・証憑種別 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">支払方法</label>
                <select value={formData.payment_method_condition} onChange={e => setFormData({ ...formData, payment_method_condition: e.target.value })} className="input">
                  <option value="">指定なし</option>
                  <option value="cash">現金</option>
                  <option value="credit_card">クレジットカード</option>
                  <option value="bank_transfer">銀行振込</option>
                  <option value="e_money">電子マネー/QR決済</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">証憑種別</label>
                <select value={formData.document_type_condition} onChange={e => setFormData({ ...formData, document_type_condition: e.target.value })} className="input">
                  <option value="">指定なし</option>
                  <option value="receipt">レシート/領収書</option>
                  <option value="invoice">請求書</option>
                  <option value="bank_statement">銀行通帳</option>
                  <option value="credit_card">クレカ明細</option>
                  <option value="etc_statement">ETC利用明細</option>
                  <option value="e_money_statement">電子マネー/QR決済</option>
                  <option value="expense_report">経費精算書</option>
                  <option value="payroll">給与明細</option>
                  <option value="sales_report">売上集計表</option>
                  <option value="payment_notice">支払通知書</option>
                </select>
              </div>
            </div>
          </div>

          {/* 重複警告（R2） */}
          {duplicateWarning && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 flex items-center gap-2">
              ⚠️ {duplicateWarning}
            </div>
          )}

          {/* アクション */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">適用アクション</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">勘定科目 <span className="text-red-500">*</span></label>
              <select required value={formData.account_item_id}
                onChange={e => { setFormData({ ...formData, account_item_id: e.target.value }); checkDuplicate(formData.supplier_pattern, e.target.value); }}
                className="input">
                <option value="">選択してください</option>
                {accountItems.map(item => <option key={item.id} value={item.id}>{item.code} {item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">税区分</label>
              <select value={formData.tax_category_id} onChange={e => setFormData({ ...formData, tax_category_id: e.target.value })} className="input">
                <option value="">選択してください</option>
                {taxCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.display_name ?? cat.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">摘要テンプレート</label>
                <input type="text" value={formData.description_template} onChange={e => setFormData({ ...formData, description_template: e.target.value })}
                  className="input" placeholder="例: ガソリン代 {supplier}" />
                <p className="text-xs text-gray-500 mt-1">{`{supplier}`} で取引先名を埋め込み</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">家事按分（事業用%）</label>
                <div className="relative">
                  <input type="number" value={formData.business_ratio} onChange={e => setFormData({ ...formData, business_ratio: e.target.value })}
                    className="input pr-8" placeholder="空欄=按分なし" min="0" max="100" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
                {formData.business_ratio && (
                  <p className="text-xs text-yellow-700 mt-1">事業用 {formData.business_ratio}% / 私用 {100 - Number(formData.business_ratio)}%</p>
                )}
              </div>
              {/* 按分根拠メモ（家事按分入力時のみ表示） */}
              {formData.business_ratio && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">按分根拠メモ</label>
                  <input type="text" value={formData.business_ratio_note} onChange={e => setFormData({ ...formData, business_ratio_note: e.target.value })}
                    className="input" placeholder="例: 自動車は週5日業務使用" />
                </div>
              )}

              {/* 特殊仕訳・強制レビュー */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">仕訳タイプ</label>
                  <select value={formData.entry_type_hint} onChange={e => setFormData({ ...formData, entry_type_hint: e.target.value })} className="input">
                    <option value="normal">通常</option>
                    <option value="fixed_asset">固定資産取得</option>
                    <option value="prepaid">前払費用</option>
                    <option value="reversal">逆仕訳</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer pb-2">
                    <input type="checkbox" checked={formData.requires_manual_review}
                      onChange={e => setFormData({ ...formData, requires_manual_review: e.target.checked })} />
                    <span className="text-sm text-gray-700">強制レビュー対象にする</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* フラグ */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.auto_apply} onChange={e => setFormData({ ...formData, auto_apply: e.target.checked })} />
              <span className="text-sm text-gray-700">自動適用</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.require_confirmation} onChange={e => setFormData({ ...formData, require_confirmation: e.target.checked })} />
              <span className="text-sm text-gray-700">確認を必要とする</span>
            </label>
          </div>

          {/* ボタン */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => { setShowModal(false); setEditingRule(null); resetForm(); }}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
            <button type="submit" className="btn-primary">{editingRule ? '更新する' : '登録する'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}