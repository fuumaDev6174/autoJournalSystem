/**
 * @module OCR サマリーバッジ
 */
import { useReview } from '../context/ReviewContext';

export default function OcrSummaryBadges() {
  const { ci } = useReview();
  if (!ci) return null;
  return (
    <div className="p-3 border-b border-gray-100 flex items-center gap-2 flex-wrap flex-shrink-0">
      <span className="font-bold text-sm">仕訳データ</span>
      {ci.supplierName && <span className="text-xs px-2.5 py-0.5 rounded bg-blue-50 text-blue-600">OCR: {ci.supplierName}</span>}
      {ci.docClassification?.document_type_code && (
        <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700">{ci.docClassification.document_type_code}</span>
      )}
      {ci.aiConfidence != null && (
        <span className={`text-xs px-2.5 py-0.5 rounded font-semibold ml-auto ${ci.aiConfidence >= 0.8 ? 'bg-green-50 text-green-700' : ci.aiConfidence >= 0.5 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
          AI信頼度 {Math.round(ci.aiConfidence * 100)}%
        </span>
      )}
    </div>
  );
}
