// 源泉徴収パネル — OCR読取の源泉税額から差引支払額を自動計算
import { useReview } from '../../context/ReviewContext';

export default function WithholdingPanel() {
  const { ci, form } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const withholdingAmount = classification?.withholding_tax_amount as number | undefined;
  const totalAmount = form.lineAmount || ci.amount || 0;
  const netPayment = withholdingAmount != null ? totalAmount - withholdingAmount : null;

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
          <input type="number" defaultValue={withholdingAmount ?? ''} placeholder="¥0"
            className="w-full border border-red-300 rounded p-1.5 text-sm bg-white font-medium" />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">差引支払額</label>
          <input type="number" value={netPayment ?? ''} readOnly
            className="w-full border border-green-300 rounded p-1.5 text-sm bg-green-50 font-bold text-green-800" placeholder="自動計算" />
        </div>
      </div>
    </div>
  );
}
