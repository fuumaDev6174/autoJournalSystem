import ImageViewer from '@/web/features/workflow/components/ImageViewer';
import { useReview } from '../context/ReviewContext';
import OcrSummaryBadges from '../sections/OcrSummaryBadges';
import NavigationBar from '../sections/NavigationBar';
import SaveStatusBar from '../sections/SaveStatusBar';

export default function MetadataLayout() {
  const { ci, zoom, setZoom, rotation, setRotation } = useReview();
  if (!ci) return null;

  return (
    <div className="grid grid-cols-2 gap-4" style={{ animation: 'fadeSlideUp .3s ease' }}>
      <ImageViewer
        fileName={ci.fileName}
        imageUrl={ci.imageUrl}
        zoom={zoom}
        setZoom={setZoom}
        rotation={rotation}
        setRotation={setRotation}
      />
      <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden" style={{ minHeight: 480 }}>
        <OcrSummaryBadges />
        <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 flex items-center gap-2 text-xs">
          <span className="font-medium text-purple-800">メタデータ抽出</span>
          <span className="ml-auto text-[10px] text-gray-400">※ 仕訳は生成されません</span>
        </div>
        <div className="flex-1 p-4 flex flex-col gap-3.5 overflow-y-auto">
          {/* doc-specific metadata fields will be rendered here via extraSections in Phase 7 */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-purple-800 mb-2">抽出データ</div>
            <div className="text-xs text-purple-700">
              {ci.docClassification?.document_type_code && (
                <div>書類種別: <span className="font-medium">{ci.docClassification.document_type_code}</span></div>
              )}
              {ci.supplierName && <div>発行元: <span className="font-medium">{ci.supplierName}</span></div>}
              {ci.documentDate && <div>日付: <span className="font-medium">{new Date(ci.documentDate).toLocaleDateString('ja-JP')}</span></div>}
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-800">
            <div className="font-semibold mb-1">システムでの用途</div>
            <div className="text-indigo-700">この書類はシステムの設定やロジック分岐に使用されるメタデータを含みます。内容を確認し、必要に応じて修正してください。</div>
          </div>

          <NavigationBar />
          <SaveStatusBar />
        </div>
      </div>
    </div>
  );
}
