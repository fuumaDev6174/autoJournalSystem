import { useReview } from '../../context/ReviewContext';

export default function WithholdingPanel() {
  const { ci } = useReview();
  if (!ci) return null;
  const withholdingAmount = ci.docClassification?.withholding_tax_amount;

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-xs font-semibold text-red-800">💸 源泉徴収</div>
        {withholdingAmount != null && (
          <span className="text-xs px-2 py-0.5 bg-red-200 text-red-800 rounded-full font-medium">OCR検出済</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-gray-500 block mb-0.5">源泉徴収税額</label>
          <input type="number" defaultValue={withholdingAmount || ''}
            className="w-full border border-red-300 rounded p-1.5 text-sm bg-white font-medium" placeholder="¥0" />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">差引支払額</label>
          <input type="number" readOnly
            className="w-full border border-green-300 rounded p-1.5 text-sm bg-green-50 font-bold text-green-800" placeholder="自動計算" />
        </div>
      </div>
    </div>
  );
}
