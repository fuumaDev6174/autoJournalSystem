import { useReview } from '../context/ReviewContext';

export default function MultiEntrySiblingTabs() {
  const { ci, isMultiEntry, siblingItems, onSwitchSibling, fmt } = useReview();
  if (!isMultiEntry || siblingItems.length <= 1 || !ci) return null;
  return (
    <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] text-indigo-600 font-medium">同一証憑の仕訳:</span>
      {siblingItems.map((sib, idx) => {
        const isCurrent = sib.entryId === ci.entryId;
        return (
          <button key={sib.entryId || idx} type="button"
            onClick={() => { if (!isCurrent) onSwitchSibling(sib); }}
            className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${
              isCurrent ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
            }`}>
            {idx + 1}. {sib.description?.slice(0, 15) || '明細'} {fmt(sib.lineAmount)}
          </button>
        );
      })}
    </div>
  );
}
