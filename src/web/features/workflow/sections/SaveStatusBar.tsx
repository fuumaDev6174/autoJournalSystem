import { Loader } from 'lucide-react';
import { useReview } from '../context/ReviewContext';

export default function SaveStatusBar() {
  const { ci, saving, savedAt } = useReview();
  return (
    <div className="flex items-center justify-between">
      {ci?.entryId && <span className="text-[10px] text-gray-400">仕訳ID: {ci.entryId.slice(0, 8)}...</span>}
      <div className="flex items-center gap-2 ml-auto">
        {saving && <Loader size={12} className="animate-spin text-blue-500" />}
        {savedAt && <span className="text-xs text-green-600">✓ {savedAt} 保存済み</span>}
      </div>
    </div>
  );
}
