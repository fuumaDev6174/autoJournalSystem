/**
 * @module 照合パネル
 */
import { useReview } from '../../context/ReviewContext';

export default function ReconciliationPanel() {
  const { ci, fmt } = useReview();
  if (!ci) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-amber-800 mb-2">🔍 売上突合チェック</div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span>書類の金額</span><span className="font-bold">{fmt(ci.amount ?? undefined)}</span></div>
        <div className="flex justify-between"><span>計上済み売上合計</span><span className="font-bold">-</span></div>
        <div className="flex justify-between text-amber-600 border-t border-amber-200 pt-1"><span className="font-medium">差額</span><span className="font-bold">-</span></div>
      </div>
      <div className="mt-2 text-[10px] text-amber-700 bg-amber-100 rounded p-1.5">
        突合結果は計上済み売上データとの照合後に表示されます。
      </div>
    </div>
  );
}
