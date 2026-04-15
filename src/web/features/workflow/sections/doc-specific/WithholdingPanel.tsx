// 源泉徴収パネル — OCR読取 + 計算式表示 + form連携
import { useState } from 'react';
import { useReview } from '../../context/ReviewContext';

function calcWithholding(amount: number): number {
  if (amount <= 1_000_000) return Math.floor(amount * 0.1021);
  return Math.floor((amount - 1_000_000) * 0.2042 + 102_100);
}

export default function WithholdingPanel() {
  const { ci, form, setForm } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const ocrWithholding = classification?.withholding_tax_amount as number | undefined;
  const formAny = form as Record<string, unknown>;

  const [enabled, setEnabled] = useState(ocrWithholding != null && ocrWithholding > 0);
  const withholdingAmount = (formAny.withholdingTaxAmount as number) ?? ocrWithholding ?? 0;
  const totalAmount = form.lineAmount || ci.amount || 0;
  const calculated = calcWithholding(totalAmount);
  const netPayment = enabled ? totalAmount - withholdingAmount : totalAmount;
  const hasDiff = enabled && ocrWithholding != null && ocrWithholding > 0 && Math.abs(calculated - ocrWithholding) > 1;

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold text-red-800">源泉徴収</div>
          {ocrWithholding != null && <span className="text-xs px-2 py-0.5 bg-red-200 text-red-800 rounded-full font-medium">OCR検出</span>}
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <span className="text-[10px] text-gray-500">源泉あり</span>
          <input type="checkbox" checked={enabled} onChange={e => {
            setEnabled(e.target.checked);
            if (!e.target.checked) setForm(prev => ({ ...prev, withholdingTaxAmount: 0 }));
          }} className="rounded border-gray-300 text-red-600 focus:ring-red-500" />
        </label>
      </div>

      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
            <div>
              <label className="text-gray-500 block mb-0.5">源泉徴収税額</label>
              <input type="number" value={withholdingAmount || ''} placeholder="0"
                onChange={e => setForm(prev => ({ ...prev, withholdingTaxAmount: Number(e.target.value) || 0 }))}
                className="w-full border border-red-300 rounded p-1.5 text-sm bg-white font-medium" />
            </div>
            <div>
              <label className="text-gray-500 block mb-0.5">差引支払額</label>
              <div className="w-full border border-green-300 rounded p-1.5 text-sm bg-green-50 font-bold text-green-800">
                ¥{netPayment.toLocaleString()}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-gray-500 bg-gray-50 rounded p-1.5">
            計算式: {totalAmount <= 1_000_000
              ? `¥${totalAmount.toLocaleString()} × 10.21% = ¥${calculated.toLocaleString()}`
              : `(¥${totalAmount.toLocaleString()} - ¥1,000,000) × 20.42% + ¥102,100 = ¥${calculated.toLocaleString()}`}
          </div>
          {hasDiff && (
            <div className="mt-1.5 text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded p-1.5">
              OCR読取値(¥{ocrWithholding?.toLocaleString()})と計算値(¥{calculated.toLocaleString()})に差異があります
            </div>
          )}
        </>
      )}
    </div>
  );
}
