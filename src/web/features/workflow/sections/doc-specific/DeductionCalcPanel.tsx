// 汎用控除計算パネル — 書類種別ごとの控除額を自動計算
import { useMemo } from 'react';
import { useReview } from '../../context/ReviewContext';

interface DeductionRule {
  label: string;
  type: string;
  cap: number | null;
  note: string;
}

const DEDUCTION_RULES: Record<string, DeductionRule> = {
  kokuho:         { label: '国民健康保険料', type: '社会保険料控除', cap: null, note: '支払額の全額が控除されます' },
  nenkin:         { label: '国民年金保険料', type: '社会保険料控除', cap: null, note: '支払額の全額が控除されます' },
  shokibo:        { label: '小規模企業共済', type: '小規模企業共済等掛金控除', cap: 840_000, note: '上限: 年間84万円' },
  ideco:          { label: 'iDeCo', type: '小規模企業共済等掛金控除', cap: 816_000, note: '上限: 自営業者 年間81.6万円（加入者区分で異なる）' },
  earthquake_ins: { label: '地震保険料', type: '地震保険料控除', cap: 50_000, note: '上限: 年間5万円' },
  deduction_cert: { label: 'その他控除証明書', type: '（種別による）', cap: null, note: '証明書の内容に応じて控除種別が異なります' },
  other_deduction:{ label: 'その他控除', type: '（種別による）', cap: null, note: '手動で控除額を入力してください' },
};

export default function DeductionCalcPanel() {
  const { ci, form, setForm, fmt } = useReview();
  if (!ci) return null;

  const docTypeCode = ci.docClassification?.document_type_code ?? '';
  const rule = DEDUCTION_RULES[docTypeCode];
  const formAny = form as Record<string, unknown>;
  const annualAmount = (formAny.amount as number) ?? ci.amount ?? 0;

  const deductionAmount = useMemo(() => {
    if (!rule) return annualAmount;
    if (rule.cap) return Math.min(annualAmount, rule.cap);
    return annualAmount;
  }, [annualAmount, rule]);

  return (
    <div className="bg-white border-2 border-emerald-300 rounded-lg p-4">
      <div className="text-xs font-semibold text-emerald-800 mb-3">
        {rule?.label ?? '所得控除'}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">年間支払額（円）</label>
          <input type="number" value={annualAmount || ''} placeholder="0"
            onChange={e => setForm(prev => ({ ...prev, amount: Number(e.target.value) || 0 }))}
            className="w-full border border-emerald-300 rounded p-2 text-sm text-right bg-white font-medium" />
        </div>

        <div className="flex items-center justify-between bg-emerald-50 rounded-lg p-3">
          <div>
            <div className="text-xs text-gray-600">{rule?.type ?? '控除種別'}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{rule?.note ?? ''}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-emerald-700">{fmt(deductionAmount)}</div>
            <div className="text-[10px] text-emerald-600">控除額</div>
          </div>
        </div>

        {rule?.cap && annualAmount > rule.cap && (
          <div className="text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded p-1.5">
            支払額が上限(¥{rule.cap.toLocaleString()})を超えているため、控除額は上限が適用されます
          </div>
        )}
      </div>
    </div>
  );
}
