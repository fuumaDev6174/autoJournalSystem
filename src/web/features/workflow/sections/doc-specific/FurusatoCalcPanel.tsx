// ふるさと納税控除計算パネル — 寄附金-2000円の自動計算
import { useState, useMemo } from 'react';
import { useReview } from '../../context/ReviewContext';

export default function FurusatoCalcPanel() {
  const { ci, setForm, fmt } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;

  const [donationAmount, setDonationAmount] = useState<number>(classification?.donation_amount as number ?? ci.amount ?? 0);
  const [municipalityName, setMunicipalityName] = useState(classification?.municipality_name as string ?? classification?.extracted_supplier as string ?? '');
  const [isOnestop, setIsOnestop] = useState(classification?.is_onestop as boolean ?? false);

  const deduction = useMemo(() => Math.max(donationAmount - 2_000, 0), [donationAmount]);

  useMemo(() => { setForm(prev => ({ ...prev, amount: donationAmount })); }, [donationAmount]);

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-amber-800 mb-3">ふるさと納税</div>

      <div className="space-y-2 text-xs">
        <div>
          <label className="text-gray-500 block mb-0.5">寄附先自治体</label>
          <input type="text" value={municipalityName} placeholder="市区町村名"
            onChange={e => setMunicipalityName(e.target.value)}
            className="w-full border border-amber-300 rounded p-1.5 text-sm bg-white" />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">寄附金額（円）</label>
          <input type="number" value={donationAmount || ''} placeholder="0"
            onChange={e => setDonationAmount(Number(e.target.value) || 0)}
            className="w-full border border-amber-300 rounded p-1.5 text-sm bg-white text-right" />
        </div>

        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={isOnestop} onChange={e => setIsOnestop(e.target.checked)}
            className="rounded border-gray-300 text-amber-600" />
          <span className="text-xs text-gray-600">ワンストップ特例制度を利用</span>
        </label>

        <div className="bg-amber-100 rounded p-2 space-y-1">
          <div className="flex justify-between text-gray-600">
            <span>寄附金合計</span><span>{fmt(donationAmount)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>自己負担額</span><span>¥2,000</span>
          </div>
          <div className="flex justify-between border-t border-amber-300 pt-1">
            <span className="font-semibold text-amber-800">控除対象額</span>
            <span className="font-bold text-amber-900">{fmt(deduction)}</span>
          </div>
        </div>

        {isOnestop && (
          <div className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded p-1.5">
            ワンストップ特例利用のため、確定申告での寄附金控除申告は不要です（5自治体以内の場合）
          </div>
        )}
      </div>
    </div>
  );
}
