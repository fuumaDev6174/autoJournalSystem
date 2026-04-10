/**
 * @module 収入計算パネル
 */
import { useReview } from '../../context/ReviewContext';

export default function IncomeCalcPanel() {
  const { ci, fmt } = useReview();
  if (!ci) return null;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-gray-700 mb-2">📊 所得の自動計算</div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span>収入金額</span><span className="font-medium">{fmt(ci.amount ?? undefined)}</span></div>
        <div className="flex justify-between text-gray-500"><span>控除額</span><span>自動計算</span></div>
        <div className="flex justify-between border-t pt-1 font-bold"><span>所得金額</span><span className="text-blue-700">自動計算</span></div>
      </div>
    </div>
  );
}
