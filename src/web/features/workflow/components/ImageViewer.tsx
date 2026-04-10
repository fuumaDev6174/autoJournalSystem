import { ZoomOut, ZoomIn, RotateCcw, AlertCircle } from 'lucide-react';

interface ImageViewerProps {
  fileName: string;
  imageUrl: string | null;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  rotation: number;
  setRotation: React.Dispatch<React.SetStateAction<number>>;
}

export default function ImageViewer({ fileName, imageUrl, zoom, setZoom, rotation, setRotation }: ImageViewerProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden min-h-[480px]">
      <div className="p-3 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
        <div>
          <div className="font-semibold text-sm">証憑画像</div>
          <div className="text-xs text-gray-400 truncate max-w-[200px]">{fileName}</div>
        </div>
        <div className="flex items-center gap-0.5 border border-gray-200 rounded-md p-0.5">
          <button type="button" onClick={() => setZoom(z => Math.max(25, z - 25))} className="p-1.5 hover:bg-gray-100 rounded text-gray-600"><ZoomOut size={14} /></button>
          <button type="button" onClick={() => setZoom(100)} className="px-1.5 py-1 hover:bg-gray-100 rounded text-xs text-gray-500 font-mono" title="フィット">{zoom}%</button>
          <button type="button" onClick={() => setZoom(z => Math.min(300, z + 25))} className="p-1.5 hover:bg-gray-100 rounded text-gray-600"><ZoomIn size={14} /></button>
          <div className="w-px h-3.5 bg-gray-200 mx-0.5" />
          <button type="button" onClick={() => setRotation(r => (r + 90) % 360)} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="90度回転"><RotateCcw size={14} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center p-2 min-h-[500px]">
        {imageUrl ? (
          fileName?.toLowerCase().endsWith('.pdf') ? (
            <iframe src={`${imageUrl}#toolbar=0&view=FitH`}
              className="border-0 rounded shadow-sm"
              style={{
                width: `${Math.max(zoom, 100)}%`,
                height: 'calc(100vh - 260px)',
                minHeight: 600,
                transform: `rotate(${rotation}deg)`,
                transition: 'transform .3s',
                transformOrigin: 'center center',
              }} title={fileName} />
          ) : (
            <img src={imageUrl} alt={fileName}
              style={{ width: `${zoom}%`, maxWidth: 'none', transform: `rotate(${rotation}deg)`, transition: 'transform .3s', transformOrigin: 'center center' }}
              className="rounded shadow-sm border border-gray-200 object-contain" />
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2"><AlertCircle size={40} /><span className="text-sm">読み込めませんでした</span></div>
        )}
      </div>
    </div>
  );
}
