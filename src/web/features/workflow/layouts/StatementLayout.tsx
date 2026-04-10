/**
 * @module 明細レイアウト
 */
import ImageViewer from '@/web/features/workflow/components/ImageViewer';
import { useReview } from '../context/ReviewContext';
import OcrSummaryBadges from '../sections/OcrSummaryBadges';
import NavigationBar from '../sections/NavigationBar';
import SaveStatusBar from '../sections/SaveStatusBar';

export default function StatementLayout() {
  const { ci, zoom, setZoom, rotation, setRotation, items, fmt } = useReview();
  if (!ci) return null;

  // Gather all entries for this document (multi-entry)
  const siblingEntries = items.filter(it => it.docId === ci.docId);

  return (
    <div className="grid grid-cols-5 gap-4" className="animate-fadeSlideUp">
      {/* Image: 2/5 */}
      <div className="col-span-2">
        <ImageViewer
          fileName={ci.fileName}
          imageUrl={ci.imageUrl}
          zoom={zoom}
          setZoom={setZoom}
          rotation={rotation}
          setRotation={setRotation}
        />
      </div>

      {/* Statement table: 3/5 */}
      <div className="col-span-3 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden min-h-[480px]">
        <OcrSummaryBadges />

        <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between text-xs">
          <span className="font-medium text-emerald-800">明細一括レビュー</span>
          <span className="text-emerald-600">{siblingEntries.length}件</span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">日付</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">摘要</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">金額</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">勘定科目</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">状態</th>
              </tr>
            </thead>
            <tbody>
              {siblingEntries.map((entry, idx) => (
                <tr key={entry.entryId || idx} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                  <td className="px-3 py-2.5">{entry.entryDate ? new Date(entry.entryDate).toLocaleDateString('ja-JP') : '-'}</td>
                  <td className="px-3 py-2.5 font-medium">{entry.description || '-'}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{fmt(entry.lineAmount)}</td>
                  <td className="px-3 py-2.5 text-gray-500">-</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      entry.status === 'approved' ? 'bg-green-100 text-green-700' :
                      entry.status === 'reviewed' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {entry.status === 'approved' ? '承認済' : entry.status === 'reviewed' ? '確認済' : '未確認'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-xs flex justify-between">
          <span>合計: <b>{fmt(siblingEntries.reduce((sum, e) => sum + (e.lineAmount || 0), 0))}</b> / {siblingEntries.length}件</span>
        </div>

        <div className="p-4">
          <NavigationBar />
          <div className="mt-2"><SaveStatusBar /></div>
        </div>
      </div>
    </div>
  );
}
