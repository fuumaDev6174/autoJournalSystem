// 減価償却計算パネル
import { useReview } from '../../context/ReviewContext';

export default function DepreciationPanel() {
  const { ci } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const acquisitionCost = classification?.acquisition_cost as number | undefined;
  const usefulLife = classification?.useful_life as number | undefined;

  return (
    <div className="bg-stone-50 border border-stone-300 rounded-lg p-3">
      <div className="text-xs font-semibold text-stone-800 mb-2">🏗️ 減価償却</div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <label className="text-gray-500 block mb-0.5">取得価額</label>
          <input type="number" defaultValue={acquisitionCost ?? ''} placeholder="¥0"
            className="w-full border border-stone-300 rounded p-1.5 text-sm bg-white" />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">耐用年数</label>
          <input type="number" defaultValue={usefulLife ?? ''} placeholder="年"
            className="w-full border border-stone-300 rounded p-1.5 text-sm bg-white" />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">償却方法</label>
          <select className="w-full border border-stone-300 rounded p-1.5 text-sm bg-white">
            <option value="straight_line">定額法</option>
            <option value="declining_balance">定率法</option>
          </select>
        </div>
      </div>
    </div>
  );
}
