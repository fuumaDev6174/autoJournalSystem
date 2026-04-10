// 棚卸計算パネル
import { useReview } from '../../context/ReviewContext';

export default function InventoryCalcPanel() {
  const { ci } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const inventoryTotal = classification?.inventory_total as number | undefined;

  return (
    <div className="bg-lime-50 border border-lime-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-lime-800 mb-2">📦 期末棚卸</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-gray-500 block mb-0.5">棚卸資産合計</label>
          <input type="number" defaultValue={inventoryTotal ?? ''} placeholder="¥0"
            className="w-full border border-lime-300 rounded p-1.5 text-sm bg-white" />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">評価方法</label>
          <select className="w-full border border-lime-300 rounded p-1.5 text-sm bg-white">
            <option value="cost">原価法</option>
            <option value="lower_of_cost">低価法</option>
          </select>
        </div>
      </div>
    </div>
  );
}
