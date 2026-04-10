/**
 * @module 決済手段セレクター
 */
export default function PaymentMethodSelector() {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <label className="text-xs font-semibold mb-1.5 block">💳 支払方法（OCR検出）</label>
      <div className="flex gap-2">
        <button type="button" className="px-3 py-1.5 text-xs rounded-lg border-2 border-indigo-500 bg-indigo-50 text-indigo-700 font-medium">現金</button>
        <button type="button" className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50">クレジットカード</button>
        <button type="button" className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50">電子マネー</button>
        <button type="button" className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50">銀行振込</button>
      </div>
    </div>
  );
}
