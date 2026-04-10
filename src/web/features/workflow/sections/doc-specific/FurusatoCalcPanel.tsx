// ふるさと納税控除計算パネル
import { useReview } from '../../context/ReviewContext';

export default function FurusatoCalcPanel() {
  const { ci } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const donationAmount = classification?.donation_amount as number | undefined;
  const municipalityName = classification?.municipality_name as string | undefined;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-amber-800 mb-2">🎁 ふるさと納税</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-gray-500 block mb-0.5">自治体名</label>
          <input type="text" defaultValue={municipalityName ?? ''} placeholder="市区町村名"
            className="w-full border border-amber-300 rounded p-1.5 text-sm bg-white" />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">寄附金額</label>
          <input type="number" defaultValue={donationAmount ?? ''} placeholder="¥0"
            className="w-full border border-amber-300 rounded p-1.5 text-sm bg-white" />
        </div>
      </div>
    </div>
  );
}
