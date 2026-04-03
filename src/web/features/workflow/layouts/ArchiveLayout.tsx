import ImageViewer from '@/web/features/workflow/components/ImageViewer';
import { useReview } from '../context/ReviewContext';
import NavigationBar from '../sections/NavigationBar';

export default function ArchiveLayout() {
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
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <span className="font-bold text-sm">保管書類</span>
          <span className="ml-auto text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">処理不要</span>
        </div>
        <div className="flex-1 p-4 flex flex-col gap-3.5 overflow-y-auto">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-gray-400 text-sm mb-2">この書類は保管のみです</div>
            <div className="text-xs text-gray-500">アップロードして保存義務を果たすだけの書類です。<br />システムが中身を読む必要はありません。</div>
          </div>

          {ci.fileName && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
              <div className="text-gray-400 mb-1">ファイル名</div>
              <div className="font-medium">{ci.fileName}</div>
            </div>
          )}

          <NavigationBar />
        </div>
      </div>
    </div>
  );
}
