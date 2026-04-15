// 売上内訳パネル — 決済手段別・税率別の入力 + form連携
import { useState, useMemo } from 'react';
import { useReview } from '../../context/ReviewContext';

export default function SalesBreakdownPanel() {
  const { ci, setForm, fmt } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const ocrSales = classification?.sales_details as Record<string, number> | undefined;

  const [cashSales, setCashSales] = useState(ocrSales?.cash ?? 0);
  const [cardSales, setCardSales] = useState(ocrSales?.card ?? 0);
  const [eMoneySales, setEMoneySales] = useState(ocrSales?.e_money ?? 0);
  const [rate10, setRate10] = useState(ocrSales?.rate_10 ?? 0);
  const [rate8, setRate8] = useState(ocrSales?.rate_8 ?? 0);

  const salesTotal = useMemo(() => cashSales + cardSales + eMoneySales, [cashSales, cardSales, eMoneySales]);

  useMemo(() => { setForm(prev => ({ ...prev, amount: salesTotal })); }, [salesTotal]);

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-teal-800 mb-3">売上内訳</div>

      <div className="space-y-2 text-xs">
        {([
          { label: '現金売上', value: cashSales, set: setCashSales },
          { label: 'カード売上', value: cardSales, set: setCardSales },
          { label: '電子マネー売上', value: eMoneySales, set: setEMoneySales },
        ] as const).map(f => (
          <div key={f.label} className="flex items-center justify-between">
            <span className="text-gray-600">{f.label}</span>
            <input type="number" value={f.value || ''} placeholder="0"
              onChange={e => f.set(Number(e.target.value) || 0)}
              className="w-28 border border-teal-300 rounded p-1 text-xs text-right bg-white" />
          </div>
        ))}
        <div className="flex justify-between font-bold text-teal-900 border-t border-teal-300 pt-1">
          <span>売上合計</span><span>{fmt(salesTotal)}</span>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-teal-200">
        <div className="text-[10px] font-semibold text-gray-600 mb-1">消費税区分別</div>
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">10%対象</span>
            <input type="number" value={rate10 || ''} placeholder="0"
              onChange={e => setRate10(Number(e.target.value) || 0)}
              className="w-28 border border-teal-300 rounded p-1 text-xs text-right bg-white" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">8%対象（軽減）</span>
            <input type="number" value={rate8 || ''} placeholder="0"
              onChange={e => setRate8(Number(e.target.value) || 0)}
              className="w-28 border border-teal-300 rounded p-1 text-xs text-right bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
