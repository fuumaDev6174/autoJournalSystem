// 医療費控除計算パネル
import { useReview } from '../../context/ReviewContext';

export default function MedicalCalcPanel() {
  const { ci } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const totalMedical = classification?.total_medical_expense as number | undefined;

  return (
    <div className="bg-pink-50 border border-pink-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-pink-800 mb-2">🏥 医療費控除</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-gray-500 block mb-0.5">医療費合計</label>
          <input type="number" defaultValue={totalMedical ?? ''} placeholder="¥0"
            className="w-full border border-pink-300 rounded p-1.5 text-sm bg-white" />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">控除額（10万円超過分）</label>
          <input type="number" placeholder="自動計算" readOnly
            className="w-full border border-pink-300 rounded p-1.5 text-sm bg-pink-50 font-medium" />
        </div>
      </div>
    </div>
  );
}
