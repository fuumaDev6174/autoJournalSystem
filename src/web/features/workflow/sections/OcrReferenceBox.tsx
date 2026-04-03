import { Ban } from 'lucide-react';
import { useReview } from '../context/ReviewContext';

export default function OcrReferenceBox() {
  const { ci, form, fmt } = useReview();
  if (!ci) return null;
  return (
    <>
      {(ci.supplierName || ci.amount || ci.documentDate) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-medium text-gray-500 mb-1.5">OCR読取結果（参考）</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {ci.supplierName && <div><span className="text-gray-400">取引先:</span> <span className="font-medium">{ci.supplierName}</span></div>}
            {ci.amount != null && <div><span className="text-gray-400">金額:</span> <span className="font-medium">{fmt(ci.amount)}</span></div>}
            {ci.documentDate && <div><span className="text-gray-400">日付:</span> <span className="font-medium">{new Date(ci.documentDate).toLocaleDateString('ja-JP')}</span></div>}
            {ci.taxAmount != null && <div><span className="text-gray-400">税額:</span> <span className="font-medium">{fmt(ci.taxAmount)}</span></div>}
          </div>
        </div>
      )}
      {form.isExcluded && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2"><Ban size={16} />対象外に設定されています</div>
      )}
    </>
  );
}
