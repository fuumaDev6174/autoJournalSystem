/**
 * @module レシート品目リスト
 */
import { useReview } from '../../context/ReviewContext';

export default function ReceiptItemList() {
  const { ci } = useReview();
  if (!ci) return null;

  // OCR items would come from docClassification or extended OCR result
  // For now, show placeholder that activates when OCR data includes items
  return (
    <>
      {/* Reduced tax rate alert */}
      <div className="bg-orange-50 border border-orange-300 rounded-lg p-2.5 flex items-start gap-2">
        <span className="text-orange-500 text-sm mt-0.5">⚠️</span>
        <div className="text-xs text-orange-800">
          <div className="font-semibold mb-0.5">軽減税率(8%)品目を検出</div>
          <div>軽減税率8%対象の品目が含まれている可能性があります。税率混在の場合は分割仕訳を検討してください。</div>
          <button type="button" className="mt-1.5 px-3 py-1 bg-orange-200 hover:bg-orange-300 rounded text-orange-800 font-medium text-[10px] transition-colors">
            税率別に自動分割
          </button>
        </div>
      </div>
    </>
  );
}
