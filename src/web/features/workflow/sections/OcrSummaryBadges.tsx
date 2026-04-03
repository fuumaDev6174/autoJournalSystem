import { useReview } from '../context/ReviewContext';

const TX_TYPE_LABELS: Record<string, string> = { purchase: '仕入', expense: '経費', asset: '資産', sales: '売上', fee: '報酬' };

export default function OcrSummaryBadges() {
  const { ci } = useReview();
  if (!ci) return null;
  return (
    <div className="p-3 border-b border-gray-100 flex items-center gap-2 flex-wrap flex-shrink-0">
      <span className="font-bold text-sm">仕訳データ</span>
      {ci.supplierName && <span className="text-xs px-2.5 py-0.5 rounded bg-blue-50 text-blue-600">OCR: {ci.supplierName}</span>}
      {ci.docClassification?.tategaki && (
        <span className="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-700">但: {ci.docClassification.tategaki}</span>
      )}
      {ci.docClassification?.withholding_tax_amount != null && (
        <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700">源泉: ¥{ci.docClassification.withholding_tax_amount.toLocaleString()}</span>
      )}
      {ci.docClassification?.invoice_qualification && (
        <span className={`text-xs px-2 py-0.5 rounded ${ci.docClassification.invoice_qualification === 'qualified' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
          {ci.docClassification.invoice_qualification === 'qualified' ? '適格' : '非適格'}
        </span>
      )}
      {ci.docClassification?.transaction_type && (
        <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700">
          {TX_TYPE_LABELS[ci.docClassification.transaction_type] || ci.docClassification.transaction_type}
        </span>
      )}
      {ci.aiConfidence != null && (
        <span className={`text-xs px-2.5 py-0.5 rounded font-semibold ml-auto ${ci.aiConfidence >= 0.8 ? 'bg-green-50 text-green-700' : ci.aiConfidence >= 0.5 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
          AI信頼度 {Math.round(ci.aiConfidence * 100)}%
        </span>
      )}
    </div>
  );
}
