// 繰越控除パネル（前年確定申告書から繰越損失を表示）
import { useReview } from '../../context/ReviewContext';

export default function CarryoverPanel() {
  const { ci } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const carryoverLoss = classification?.carryover_loss as number | undefined;
  const fiscalYear = classification?.fiscal_year as string | undefined;

  return (
    <div className="bg-slate-50 border border-slate-300 rounded-lg p-3">
      <div className="text-xs font-semibold text-slate-800 mb-2">📋 繰越控除</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-gray-500 block mb-0.5">対象年度</label>
          <input type="text" defaultValue={fiscalYear ?? ''} placeholder="例: 令和6年"
            className="w-full border border-slate-300 rounded p-1.5 text-sm bg-white" />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">繰越損失額</label>
          <input type="number" defaultValue={carryoverLoss ?? ''} placeholder="¥0"
            className="w-full border border-slate-300 rounded p-1.5 text-sm bg-white" />
        </div>
      </div>
    </div>
  );
}
