// 生命保険料控除計算パネル
import { useReview } from '../../context/ReviewContext';

export default function LifeInsCalcPanel() {
  const { ci } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const premiumAmount = classification?.premium_amount as number | undefined;
  const insuranceType = classification?.insurance_type as string | undefined;

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-indigo-800 mb-2">🛡️ 生命保険料控除</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-gray-500 block mb-0.5">保険種類</label>
          <select defaultValue={insuranceType ?? ''} className="w-full border border-indigo-300 rounded p-1.5 text-sm bg-white">
            <option value="">--</option>
            <option value="general_life">一般生命保険</option>
            <option value="medical">介護医療保険</option>
            <option value="pension">個人年金保険</option>
          </select>
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">年間保険料</label>
          <input type="number" defaultValue={premiumAmount ?? ''} placeholder="¥0"
            className="w-full border border-indigo-300 rounded p-1.5 text-sm bg-white" />
        </div>
      </div>
    </div>
  );
}
