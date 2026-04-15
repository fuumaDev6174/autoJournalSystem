// インボイス情報パネル — OCR読取データを自動入力 + form連携
import { useReview } from '../../context/ReviewContext';

const INVOICE_NUMBER_PATTERN = /^T\d{13}$/;

export default function InvoicePanel() {
  const { ci, form, setForm } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const formAny = form as Record<string, unknown>;

  const invoiceNumber = (formAny.invoiceNumber as string)
    ?? (classification?.extracted_invoice_number as string) ?? '';
  const qual = (formAny.invoiceQualification as string)
    ?? (classification?.invoice_qualification as string) ?? '';

  const isValid = !invoiceNumber || INVOICE_NUMBER_PATTERN.test(invoiceNumber);

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-green-800">インボイス情報</div>
        {qual && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${qual === 'qualified' ? 'bg-green-200 text-green-800' : 'bg-orange-200 text-orange-800'}`}>
            {qual === 'qualified' ? '適格請求書' : qual === 'kubun_kisai' ? '区分記載' : ''}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-gray-400 block mb-0.5">登録番号</label>
          <input type="text" value={invoiceNumber} placeholder="T0000000000000"
            onChange={e => setForm(prev => ({ ...prev, invoiceNumber: e.target.value }))}
            className={`w-full border rounded p-1.5 text-sm bg-white font-mono ${isValid ? 'border-green-300' : 'border-red-400 bg-red-50'}`} />
          {!isValid && <p className="text-[10px] text-red-500 mt-0.5">T + 数字13桁の形式で入力</p>}
        </div>
        <div>
          <label className="text-gray-400 block mb-0.5">適格区分</label>
          <select value={qual}
            onChange={e => setForm(prev => ({ ...prev, invoiceQualification: e.target.value }))}
            className="w-full border border-green-300 rounded p-1.5 text-sm bg-white">
            <option value="">--</option>
            <option value="qualified">適格請求書（100%控除）</option>
            <option value="kubun_kisai">区分記載（80%控除）</option>
            <option value="none">なし（控除不可）</option>
          </select>
        </div>
      </div>
    </div>
  );
}
