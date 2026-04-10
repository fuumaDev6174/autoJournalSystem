/**
 * @module 事業/私用トグル
 */
import ComboBox from '@/web/shared/components/ui/ComboBox';
import { useReview } from '../context/ReviewContext';

export default function BusinessToggleRow() {
  const {
    ci, form, accountItems, taxCategories, industries,
    businessRatio, addRule, setAddRule, ruleScope, setRuleScope,
    ruleIndustryId, setRuleIndustryId, ruleSuggestion, setRuleSuggestion,
    supplierText, setBusiness,
  } = useReview();
  if (!ci) return null;
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2">
        <div className="flex border border-gray-300 rounded-lg overflow-hidden">
          <button type="button" onClick={() => setBusiness(true)}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${form.isBusiness && !form.isExcluded ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>事業用</button>
          <button type="button" onClick={() => setBusiness(false)}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${!form.isBusiness && !form.isExcluded ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>プライベート</button>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-gray-50 font-mono text-gray-500">P</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={addRule} onChange={e => { setAddRule(e.target.checked); if (!e.target.checked) setRuleSuggestion(''); }} className="w-4 h-4 text-blue-600 rounded" />
          <span className="text-xs font-medium">ルール追加</span>
        </label>
        <span className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-gray-50 font-mono text-gray-500">R</span>
        {addRule && (
          <div className="flex items-center gap-1.5">
            <select value={ruleScope} onChange={e => setRuleScope(e.target.value as any)}
              className="border border-gray-300 rounded-md p-1.5 text-xs bg-white">
              <option value="shared">汎用</option>
              <option value="industry">業種別</option>
              <option value="client">顧客別</option>
            </select>
            {ruleScope === 'industry' && (
              <ComboBox value={ruleIndustryId} onChange={setRuleIndustryId}
                options={industries.map(ind => ({ id: ind.id, name: ind.name }))}
                placeholder="業種を選択" />
            )}
          </div>
        )}
      </div>
      {addRule && (
        <div className="w-full bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-[10px] text-blue-800 space-y-0.5">
          {ruleSuggestion && <div className="font-medium text-blue-600">{ruleSuggestion}</div>}
          <div>パターン: {supplierText || form.description || ci.supplierName || '取引先'}</div>
          <div>→ 勘定科目: {accountItems.find(a => a.id === form.accountItemId)?.name || '未設定'}
            {form.taxCategoryId && ` / 税区分: ${taxCategories.find(t => t.id === form.taxCategoryId)?.name || ''}`}
            {businessRatio < 100 && ` / 按分: ${businessRatio}%`}
          </div>
        </div>
      )}
    </div>
  );
}
