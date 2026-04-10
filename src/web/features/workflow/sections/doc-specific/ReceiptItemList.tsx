// レシート品目リスト — OCR読取の品目を自動展開
import { useReview } from '../../context/ReviewContext';

interface ExtractedItem {
  name: string;
  quantity?: number;
  unit_price?: number;
  amount: number;
  tax_rate?: number;
}

export default function ReceiptItemList() {
  const { ci } = useReview();
  if (!ci) return null;
  const classification = ci.docClassification as Record<string, unknown> | null;
  const items = classification?.extracted_items as ExtractedItem[] | undefined;
  const hasReducedRate = items?.some(i => i.tax_rate === 0.08);

  return (
    <>
      {items && items.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-800 mb-2">🧾 品目明細（OCR読取）</div>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-gray-200">
              <th className="text-left py-1 text-gray-500">品名</th>
              <th className="text-right py-1 text-gray-500">数量</th>
              <th className="text-right py-1 text-gray-500">単価</th>
              <th className="text-right py-1 text-gray-500">金額</th>
              <th className="text-right py-1 text-gray-500">税率</th>
            </tr></thead>
            <tbody>{items.map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1 text-gray-700">{item.name}</td>
                <td className="py-1 text-right text-gray-600">{item.quantity ?? '-'}</td>
                <td className="py-1 text-right text-gray-600">{item.unit_price != null ? `¥${item.unit_price.toLocaleString()}` : '-'}</td>
                <td className="py-1 text-right font-medium text-gray-900">¥{item.amount.toLocaleString()}</td>
                <td className="py-1 text-right text-gray-600">{item.tax_rate != null ? `${Math.round(item.tax_rate * 100)}%` : '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {hasReducedRate && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-2.5 flex items-start gap-2">
          <span className="text-orange-500 text-sm mt-0.5">⚠️</span>
          <div className="text-xs text-orange-800">
            <div className="font-semibold mb-0.5">軽減税率(8%)品目を検出</div>
            <div>軽減税率8%対象の品目が含まれています。税率混在の場合は分割仕訳を検討してください。</div>
            <button type="button" className="mt-1.5 px-3 py-1 bg-orange-200 hover:bg-orange-300 rounded text-orange-800 font-medium text-[10px] transition-colors">
              税率別に自動分割
            </button>
          </div>
        </div>
      )}
    </>
  );
}
