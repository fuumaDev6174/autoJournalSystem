// 決済手段セレクター — OCR読取 + form連携
import { useReview } from '../../context/ReviewContext';

const METHODS = [
  { key: 'cash', label: '現金' },
  { key: 'bank_transfer', label: '銀行振込' },
  { key: 'credit_card', label: 'クレジットカード' },
  { key: 'e_money', label: '電子マネー' },
  { key: 'other', label: 'その他' },
] as const;

export default function PaymentMethodSelector() {
  const { ci, form, setForm } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const formAny = form as Record<string, unknown>;

  const ocrDetected = classification?.extracted_payment_method as string | undefined;
  const selected = (formAny.paymentMethod as string) ?? ocrDetected ?? 'cash';

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <label className="text-xs font-semibold mb-1.5 block text-gray-700">
        支払方法{ocrDetected && ' （OCR検出）'}
      </label>
      <div className="flex flex-wrap gap-2">
        {METHODS.map(m => (
          <button type="button" key={m.key}
            onClick={() => setForm(prev => ({ ...prev, paymentMethod: m.key }))}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${selected === m.key ? 'border-2 border-indigo-500 bg-indigo-50 text-indigo-700 font-medium' : 'border border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">
        {selected === 'cash' && '貸方: 現金'}
        {selected === 'bank_transfer' && '貸方: 普通預金'}
        {selected === 'credit_card' && '貸方: 未払金'}
        {selected === 'e_money' && '貸方: 未払金（電子マネー）'}
        {selected === 'other' && '貸方: 手動で設定してください'}
      </p>
    </div>
  );
}
