/**
 * @module メタデータフィールドパネル
 */
import { useReview } from '../../context/ReviewContext';

export default function MetadataFieldsPanel() {
  const { ci } = useReview();
  if (!ci) return null;

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-purple-800 mb-2">抽出データ</div>
      <div className="space-y-1.5 text-xs">
        {ci.docClassification?.document_type_code && (
          <div><span className="text-gray-400">書類種別:</span> <span className="font-medium">{ci.docClassification.document_type_code}</span></div>
        )}
        {ci.supplierName && (
          <div><span className="text-gray-400">発行元:</span> <span className="font-medium">{ci.supplierName}</span></div>
        )}
        {ci.documentDate && (
          <div><span className="text-gray-400">日付:</span> <span className="font-medium">{new Date(ci.documentDate).toLocaleDateString('ja-JP')}</span></div>
        )}
      </div>
    </div>
  );
}
