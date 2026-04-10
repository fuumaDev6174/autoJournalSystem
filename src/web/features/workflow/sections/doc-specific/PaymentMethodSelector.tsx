// 決済手段セレクター — OCR読取の支払方法を自動選択
import { useState } from 'react';
import { useReview } from '../../context/ReviewContext';

const METHODS = [
  { key: 'cash', label: '現金' },
  { key: 'credit_card', label: 'クレジットカード' },
  { key: 'e_money', label: '電子マネー' },
  { key: 'bank_transfer', label: '銀行振込' },
];

export default function PaymentMethodSelector() {
  const { ci } = useReview();
  const classification = ci?.docClassification as Record<string, unknown> | null;
  const ocrDetected = classification?.extracted_payment_method as string | undefined;
  const [selected, setSelected] = useState(ocrDetected || 'cash');

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <label className="text-xs font-semibold mb-1.5 block">💳 支払方法{ocrDetected && ' （OCR検出）'}</label>
      <div className="flex gap-2">
        {METHODS.map(m => (
          <button type="button" key={m.key} onClick={() => setSelected(m.key)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${selected === m.key ? 'border-2 border-indigo-500 bg-indigo-50 text-indigo-700 font-medium' : 'border border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
