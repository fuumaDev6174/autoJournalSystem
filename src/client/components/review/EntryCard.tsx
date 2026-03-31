import {
  ChevronLeft, ChevronRight, Ban, Loader, CheckCircle, StickyNote
} from 'lucide-react';
import ComboBox from '@/client/components/ui/ComboBox';
import type { AccountItem, TaxCategory, Supplier } from '@/types';
import type { DocumentWithEntry, TaxRateOption } from '@/client/pages/review';

interface EntryCardProps {
  ci: DocumentWithEntry;
  form: Partial<DocumentWithEntry>;
  setForm: React.Dispatch<React.SetStateAction<Partial<DocumentWithEntry>>>;
  accountItems: AccountItem[];
  taxCategories: TaxCategory[];
  taxRates: TaxRateOption[];
  suppliers: Supplier[];
  itemsMaster: Array<{ id: string; name: string; code: string | null; default_account_item_id: string | null; default_tax_category_id: string | null }>;
  industries: Array<{ id: string; name: string }>;
  businessRatio: number;
  setBusinessRatio: React.Dispatch<React.SetStateAction<number>>;
  clientRatios: Array<{ account_item_id: string; business_ratio: number }>;
  isManagerOrAdmin: boolean;
  currentIndex: number;
  itemsCount: number;
  saving: boolean;
  savedAt: string | null;
  addRule: boolean;
  setAddRule: React.Dispatch<React.SetStateAction<boolean>>;
  ruleScope: 'shared' | 'industry' | 'client';
  setRuleScope: React.Dispatch<React.SetStateAction<'shared' | 'industry' | 'client'>>;
  ruleIndustryId: string;
  setRuleIndustryId: React.Dispatch<React.SetStateAction<string>>;
  ruleSuggestion: string;
  setRuleSuggestion: React.Dispatch<React.SetStateAction<string>>;
  supplierText: string;
  setSupplierText: React.Dispatch<React.SetStateAction<string>>;
  itemText: string;
  setItemText: React.Dispatch<React.SetStateAction<string>>;
  handleAccountItemChange: (accountItemId: string) => void;
  handleSupplierChange: (supplierId: string) => void;
  handleItemChange: (itemId: string) => void;
  setBusiness: (isBusiness: boolean) => void;
  toggleExclude: () => void;
  goNext: () => Promise<void>;
  goPrev: () => Promise<void>;
  saveCurrentItem: (markApproved?: boolean) => Promise<void>;
  setViewMode: (mode: 'list' | 'detail') => void;
  loadAllData: () => Promise<void>;
  onCreateSupplier: (name: string) => Promise<void>;
  onCreateItem: (name: string) => Promise<void>;
  fmt: (n: number | undefined) => string;
  // multi-entry
  isMultiEntry: boolean;
  siblingItems: DocumentWithEntry[];
  onSwitchSibling: (sib: DocumentWithEntry) => void;
}

export default function EntryCard({
  ci, form, setForm, accountItems, taxCategories, taxRates, suppliers, itemsMaster, industries,
  businessRatio, setBusinessRatio, clientRatios, isManagerOrAdmin,
  currentIndex, itemsCount, saving, savedAt,
  addRule, setAddRule, ruleScope, setRuleScope, ruleIndustryId, setRuleIndustryId,
  ruleSuggestion, setRuleSuggestion, supplierText, setSupplierText, itemText, setItemText,
  handleAccountItemChange, handleSupplierChange, handleItemChange,
  setBusiness, toggleExclude, goNext, goPrev, saveCurrentItem, setViewMode, loadAllData,
  onCreateSupplier, onCreateItem, fmt,
  isMultiEntry, siblingItems, onSwitchSibling,
}: EntryCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden" style={{ minHeight: 480 }}>
      {isMultiEntry && siblingItems.length > 1 && (
        <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-indigo-600 font-medium">同一証憑の仕訳:</span>
          {siblingItems.map((sib, idx) => {
            const isCurrent = sib.entryId === ci.entryId;
            return (
              <button key={sib.entryId || idx} type="button"
                onClick={() => { if (!isCurrent) onSwitchSibling(sib); }}
                className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                  isCurrent ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                }`}>
                {idx + 1}. {sib.description?.slice(0, 15) || '明細'} {fmt(sib.lineAmount)}
              </button>
            );
          })}
        </div>
      )}
      <div className="p-3 border-b border-gray-100 flex items-center gap-2 flex-wrap flex-shrink-0">
        <span className="font-bold text-sm">仕訳データ</span>
        {ci.supplierName && <span className="text-xs px-2.5 py-0.5 rounded bg-blue-50 text-blue-600">OCR: {ci.supplierName}</span>}
        {ci.docClassification?.tategaki && (
          <span className="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-700">但: {ci.docClassification.tategaki}</span>
        )}
        {ci.docClassification?.withholding_tax_amount != null && (
          <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700">源泉: ¥{ci.docClassification.withholding_tax_amount.toLocaleString()}</span>
        )}
        {ci.docClassification?.invoice_qualification && (
          <span className={`text-xs px-2 py-0.5 rounded ${ci.docClassification.invoice_qualification === 'qualified' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
            {ci.docClassification.invoice_qualification === 'qualified' ? '適格' : '非適格'}
          </span>
        )}
        {ci.docClassification?.transaction_type && (
          <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700">
            {({purchase:'仕入',expense:'経費',asset:'資産',sales:'売上',fee:'報酬'} as Record<string,string>)[ci.docClassification.transaction_type] || ci.docClassification.transaction_type}
          </span>
        )}
        {ci.aiConfidence != null && (
          <span className={`text-xs px-2.5 py-0.5 rounded font-semibold ml-auto ${ci.aiConfidence >= 0.8 ? 'bg-green-50 text-green-700' : ci.aiConfidence >= 0.5 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
            AI信頼度 {Math.round(ci.aiConfidence * 100)}%
          </span>
        )}
      </div>
      {ci.ruleCandidates && ci.ruleCandidates.length > 0 && (
        <div className="px-3 py-1.5 bg-purple-50 border-b border-purple-100 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-purple-600 font-medium">他にマッチしたルール:</span>
          {ci.ruleCandidates.map((rc) => (
            <button key={rc.rule_id} type="button"
              onClick={() => {
                setForm(p => ({ ...p, accountItemId: rc.account_item_id }));
                handleAccountItemChange(rc.account_item_id);
              }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors cursor-pointer"
              title={`スコープ: ${rc.scope} / 優先度: ${rc.priority}`}>
              {rc.rule_name}
              <span className="ml-1 text-purple-400">({rc.scope === 'client' ? '顧客別' : rc.scope === 'industry' ? '業種別' : '汎用'})</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 p-4 flex flex-col gap-3.5 overflow-y-auto">
        {(ci.supplierName || ci.amount || ci.documentDate) && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs font-medium text-gray-500 mb-1.5">OCR読取結果（参考）</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {ci.supplierName && <div><span className="text-gray-400">取引先:</span> <span className="font-medium">{ci.supplierName}</span></div>}
              {ci.amount != null && <div><span className="text-gray-400">金額:</span> <span className="font-medium">{fmt(ci.amount)}</span></div>}
              {ci.documentDate && <div><span className="text-gray-400">日付:</span> <span className="font-medium">{new Date(ci.documentDate).toLocaleDateString('ja-JP')}</span></div>}
              {ci.taxAmount != null && <div><span className="text-gray-400">税額:</span> <span className="font-medium">{fmt(ci.taxAmount)}</span></div>}
            </div>
          </div>
        )}

        {form.isExcluded && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2"><Ban size={16} />対象外に設定されています</div>
        )}

        {/* 取引先 */}
        <div className="bg-red-50 border-[1.5px] border-red-200 rounded-lg p-3">
          <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />取引先</label>
          <ComboBox value={form.supplierId || ''} onChange={handleSupplierChange}
            options={suppliers.map(s => ({ id: s.id, name: s.name, code: s.code || undefined, short_name: s.name_kana }))}
            placeholder="取引先を検索"
            textValue={supplierText}
            onNewText={(text) => { setSupplierText(text); setForm(p => ({ ...p, supplierId: null })); setAddRule(true); setRuleSuggestion(`未登録取引先「${text}」→ ルール追加推奨`); }}
            allowCreate
            onCreateNew={onCreateSupplier} />
          {supplierText && !form.supplierId && (
            <div className="mt-1.5 bg-orange-50 border border-orange-200 rounded-lg p-2">
              <p className="text-[10px] text-orange-700 mb-1.5">
                「{supplierText}」は取引先マスタに未登録です。
              </p>
              <button type="button" onClick={() => onCreateSupplier(supplierText)}
                className="w-full text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded py-1.5 transition-colors">
                「{supplierText}」をマスタに追加して選択
              </button>
            </div>
          )}
        </div>

        {/* 取引日 / 金額 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 border-[1.5px] border-blue-200 rounded-lg p-3">
            <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />取引日</label>
            <input type="date" value={form.entryDate || ''} onChange={e => setForm(p => ({ ...p, entryDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="bg-green-50 border-[1.5px] border-green-200 rounded-lg p-3">
            <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5"><span className="w-2 h-2 rounded-full bg-green-500" />金額（円）</label>
            <input type="number" value={form.lineAmount || ''} onChange={e => setForm(p => ({ ...p, lineAmount: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* 勘定科目 / 税区分 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold mb-1.5 flex items-center gap-1">勘定科目 <span className="text-[10px] text-gray-400 font-normal">ローマ字・番号可</span></label>
            <ComboBox value={form.accountItemId || ''} onChange={handleAccountItemChange}
              options={accountItems.map(a => ({ id: a.id, name: a.name, code: a.code, short_name: a.short_name, name_kana: a.name_kana }))}
              placeholder="勘定科目を検索" />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1.5 block">税区分</label>
            <ComboBox value={form.taxCategoryId || ''}
              onChange={tcId => {
                const tc = taxCategories.find(t => t.id === tcId);
                let newRate = form.taxRate;
                if (tc?.current_tax_rate_id) {
                  const rate = taxRates.find(r => r.id === tc.current_tax_rate_id);
                  newRate = rate?.rate ?? null;
                } else {
                  newRate = null;
                }
                setForm(p => ({ ...p, taxCategoryId: tcId, taxRate: newRate }));
              }}
              options={taxCategories.map(t => ({ id: t.id, name: t.display_name || t.name, code: undefined, short_name: t.code, name_kana: null }))}
              placeholder="税区分を検索" />
          </div>
        </div>

        {/* 税率 */}
        <div className="w-1/2 pr-1.5">
          <div className="bg-yellow-50 border-[1.5px] border-yellow-200 rounded-lg p-3">
            <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" />税率</label>
            <select value={form.taxRate?.toString() || ''} onChange={e => setForm(p => ({ ...p, taxRate: e.target.value ? Number(e.target.value) : null }))}
              className="border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ minWidth: 130 }}>
              <option value="">--</option>
              {taxRates.map(r => {
                const pct = Math.round(r.rate * 100);
                const label = r.is_current
                  ? (r.name.includes('軽減') ? `${pct}%（軽）` : `${pct}%`)
                  : `${pct}%（旧）`;
                return <option key={r.id} value={r.rate}>{label}</option>;
              })}
            </select>
          </div>
        </div>

        {/* 品目 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold">品目</label>
            {(form.itemId || itemText) && (
              <button type="button" onClick={() => { setForm(p => ({ ...p, itemId: null })); setItemText(''); }}
                className="text-[10px] text-red-500 hover:underline">品目をクリア</button>
            )}
          </div>
          <ComboBox value={form.itemId || ''} onChange={handleItemChange}
            options={itemsMaster.map(it => ({ id: it.id, name: it.name, code: it.code || undefined, short_name: null }))}
            placeholder="品目を検索"
            textValue={itemText}
            onNewText={(text) => { setItemText(text); setForm(p => ({ ...p, itemId: null })); }}
            allowCreate
            onCreateNew={onCreateItem} />
          {itemText && !form.itemId && (
            <div className="mt-1.5 bg-orange-50 border border-orange-200 rounded-lg p-2">
              <p className="text-[10px] text-orange-700 mb-1.5">
                「{itemText}」は品目マスタに未登録です。
              </p>
              <button type="button" onClick={() => onCreateItem(itemText)}
                className="w-full text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded py-1.5 transition-colors">
                「{itemText}」をマスタに追加して選択
              </button>
            </div>
          )}
        </div>

        {/* 摘要 */}
        <div>
          <label className="text-xs font-semibold mb-1.5 block">摘要</label>
          <input type="text" value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="摘要を入力" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* メモ */}
        <div>
          <label className="text-xs font-semibold mb-1.5 block flex items-center gap-1">
            <StickyNote size={12} className="text-amber-500" />メモ
          </label>
          <textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="内部メモ（任意）" rows={2}
            className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
        </div>

        {/* 家事按分 */}
        {!form.isExcluded && (
          <div className={`border rounded-lg p-3 space-y-2 ${businessRatio === 100 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
            <div className="flex items-center justify-between">
              <label className={`text-xs font-semibold ${businessRatio === 100 ? 'text-blue-800' : 'text-orange-800'}`}>
                家事按分（事業用割合）
                {ci.matchedRuleBusinessRatio != null ? (
                  <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">ルール按分</span>
                ) : clientRatios.find(r => r.account_item_id === form.accountItemId) ? (
                  <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">顧客設定</span>
                ) : businessRatio < 100 ? (
                  <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">手動設定</span>
                ) : null}
              </label>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setBusinessRatio(Math.max(0, businessRatio - 1))}
                  className="w-5 h-5 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-500 text-xs hover:bg-gray-50">−</button>
                <input type="number" min={0} max={100} value={businessRatio}
                  onChange={e => setBusinessRatio(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-12 text-center text-xs font-bold border border-gray-300 rounded p-0.5" />
                <span className="text-xs text-gray-500">%</span>
                <button type="button" onClick={() => setBusinessRatio(Math.min(100, businessRatio + 1))}
                  className="w-5 h-5 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-500 text-xs hover:bg-gray-50">+</button>
              </div>
            </div>
            <input type="range" min={0} max={100} step={1} value={businessRatio}
              onChange={e => setBusinessRatio(Number(e.target.value))}
              className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${businessRatio === 100 ? 'bg-blue-200 accent-blue-500' : 'bg-orange-200 accent-orange-500'}`} />
            {businessRatio < 100 && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white rounded p-2 border border-orange-200">
                  <span className="text-orange-700 font-medium">事業用: </span>
                  <span className="font-bold">¥{Math.round((form.lineAmount || 0) * businessRatio / 100).toLocaleString()}</span>
                </div>
                <div className="bg-white rounded p-2 border border-orange-200">
                  <span className="text-gray-500 font-medium">私用: </span>
                  <span className="font-bold">¥{Math.round((form.lineAmount || 0) * (100 - businessRatio) / 100).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 事業用/プライベート + ルール追加 */}
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              <button onClick={() => setBusiness(true)}
                className={`px-4 py-1.5 text-xs font-medium transition-colors ${form.isBusiness && !form.isExcluded ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>事業用</button>
              <button onClick={() => setBusiness(false)}
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

        {/* ナビゲーション */}
        <div className="flex gap-3 pt-3 border-t border-gray-200">
          <button onClick={goPrev} disabled={currentIndex === 0}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronLeft size={16} /> 前へ
          </button>
          {currentIndex >= itemsCount - 1 ? (
            <button onClick={async () => { await saveCurrentItem(true); setViewMode('list'); loadAllData(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white ${isManagerOrAdmin ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
              <CheckCircle size={16} /> {isManagerOrAdmin ? '確認・承認して完了' : '確認OK・完了'}
            </button>
          ) : (
            <button onClick={goNext}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white ${isManagerOrAdmin ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {isManagerOrAdmin ? '承認して次へ' : '確認OK・次へ'} <ChevronRight size={16} />
            </button>
          )}
        </div>

        {/* 対象外 */}
        <button onClick={toggleExclude}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
            form.isExcluded ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-300 text-gray-500 bg-white hover:bg-gray-50'
          }`}>
          <Ban size={14} />{form.isExcluded ? '対象外を解除' : '対象外にする'}
          <span className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-white font-mono text-gray-400 ml-1">E</span>
        </button>

        {/* 保存状態 */}
        <div className="flex items-center justify-between">
          {ci.entryId && <span className="text-[10px] text-gray-400">仕訳ID: {ci.entryId.slice(0, 8)}...</span>}
          <div className="flex items-center gap-2 ml-auto">
            {saving && <Loader size={12} className="animate-spin text-blue-500" />}
            {savedAt && <span className="text-xs text-green-600">✓ {savedAt} 保存済み</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
