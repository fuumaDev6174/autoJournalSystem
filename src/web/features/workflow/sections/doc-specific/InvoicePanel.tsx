/**
 * @module インボイスパネル
 */
import { useReview } from '../../context/ReviewContext';

export default function InvoicePanel() {
  const { ci } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const qual = classification?.invoice_qualification as string | undefined;

  return (
    <>
      {/* Invoice qualification */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-green-800">✅ インボイス情報</div>
          {qual && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${qual === 'qualified' ? 'bg-green-200 text-green-800' : 'bg-orange-200 text-orange-800'}`}>
              {qual === 'qualified' ? '適格請求書' : '区分記載'}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-gray-400 block mb-0.5">登録番号</label>
            <input type="text" placeholder="T0000000000000" readOnly
              className="w-full border border-green-300 rounded p-1.5 text-sm bg-white font-mono" />
          </div>
          <div>
            <label className="text-gray-400 block mb-0.5">適格区分</label>
            <select className="w-full border border-green-300 rounded p-1.5 text-sm bg-white">
              <option>適格請求書（100%控除）</option>
              <option>区分記載（80%控除）</option>
              <option>なし（控除不可）</option>
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
