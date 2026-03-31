import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Plus, ChevronRight, Users } from 'lucide-react';
import { rulesApi, industriesApi, clientsApi, accountItemsApi, taxCategoriesApi } from '@/web/shared/lib/api/backend.api';
import type { AccountItem, TaxCategory } from '@/types';
import { RuleRow } from './RulesIndexPage';

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
      industriesApi.getAll({ is_active: 'true' }),
      rulesApi.getAll({ scope: 'industry', industry_id: industryId, is_active: 'true' }),
      rulesApi.getAll({ scope: 'shared', is_active: 'true' }),
      accountItemsApi.getAll({ is_active: 'true' }),
      taxCategoriesApi.getAll(),
      clientsApi.getAll(),
    ]);
    const foundIndustry = indRes.data?.find((i: any) => i.id === industryId) || null;
    if (foundIndustry) setIndustry(foundIndustry);
    if (indRulesRes.data) setIndustryRules(indRulesRes.data);
    if (sharedRes.data) setSharedRules(sharedRes.data);
    if (acctRes.data) setAccountItems(acctRes.data as AccountItem[]);
    if (taxRes.data) setTaxCategories(taxRes.data as TaxCategory[]);
    setClientCount(clientRes.data?.filter((c: any) => c.industry_id === industryId).length || 0);
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
    const { error } = await rulesApi.update(ruleId, {
      conditions: data.conditions, actions: data.actions, priority: data.priority,
    });
    if (error) alert('保存失敗: ' + error);
    else loadData();
  };

  const handleDelete = async (rule: any) => {
    if (!confirm(`「${rule.rule_name}」を削除しますか？`)) return;
    await rulesApi.delete(rule.id);
    loadData();
  };

  const handleDerive = async () => {
    if (!derivingRule || !deriveAccountId) { alert('勘定科目を選択してください'); return; }
    const acctName = accountItems.find(a => a.id === deriveAccountId)?.name || '';
    const { error } = await rulesApi.create({
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
    if (error) alert('作成失敗: ' + error);
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
