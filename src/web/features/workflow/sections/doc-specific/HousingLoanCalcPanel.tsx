// 住宅ローン控除計算パネル
import { useReview } from '../../context/ReviewContext';

export default function HousingLoanCalcPanel() {
  const { ci } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const loanBalance = classification?.loan_balance as number | undefined;
  const deductionAmount = classification?.deduction_amount as number | undefined;

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-teal-800 mb-2">🏠 住宅ローン控除</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-gray-500 block mb-0.5">年末残高</label>
          <input type="number" defaultValue={loanBalance ?? ''} placeholder="¥0"
            className="w-full border border-teal-300 rounded p-1.5 text-sm bg-white" />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">控除額</label>
          <input type="number" defaultValue={deductionAmount ?? ''} placeholder="自動計算"
            className="w-full border border-teal-300 rounded p-1.5 text-sm bg-teal-50 font-medium" readOnly />
        </div>
      </div>
    </div>
  );
}
