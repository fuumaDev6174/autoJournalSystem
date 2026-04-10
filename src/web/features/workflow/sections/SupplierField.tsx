/**
 * @module 取引先フィールド
 */
import ComboBox from '@/web/shared/components/ui/ComboBox';
import { useReview } from '../context/ReviewContext';

export default function SupplierField() {
  const { form, setForm, suppliers, supplierText, setSupplierText, handleSupplierChange, onCreateSupplier, setAddRule, setRuleSuggestion } = useReview();
  return (
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
          <p className="text-[10px] text-orange-700 mb-1.5">「{supplierText}」は取引先マスタに未登録です。</p>
          <button type="button" onClick={() => onCreateSupplier(supplierText)}
            className="w-full text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded py-1.5 transition-colors">
            「{supplierText}」をマスタに追加して選択
          </button>
        </div>
      )}
    </div>
  );
}
