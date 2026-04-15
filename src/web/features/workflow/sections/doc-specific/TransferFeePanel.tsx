// 振込手数料パネル — OCR読取 + form連携 + 差引計算
import { useReview } from '../../context/ReviewContext';

const OPTIONS = [
  { key: 'none', label: 'なし' },
  { key: 'receiver', label: '当方負担' },
  { key: 'sender', label: '先方負担' },
] as const;

export default function TransferFeePanel() {
  const { ci, form, setForm } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const formAny = form as Record<string, unknown>;

  const ocrDetected = classification?.extracted_transfer_fee_bearer as string | undefined;
  const selected = (formAny.transferFeeBearer as string) ?? ocrDetected ?? 'none';
  const feeAmount = (formAny.transferFeeAmount as number) ?? 0;
  const totalAmount = form.lineAmount || ci.amount || 0;

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-purple-800 mb-2">
        振込手数料{ocrDetected && ' （OCR検出）'}
      </div>
      <div className="flex gap-2 mb-2">
        {OPTIONS.map(o => (
          <button type="button" key={o.key}
            onClick={() => setForm(prev => ({ ...prev, transferFeeBearer: o.key }))}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${selected === o.key ? 'border-2 border-purple-500 bg-purple-50 text-purple-700 font-medium' : 'border border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            {o.label}
          </button>
        ))}
      </div>

      {selected === 'receiver' && (
        <div className="text-xs">
          <label className="text-gray-500 block mb-0.5">手数料額（円）</label>
          <input type="number" value={feeAmount || ''} placeholder="0"
            onChange={e => setForm(prev => ({ ...prev, transferFeeAmount: Number(e.target.value) || 0 }))}
            className="w-full border border-purple-300 rounded p-1.5 text-sm bg-white" />
          <p className="text-[10px] text-gray-400 mt-0.5">当方負担の場合「支払手数料」の借方行が自動追加されます</p>
        </div>
      )}

      {selected === 'sender' && (
        <div className="text-xs bg-purple-100 rounded p-2">
          <div className="flex justify-between">
            <span className="text-purple-700">請求額</span>
            <span className="font-medium">¥{totalAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-purple-700">手数料額</span>
            <input type="number" value={feeAmount || ''} placeholder="0"
              onChange={e => setForm(prev => ({ ...prev, transferFeeAmount: Number(e.target.value) || 0 }))}
              className="w-20 border border-purple-300 rounded p-1 text-xs bg-white text-right" />
          </div>
          <div className="flex justify-between border-t border-purple-300 pt-1 mt-1">
            <span className="text-purple-800 font-medium">支払額</span>
            <span className="font-bold text-purple-900">¥{(totalAmount - feeAmount).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
