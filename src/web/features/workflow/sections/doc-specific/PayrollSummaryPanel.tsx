import { useReview } from '../../context/ReviewContext';

export default function PayrollSummaryPanel() {
  const { ci, fmt } = useReview();
  if (!ci) return null;

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-red-800 mb-2">👤 給与情報</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
          <div className="text-xs font-semibold text-blue-800 mb-1">支給</div>
          <div className="text-xs text-gray-600">OCRデータから自動抽出</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
          <div className="text-xs font-semibold text-orange-800 mb-1">控除</div>
          <div className="text-xs text-gray-600">OCRデータから自動抽出</div>
        </div>
      </div>
      {ci.amount != null && (
        <div className="mt-2 bg-green-100 border border-green-300 rounded-lg p-2 text-center">
          <span className="text-xs text-green-700">差引支給額</span>
          <div className="text-lg font-bold text-green-800">{fmt(ci.amount)}</div>
        </div>
      )}
    </div>
  );
}
