// 給与明細サマリーパネル — 支給/控除の入力 + 差引支給額計算 + form連携
import { useState, useMemo } from 'react';
import { useReview } from '../../context/ReviewContext';

interface PayrollField { label: string; key: string }

const PAY_FIELDS: PayrollField[] = [
  { label: '基本給', key: 'basePay' },
  { label: '残業手当', key: 'overtime' },
  { label: '通勤手当', key: 'commute' },
  { label: 'その他手当', key: 'otherPay' },
];

const DEDUCTION_FIELDS: PayrollField[] = [
  { label: '健康保険料', key: 'health' },
  { label: '厚生年金', key: 'pension' },
  { label: '雇用保険料', key: 'employment' },
  { label: '所得税', key: 'incomeTax' },
  { label: '住民税', key: 'residentTax' },
];

export default function PayrollSummaryPanel() {
  const { ci, setForm, fmt } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const ocrPayroll = classification?.payroll_details as Record<string, number> | undefined;

  const [pay, setPay] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    PAY_FIELDS.forEach(f => { init[f.key] = ocrPayroll?.[f.key] ?? 0; });
    return init;
  });
  const [deductions, setDeductions] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    DEDUCTION_FIELDS.forEach(f => { init[f.key] = ocrPayroll?.[f.key] ?? 0; });
    return init;
  });

  const payTotal = useMemo(() => Object.values(pay).reduce((s, v) => s + v, 0), [pay]);
  const deductionTotal = useMemo(() => Object.values(deductions).reduce((s, v) => s + v, 0), [deductions]);
  const netPay = payTotal - deductionTotal;

  useMemo(() => { setForm(prev => ({ ...prev, amount: payTotal })); }, [payTotal]);

  function FieldRow({ fields, values, setValues, borderColor }: {
    fields: PayrollField[]; values: Record<string, number>;
    setValues: (v: Record<string, number>) => void; borderColor: string;
  }) {
    return (
      <>
        {fields.map(f => (
          <div key={f.key} className="flex items-center justify-between text-xs py-0.5">
            <span className="text-gray-600">{f.label}</span>
            <input type="number" value={values[f.key] || ''} placeholder="0"
              onChange={e => setValues({ ...values, [f.key]: Number(e.target.value) || 0 })}
              className={`w-24 border ${borderColor} rounded p-1 text-xs text-right bg-white`} />
          </div>
        ))}
      </>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-red-800 mb-2">給与明細サマリー</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
          <div className="text-xs font-semibold text-blue-800 mb-1">支給</div>
          <FieldRow fields={PAY_FIELDS} values={pay} setValues={setPay} borderColor="border-blue-300" />
          <div className="flex justify-between text-xs font-bold text-blue-900 border-t border-blue-200 pt-1 mt-1">
            <span>支給合計</span><span>{fmt(payTotal)}</span>
          </div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
          <div className="text-xs font-semibold text-orange-800 mb-1">控除</div>
          <FieldRow fields={DEDUCTION_FIELDS} values={deductions} setValues={setDeductions} borderColor="border-orange-300" />
          <div className="flex justify-between text-xs font-bold text-orange-900 border-t border-orange-200 pt-1 mt-1">
            <span>控除合計</span><span>{fmt(deductionTotal)}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 bg-green-100 border border-green-300 rounded-lg p-2 text-center">
        <span className="text-xs text-green-700">差引支給額</span>
        <div className="text-lg font-bold text-green-800">{fmt(netPay)}</div>
      </div>
    </div>
  );
}
