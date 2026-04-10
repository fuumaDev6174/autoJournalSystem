/**
 * @module 振込手数料パネル
 */
export default function TransferFeePanel() {
  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-purple-800 mb-2">🏧 振込手数料</div>
      <div className="flex gap-2">
        <button type="button" className="px-3 py-1.5 text-xs rounded-lg border-2 border-purple-500 bg-purple-50 text-purple-700 font-medium">先方負担</button>
        <button type="button" className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50">当方負担</button>
        <button type="button" className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50">なし</button>
      </div>
    </div>
  );
}
