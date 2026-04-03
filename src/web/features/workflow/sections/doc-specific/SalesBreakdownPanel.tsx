import { useReview } from '../../context/ReviewContext';

export default function SalesBreakdownPanel() {
  const { ci, fmt } = useReview();
  if (!ci) return null;

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-teal-800 mb-2">📊 売上サマリー</div>
      <div className="text-xs text-teal-700">
        OCRデータから売上の税率別・決済手段別内訳を抽出します。
      </div>
      {ci.amount != null && (
        <div className="mt-2 text-sm font-bold text-teal-800">売上合計: {fmt(ci.amount)}</div>
      )}
    </div>
  );
}
