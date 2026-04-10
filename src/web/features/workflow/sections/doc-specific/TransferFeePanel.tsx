// 振込手数料パネル — OCR読取の手数料負担者を自動選択
import { useState } from 'react';
import { useReview } from '../../context/ReviewContext';

const OPTIONS = [
  { key: 'sender', label: '先方負担' },
  { key: 'receiver', label: '当方負担' },
  { key: 'none', label: 'なし' },
];

export default function TransferFeePanel() {
  const { ci } = useReview();
  const classification = ci?.docClassification as Record<string, unknown> | null;
  const ocrDetected = classification?.extracted_transfer_fee_bearer as string | undefined;
  const [selected, setSelected] = useState(ocrDetected || 'sender');

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-purple-800 mb-2">🏧 振込手数料{ocrDetected && ' （OCR検出）'}</div>
      <div className="flex gap-2">
        {OPTIONS.map(o => (
          <button type="button" key={o.key} onClick={() => setSelected(o.key)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${selected === o.key ? 'border-2 border-purple-500 bg-purple-50 text-purple-700 font-medium' : 'border border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
