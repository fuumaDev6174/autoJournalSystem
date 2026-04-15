// 医療費控除計算パネル — 支払額-補填額-10万円の自動計算
import { useState, useMemo } from 'react';
import { useReview } from '../../context/ReviewContext';

export default function MedicalCalcPanel() {
  const { ci, setForm, fmt } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;

  const [totalMedical, setTotalMedical] = useState<number>(classification?.total_medical_expense as number ?? ci.amount ?? 0);
  const [insuranceReimbursed, setInsuranceReimbursed] = useState<number>(classification?.insurance_reimbursed as number ?? 0);
  const [useSelfMedication, setUseSelfMedication] = useState(false);
  const [selfMedicationAmount, setSelfMedicationAmount] = useState(0);

  const deduction = useMemo(() => {
    if (useSelfMedication) {
      return Math.min(Math.max(selfMedicationAmount - 12_000, 0), 88_000);
    }
    const net = totalMedical - insuranceReimbursed;
    return Math.min(Math.max(net - 100_000, 0), 2_000_000);
  }, [totalMedical, insuranceReimbursed, useSelfMedication, selfMedicationAmount]);

  useMemo(() => { setForm(prev => ({ ...prev, amount: deduction })); }, [deduction]);

  return (
    <div className="bg-pink-50 border border-pink-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-pink-800 mb-3">医療費控除</div>

      <div className="flex items-center gap-3 mb-3">
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="radio" checked={!useSelfMedication} onChange={() => setUseSelfMedication(false)} className="text-pink-600" />
          通常の医療費控除
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="radio" checked={useSelfMedication} onChange={() => setUseSelfMedication(true)} className="text-pink-600" />
          セルフメディケーション税制
        </label>
      </div>

      {!useSelfMedication ? (
        <div className="space-y-2 text-xs">
          <div>
            <label className="text-gray-500 block mb-0.5">医療費支払額合計（円）</label>
            <input type="number" value={totalMedical || ''} placeholder="0"
              onChange={e => setTotalMedical(Number(e.target.value) || 0)}
              className="w-full border border-pink-300 rounded p-1.5 text-sm bg-white text-right" />
          </div>
          <div>
            <label className="text-gray-500 block mb-0.5">保険等で補填された金額（円）</label>
            <input type="number" value={insuranceReimbursed || ''} placeholder="0"
              onChange={e => setInsuranceReimbursed(Number(e.target.value) || 0)}
              className="w-full border border-pink-300 rounded p-1.5 text-sm bg-white text-right" />
          </div>
          <div className="bg-pink-100 rounded p-2 text-[10px] text-gray-600">
            ({fmt(totalMedical)} - {fmt(insuranceReimbursed)}) - ¥100,000 = {fmt(deduction)}
            <span className="ml-1 text-gray-400">（上限200万円）</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <div>
            <label className="text-gray-500 block mb-0.5">対象医薬品購入額（円）</label>
            <input type="number" value={selfMedicationAmount || ''} placeholder="0"
              onChange={e => setSelfMedicationAmount(Number(e.target.value) || 0)}
              className="w-full border border-pink-300 rounded p-1.5 text-sm bg-white text-right" />
          </div>
          <div className="bg-pink-100 rounded p-2 text-[10px] text-gray-600">
            {fmt(selfMedicationAmount)} - ¥12,000 = {fmt(deduction)}
            <span className="ml-1 text-gray-400">（上限88,000円）</span>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-between items-center border-t border-pink-200 pt-2">
        <span className="text-xs font-semibold text-pink-800">控除額</span>
        <span className="text-lg font-bold text-pink-900">{fmt(deduction)}</span>
      </div>
    </div>
  );
}
