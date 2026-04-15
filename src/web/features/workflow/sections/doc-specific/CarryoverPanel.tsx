// 繰越損失パネル — 前年確定申告書から繰越損失を表示・編集
import { useState } from 'react';
import { useReview } from '../../context/ReviewContext';

export default function CarryoverPanel() {
  const { ci, fmt } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;

  const [fiscalYear, setFiscalYear] = useState(classification?.fiscal_year as string ?? '');
  const [businessLoss, setBusinessLoss] = useState<number>(classification?.business_loss as number ?? 0);
  const [realEstateLoss, setRealEstateLoss] = useState<number>(classification?.realestate_loss as number ?? 0);
  const [otherLoss, setOtherLoss] = useState<number>(classification?.other_loss as number ?? 0);
  const [remainingYears, setRemainingYears] = useState<number>(classification?.remaining_years as number ?? 3);

  const totalLoss = businessLoss + realEstateLoss + otherLoss;

  return (
    <div className="bg-slate-50 border border-slate-300 rounded-lg p-3">
      <div className="text-xs font-semibold text-slate-800 mb-3">繰越損失</div>

      <div className="space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-gray-500 block mb-0.5">対象年度</label>
            <input type="text" value={fiscalYear} placeholder="例: 令和6年"
              onChange={e => setFiscalYear(e.target.value)}
              className="w-full border border-slate-300 rounded p-1.5 text-sm bg-white" />
          </div>
          <div>
            <label className="text-gray-500 block mb-0.5">残り繰越年数</label>
            <select value={remainingYears} onChange={e => setRemainingYears(Number(e.target.value))}
              className="w-full border border-slate-300 rounded p-1.5 text-sm bg-white">
              <option value={3}>3年（初年度）</option>
              <option value={2}>2年</option>
              <option value={1}>1年（最終年度）</option>
            </select>
          </div>
        </div>

        <div className="text-[10px] font-semibold text-gray-600 mt-2 mb-1">所得区分別損失額</div>
        {([
          { label: '事業所得の損失', value: businessLoss, set: setBusinessLoss },
          { label: '不動産所得の損失', value: realEstateLoss, set: setRealEstateLoss },
          { label: 'その他の損失', value: otherLoss, set: setOtherLoss },
        ] as const).map(f => (
          <div key={f.label} className="flex items-center justify-between">
            <span className="text-gray-600">{f.label}</span>
            <input type="number" value={f.value || ''} placeholder="0"
              onChange={e => f.set(Number(e.target.value) || 0)}
              className="w-28 border border-slate-300 rounded p-1 text-xs text-right bg-white" />
          </div>
        ))}

        <div className="bg-slate-100 rounded p-2 flex justify-between items-center border-t border-slate-300 mt-1">
          <span className="font-semibold text-slate-800">繰越損失合計</span>
          <span className="font-bold text-slate-900">{fmt(totalLoss)}</span>
        </div>

        {remainingYears === 1 && (
          <div className="text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded p-1.5">
            今年度が繰越最終年度です。本年の所得から控除しないと失効します。
          </div>
        )}
      </div>
    </div>
  );
}
