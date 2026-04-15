// 住宅ローン控除計算パネル — 年末残高×控除率の自動計算
import { useState, useMemo } from 'react';
import { useReview } from '../../context/ReviewContext';

const HOUSING_TYPES = [
  { key: 'general', label: '一般住宅', limit2022: 30_000_000 },
  { key: 'certified', label: '認定長期優良住宅', limit2022: 50_000_000 },
  { key: 'low_carbon', label: '認定低炭素住宅', limit2022: 50_000_000 },
  { key: 'zeh', label: 'ZEH水準省エネ住宅', limit2022: 45_000_000 },
  { key: 'energy_saving', label: '省エネ基準適合住宅', limit2022: 40_000_000 },
] as const;

const RATE = 0.007; // 2022年以降: 0.7%

export default function HousingLoanCalcPanel() {
  const { ci, setForm } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;

  const [loanBalance, setLoanBalance] = useState<number>(classification?.loan_balance as number ?? 0);
  const [housingType, setHousingType] = useState('general');

  const selected = HOUSING_TYPES.find(t => t.key === housingType) ?? HOUSING_TYPES[0];

  const deduction = useMemo(() => {
    const base = Math.min(loanBalance, selected.limit2022);
    return Math.floor(base * RATE);
  }, [loanBalance, selected]);

  useMemo(() => {
    setForm(prev => ({ ...prev, amount: deduction }));
  }, [deduction]);

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-teal-800 mb-3">住宅ローン控除</div>

      <div className="space-y-2 text-xs">
        <div>
          <label className="text-gray-500 block mb-0.5">住宅区分</label>
          <select value={housingType} onChange={e => setHousingType(e.target.value)}
            className="w-full border border-teal-300 rounded p-1.5 text-sm bg-white">
            {HOUSING_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-gray-500 block mb-0.5">年末ローン残高（円）</label>
          <input type="number" value={loanBalance || ''} placeholder="0"
            onChange={e => setLoanBalance(Number(e.target.value) || 0)}
            className="w-full border border-teal-300 rounded p-1.5 text-sm bg-white text-right" />
        </div>

        <div className="bg-teal-100 rounded p-2 space-y-1">
          <div className="flex justify-between text-gray-600">
            <span>借入限度額</span>
            <span>¥{selected.limit2022.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>控除率</span>
            <span>0.7%</span>
          </div>
          <div className="flex justify-between border-t border-teal-300 pt-1">
            <span className="font-semibold text-teal-800">控除額</span>
            <span className="font-bold text-teal-900">¥{deduction.toLocaleString()}</span>
          </div>
          <div className="text-[10px] text-gray-500">
            = min(¥{loanBalance.toLocaleString()}, ¥{selected.limit2022.toLocaleString()}) × 0.7%
          </div>
        </div>

        <div className="text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded p-1.5">
          住宅ローン控除は「税額控除」です（所得控除ではありません）。確定申告書の税額控除欄に記載されます。
        </div>
      </div>
    </div>
  );
}
