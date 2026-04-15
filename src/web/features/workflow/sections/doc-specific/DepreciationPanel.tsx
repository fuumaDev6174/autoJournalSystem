// 減価償却計算パネル — 定額法/定率法の自動計算 + form連携
import { useState, useMemo } from 'react';
import { useReview } from '../../context/ReviewContext';

// 定額法の簡易償却率テーブル（主要な耐用年数のみ）
const STRAIGHT_LINE_RATES: Record<number, number> = {
  2: 0.500, 3: 0.334, 4: 0.250, 5: 0.200, 6: 0.167, 7: 0.143, 8: 0.125,
  10: 0.100, 15: 0.067, 20: 0.050, 30: 0.034, 40: 0.025, 50: 0.020,
};

function getStraightLineRate(years: number): number {
  return STRAIGHT_LINE_RATES[years] ?? (years > 0 ? 1 / years : 0);
}

export default function DepreciationPanel() {
  const { ci, setForm, fmt } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;

  const [assetName, setAssetName] = useState(classification?.asset_name as string ?? '');
  const [acquisitionCost, setAcquisitionCost] = useState<number>(classification?.acquisition_cost as number ?? 0);
  const [usefulLife, setUsefulLife] = useState<number>(classification?.useful_life as number ?? 0);
  const [method, setMethod] = useState<'straight_line' | 'declining_balance'>('straight_line');
  const [bookValueStart, setBookValueStart] = useState<number>(classification?.book_value_start as number ?? acquisitionCost);

  const { depreciation, bookValueEnd } = useMemo(() => {
    if (acquisitionCost <= 0 || usefulLife <= 0) return { depreciation: 0, bookValueEnd: 0 };
    let dep: number;
    if (method === 'straight_line') {
      const rate = getStraightLineRate(usefulLife);
      dep = Math.floor(acquisitionCost * rate);
    } else {
      // 定率法: 簡易計算（200%定率法）
      const rate = Math.min(2 / usefulLife, 1);
      dep = Math.floor(bookValueStart * rate);
    }
    const end = Math.max(bookValueStart - dep, 1); // 備忘価額1円
    return { depreciation: dep, bookValueEnd: end };
  }, [acquisitionCost, usefulLife, method, bookValueStart]);

  useMemo(() => { setForm(prev => ({ ...prev, amount: depreciation })); }, [depreciation]);

  return (
    <div className="bg-stone-50 border border-stone-300 rounded-lg p-3">
      <div className="text-xs font-semibold text-stone-800 mb-3">減価償却</div>

      <div className="space-y-2 text-xs">
        <div>
          <label className="text-gray-500 block mb-0.5">資産名</label>
          <input type="text" value={assetName} placeholder="例: 業務用PC"
            onChange={e => setAssetName(e.target.value)}
            className="w-full border border-stone-300 rounded p-1.5 text-sm bg-white" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-gray-500 block mb-0.5">取得価額（円）</label>
            <input type="number" value={acquisitionCost || ''} placeholder="0"
              onChange={e => { const v = Number(e.target.value) || 0; setAcquisitionCost(v); setBookValueStart(v); }}
              className="w-full border border-stone-300 rounded p-1.5 text-sm bg-white text-right" />
          </div>
          <div>
            <label className="text-gray-500 block mb-0.5">耐用年数</label>
            <input type="number" value={usefulLife || ''} placeholder="年"
              onChange={e => setUsefulLife(Number(e.target.value) || 0)}
              className="w-full border border-stone-300 rounded p-1.5 text-sm bg-white text-right" />
          </div>
          <div>
            <label className="text-gray-500 block mb-0.5">償却方法</label>
            <select value={method} onChange={e => setMethod(e.target.value as typeof method)}
              className="w-full border border-stone-300 rounded p-1.5 text-sm bg-white">
              <option value="straight_line">定額法</option>
              <option value="declining_balance">定率法</option>
            </select>
          </div>
        </div>

        {method === 'declining_balance' && (
          <div>
            <label className="text-gray-500 block mb-0.5">期首帳簿価額（円）</label>
            <input type="number" value={bookValueStart || ''} placeholder="0"
              onChange={e => setBookValueStart(Number(e.target.value) || 0)}
              className="w-full border border-stone-300 rounded p-1.5 text-sm bg-white text-right" />
          </div>
        )}

        <div className="bg-stone-100 rounded p-2 space-y-1">
          <div className="flex justify-between text-gray-600">
            <span>本年分の償却費</span><span className="font-bold">{fmt(depreciation)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>期末帳簿価額</span><span className="font-medium">{fmt(bookValueEnd)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
