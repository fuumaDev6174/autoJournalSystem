import { ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { useReview } from '../context/ReviewContext';

export default function NavigationBar() {
  const { currentIndex, items, isManagerOrAdmin, goNext, goPrev, saveCurrentItem, setViewMode, loadAllData } = useReview();
  const itemsCount = items.length;
  return (
    <div className="flex gap-3 pt-3 border-t border-gray-200">
      <button onClick={goPrev} disabled={currentIndex === 0}
        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
        <ChevronLeft size={16} /> 前へ
      </button>
      {currentIndex >= itemsCount - 1 ? (
        <button onClick={async () => { await saveCurrentItem(true); setViewMode('list'); loadAllData(); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white ${isManagerOrAdmin ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          <CheckCircle size={16} /> {isManagerOrAdmin ? '確認・承認して完了' : '確認OK・完了'}
        </button>
      ) : (
        <button onClick={goNext}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white ${isManagerOrAdmin ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {isManagerOrAdmin ? '承認して次へ' : '確認OK・次へ'} <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
