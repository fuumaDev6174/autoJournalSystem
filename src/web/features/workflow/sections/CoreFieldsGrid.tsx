import { StickyNote } from 'lucide-react';
import ComboBox from '@/web/shared/components/ui/ComboBox';
import { useReview } from '../context/ReviewContext';

export default function CoreFieldsGrid() {
  const { ci, form, setForm, accountItems, taxCategories, taxRates, itemsMaster, itemText, setItemText, handleAccountItemChange, handleItemChange, onCreateItem } = useReview();
  if (!ci) return null;
  return (
    <>
      {/* Date / Amount */}
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

      {/* Account / Tax category */}
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
              } else { newRate = null; }
              setForm(p => ({ ...p, taxCategoryId: tcId, taxRate: newRate }));
            }}
            options={taxCategories.map(t => ({ id: t.id, name: t.display_name || t.name, code: undefined, short_name: t.code, name_kana: null }))}
            placeholder="税区分を検索" />
        </div>
      </div>

      {/* Tax rate */}
      <div className="w-1/2 pr-1.5">
        <div className="bg-yellow-50 border-[1.5px] border-yellow-200 rounded-lg p-3">
          <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" />税率</label>
          <select value={form.taxRate?.toString() || ''} onChange={e => setForm(p => ({ ...p, taxRate: e.target.value ? Number(e.target.value) : null }))}
            className="border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ minWidth: 130 }}>
            <option value="">--</option>
            {taxRates.map(r => {
              const pct = Math.round(r.rate * 100);
              const label = r.is_current ? (r.name.includes('軽減') ? `${pct}%（軽）` : `${pct}%`) : `${pct}%（旧）`;
              return <option key={r.id} value={r.rate}>{label}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Item */}
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
            <p className="text-[10px] text-orange-700 mb-1.5">「{itemText}」は品目マスタに未登録です。</p>
            <button type="button" onClick={() => onCreateItem(itemText)}
              className="w-full text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded py-1.5 transition-colors">
              「{itemText}」をマスタに追加して選択
            </button>
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-semibold mb-1.5 block">摘要</label>
        <input type="text" value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="摘要を入力" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-semibold mb-1.5 block flex items-center gap-1">
          <StickyNote size={12} className="text-amber-500" />メモ
        </label>
        <textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder="内部メモ（任意）" rows={2}
          className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
      </div>
    </>
  );
}
