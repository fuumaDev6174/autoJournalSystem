/**
 * @module 家事按分パネル
 */
import { useReview } from '../context/ReviewContext';

export default function BusinessRatioPanel() {
  const { ci, form, businessRatio, setBusinessRatio, clientRatios } = useReview();
  if (!ci || form.isExcluded) return null;
  return (
    <div className={`border rounded-lg p-3 space-y-2 ${businessRatio === 100 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
      <div className="flex items-center justify-between">
        <label className={`text-xs font-semibold ${businessRatio === 100 ? 'text-blue-800' : 'text-orange-800'}`}>
          家事按分（事業用割合）
          {ci.matchedRuleBusinessRatio != null ? (
            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">ルール按分</span>
          ) : clientRatios.find(r => r.account_item_id === form.accountItemId) ? (
            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">顧客設定</span>
          ) : businessRatio < 100 ? (
            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">手動設定</span>
          ) : null}
        </label>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setBusinessRatio(Math.max(0, businessRatio - 1))}
            className="w-5 h-5 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-500 text-xs hover:bg-gray-50">−</button>
          <input type="number" min={0} max={100} value={businessRatio}
            onChange={e => setBusinessRatio(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className="w-12 text-center text-xs font-bold border border-gray-300 rounded p-0.5" />
          <span className="text-xs text-gray-500">%</span>
          <button type="button" onClick={() => setBusinessRatio(Math.min(100, businessRatio + 1))}
            className="w-5 h-5 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-500 text-xs hover:bg-gray-50">+</button>
        </div>
      </div>
      <input type="range" min={0} max={100} step={1} value={businessRatio}
        onChange={e => setBusinessRatio(Number(e.target.value))}
        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${businessRatio === 100 ? 'bg-blue-200 accent-blue-500' : 'bg-orange-200 accent-orange-500'}`} />
      {businessRatio < 100 && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white rounded p-2 border border-orange-200">
            <span className="text-orange-700 font-medium">事業用: </span>
            <span className="font-bold">¥{Math.round((form.lineAmount || 0) * businessRatio / 100).toLocaleString()}</span>
          </div>
          <div className="bg-white rounded p-2 border border-orange-200">
            <span className="text-gray-500 font-medium">私用: </span>
            <span className="font-bold">¥{Math.round((form.lineAmount || 0) * (100 - businessRatio) / 100).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
