/**
 * @module 除外ボタン
 */
import { Ban } from 'lucide-react';
import { useReview } from '../context/ReviewContext';

export default function ExcludeButton() {
  const { form, toggleExclude } = useReview();
  return (
    <button onClick={toggleExclude}
      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
        form.isExcluded ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-300 text-gray-500 bg-white hover:bg-gray-50'
      }`}>
      <Ban size={14} />{form.isExcluded ? '対象外を解除' : '対象外にする'}
      <span className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-white font-mono text-gray-400 ml-1">E</span>
    </button>
  );
}
