import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, ChevronRight } from 'lucide-react';
import { supabase } from '@/client/lib/supabase';
import type { AccountItem, TaxCategory } from '@/types';
import { RuleRow } from './index';

export default function ClientDetailPage() {
  const { industryId, clientId } = useParams<{ industryId: string; clientId: string }>();
  const navigate = useNavigate();

  const [industry, setIndustry] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [clientRules, setClientRules] = useState<any[]>([]);
  const [industryRules, setIndustryRules] = useState<any[]>([]);
  const [sharedRules, setSharedRules] = useState<any[]>([]);
  const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showInherited, setShowInherited] = useState(false);
  const [loading, setLoading] = useState(true);

  // 派生作成
  const [derivingRule, setDerivingRule] = useState<any>(null);
  const [derivingScope, setDerivingScope] = useState<'industry' | 'shared'>('shared');
  const [deriveAccountId, setDeriveAccountId] = useState('');
  const [deriveTaxCatId, setDeriveTaxCatId] = useState('');
  const [deriveRatio, setDeriveRatio] = useState('');
  const [deriveRatioNote, setDeriveRatioNote] = useState('');

  useEffect(() => { if (industryId && clientId) loadData(); }, [industryId, clientId]);

  const loadData = async () => {
    setLoading(true);
    const [indRes, clRes, clRulesRes, indRulesRes, sharedRes, acctRes, taxRes] = await Promise.all([
      supabase.from('industries').select('*').eq('id', industryId).single(),
      supabase.from('clients').select('*').eq('id', clientId).single(),
      supabase.from('processing_rules').select('*').eq('scope', 'client').eq('client_id', clientId).eq('is_active', true).order('priority'),
      supabase.from('processing_rules').select('*').eq('scope', 'industry').eq('industry_id', industryId).eq('is_active', true).order('priority'),
      supabase.from('processing_rules').select('*').eq('scope', 'shared').eq('is_active', true).order('priority'),
      supabase.from('account_items').select('id, code, name').eq('is_active', true).order('code'),
      supabase.from('tax_categories').select('id, code, name').eq('is_active', true).order('sort_order'),
    ]);
    if (indRes.data) setIndustry(indRes.data);
    if (clRes.data) setClient(clRes.data);
    if (clRulesRes.data) setClientRules(clRulesRes.data);
    if (indRulesRes.data) setIndustryRules(indRulesRes.data);
    if (sharedRes.data) setSharedRules(sharedRes.data);
    if (acctRes.data) setAccountItems(acctRes.data as AccountItem[]);
    if (taxRes.data) setTaxCategories(taxRes.data as TaxCategory[]);
    setLoading(false);
  };

  const toggle = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  // 派生済み汎用ルール除外（業種ルールから）
  const derivedSharedIds = new Set(industryRules.filter(r => r.derived_from_rule_id).map(r => r.derived_from_rule_id));
  const filteredShared = sharedRules.filter(r => !derivedSharedIds.has(r.id));

  const getParentRule = (derivedFromId: string | null) => {
    if (!derivedFromId) return null;
    return sharedRules.find(r => r.id === derivedFromId) || industryRules.find(r => r.id === derivedFromId) || null;
  };

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

  const startDeriving = (rule: any, scope: 'industry' | 'shared') => {
    setDerivingRule(rule);
    setDerivingScope(scope);
    setDeriveAccountId('');
    setDeriveTaxCatId(rule.actions?.tax_category_id || '');
    setDeriveRatio(rule.actions?.business_ratio ? String(Math.round(Number(rule.actions.business_ratio) * 100)) : '');
    setDeriveRatioNote('');
  };

  const handleDerive = async () => {
    if (!derivingRule || !deriveAccountId) { alert('勘定科目を選択してください'); return; }
    const acctName = accountItems.find(a => a.id === deriveAccountId)?.name || '';
    const { error } = await supabase.from('processing_rules').insert({
      scope: 'client',
      client_id: clientId,
      industry_id: industryId,
      rule_name: `${derivingRule.conditions?.supplier_pattern || derivingRule.conditions?.document_type || '—'} → ${acctName}（${client?.name}）`,
      priority: 200,
      rule_type: derivingRule.rule_type || '支出',
      conditions: { ...derivingRule.conditions },
      actions: {
        account_item_id: deriveAccountId,
        tax_category_id: deriveTaxCatId || null,
        business_ratio: deriveRatio ? Number(deriveRatio) / 100 : null,
        business_ratio_note: deriveRatioNote || null,
        description_template: derivingRule.actions?.description_template || null,
      },
      derived_from_rule_id: derivingRule.id,
      is_active: true,
      auto_apply: true,
    });
    if (error) alert('作成失敗: ' + error.message);
    else {
      setDerivingRule(null);
      setDeriveAccountId('');
      setDeriveTaxCatId('');
      setDeriveRatio('');
      setDeriveRatioNote('');
      loadData();
    }
  };

  const scopeLabel = derivingScope === 'industry' ? '業種別' : '汎用';

  if (loading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!client || !industry) return <div className="text-center py-20 text-gray-400">データが見つかりません</div>;

  return (
    <div className="space-y-4">
      {/* パンくず */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="cursor-pointer text-blue-600 font-medium" onClick={() => navigate('/master/rules?tab=industry')}>仕訳ルール管理</span>
        <ChevronRight size={12} className="text-gray-300" />
        <span className="cursor-pointer text-blue-600 font-medium" onClick={() => navigate(`/master/rules/industry/${industryId}`)}>{industry.name}</span>
        <ChevronRight size={12} className="text-gray-300" />
        <span className="cursor-pointer text-blue-600 font-medium" onClick={() => navigate(`/master/rules/industry/${industryId}/clients`)}>顧客一覧</span>
        <ChevronRight size={12} className="text-gray-300" />
        <span className="font-semibold text-gray-900">{client.name}</span>
      </div>

      {/* 顧客情報カード */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-extrabold text-gray-900">{client.name}</h1>
            <span className="text-xs text-gray-400">業種: {industry.name}</span>
          </div>
          <span className="bg-red-100 text-red-700 px-3 py-1 rounded-md text-xs font-bold">
            📋 {clientRules.length} 顧客別ルール
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] font-semibold text-gray-400 mb-0.5">課税区分</div>
            <div className="text-sm font-semibold text-gray-900">{client.tax_category || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-gray-400 mb-0.5">インボイス</div>
            <div className={`text-sm font-semibold ${client.invoice_registered ? 'text-green-600' : 'text-gray-400'}`}>
              {client.invoice_registered ? '登録済' : '未登録'}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-gray-400 mb-0.5">年間売上</div>
            <div className="text-sm font-semibold text-gray-900">
              {client.annual_sales ? `¥${client.annual_sales.toLocaleString()}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-gray-400 mb-0.5">適用ルール合計</div>
            <div className="text-sm font-semibold text-gray-900">
              {filteredShared.length + industryRules.length + clientRules.length}件
            </div>
            <div className="text-[10px] text-gray-400">
              汎用{filteredShared.length} + 業種{industryRules.length} + 個別{clientRules.length}
            </div>
          </div>
        </div>
      </div>

      {/* 顧客別ルール */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-gray-900">顧客別ルール</h2>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <div onClick={() => setShowInherited(!showInherited)}
                className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${showInherited ? 'bg-blue-600' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow ${showInherited ? 'left-[18px]' : 'left-0.5'}`} />
              </div>
              <span className={`text-xs font-medium ${showInherited ? 'text-blue-700' : 'text-gray-500'}`}>
                継承ルールも表示（業種{industryRules.length} + 汎用{filteredShared.length}件）
              </span>
            </label>
          </div>
          <button className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-md hover:bg-red-700">
            <Plus size={13} /> 顧客ルール追加
          </button>
        </div>

        {/* 派生作成パネル */}
        {derivingRule && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-2">
            <div className="text-xs font-bold text-red-700 mb-3">
              ✨ {scopeLabel}ルール「{derivingRule.rule_name}」から顧客別ルールを派生
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-semibold text-gray-500 mb-1.5">条件（{scopeLabel}から引き継ぎ）</div>
                <div className="bg-white p-2 rounded border border-red-200 text-xs">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${derivingScope === 'industry' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                      {scopeLabel}
                    </span>
                    <span className="font-semibold">{derivingRule.conditions?.supplier_pattern || derivingRule.conditions?.document_type || '—'}</span>
                    <span className="text-gray-300">→</span>
                    <span className="font-semibold text-gray-500">{accountItems.find(a => a.id === derivingRule.actions?.account_item_id)?.name || '—'}</span>
                  </div>
                  {derivingRule.conditions?.transaction_pattern && (
                    <div className="text-[10px] text-gray-400">摘要: {derivingRule.conditions.transaction_pattern}</div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">勘定科目（この顧客用）</label>
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
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">家事按分率(%)</label>
                    <input type="number" value={deriveRatio} onChange={e => setDeriveRatio(e.target.value)}
                      placeholder="100" className="w-full p-1.5 text-xs border border-gray-300 rounded" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">按分根拠</label>
                    <input value={deriveRatioNote} onChange={e => setDeriveRatioNote(e.target.value)}
                      placeholder="理由" className="w-full p-1.5 text-xs border border-gray-300 rounded" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-1.5 mt-3 justify-end">
              <button onClick={() => setDerivingRule(null)}
                className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50">キャンセル</button>
              <button onClick={handleDerive}
                className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700">顧客別ルールとして保存</button>
            </div>
          </div>
        )}

        {/* ルール一覧 */}
        <div className="space-y-px">
          {/* 顧客別ルール（薄赤） */}
          {clientRules.map(rule => (
            <RuleRow key={rule.id} rule={rule} scope="client" expanded={expandedIds.has(rule.id)} onToggle={() => toggle(rule.id)}
              onDelete={() => handleDelete(rule)} onSave={(data) => handleSave(rule.id, data)}
              parentRule={getParentRule(rule.derived_from_rule_id)}
              accountItems={accountItems} taxCategories={taxCategories} />
          ))}

          {clientRules.length === 0 && !showInherited && (
            <div className="bg-red-50/50 rounded-md border border-dashed border-red-200 py-8 text-center">
              <div className="text-xs text-gray-400">個別ルールなし — 汎用・業種別ルールが適用されます</div>
            </div>
          )}

          {/* 継承ルール（トグルONで連続表示） */}
          {showInherited && (
            <>
              {/* 業種ルール（薄青） */}
              {industryRules.map(rule => (
                <RuleRow key={`ind-${rule.id}`} rule={rule} scope="industry" expanded={false} onToggle={() => {}} editable={false}
                  parentRule={getParentRule(rule.derived_from_rule_id)}
                  onCopyDerive={() => startDeriving(rule, 'industry')}
                  accountItems={accountItems} taxCategories={taxCategories} />
              ))}
              {/* 汎用ルール（グレー、派生済み除外） */}
              {filteredShared.map(rule => (
                <RuleRow key={`sh-${rule.id}`} rule={rule} scope="shared" expanded={false} onToggle={() => {}} editable={false}
                  onCopyDerive={() => startDeriving(rule, 'shared')}
                  accountItems={accountItems} taxCategories={taxCategories} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}