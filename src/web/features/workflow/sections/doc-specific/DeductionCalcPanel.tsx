import { useReview } from '../../context/ReviewContext';

export default function DeductionCalcPanel() {
  const { ci, fmt } = useReview();
  if (!ci) return null;

  return (
    <div className="bg-white border-2 border-emerald-300 rounded-lg p-4">
      <div className="text-xs font-semibold text-emerald-800 mb-3">✅ 控除額（自動計算）</div>
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-600">
          <div>控除種別: <span className="font-medium">所得控除</span></div>
          <div className="mt-0.5 text-[10px] text-gray-400">抽出金額に基づいて自動計算</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-emerald-700">{fmt(ci.amount)}</div>
          <div className="text-[10px] text-emerald-600">所得から控除</div>
        </div>
      </div>
    </div>
  );
}
