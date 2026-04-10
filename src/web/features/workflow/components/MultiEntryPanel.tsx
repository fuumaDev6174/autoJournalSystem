import { ChevronDown, StickyNote } from 'lucide-react';
import { getStatusLabel, getStatusBadgeClass } from '@/web/shared/constants/statuses';
import type { MultiEntryGroup } from '@/web/features/workflow/pages/ReviewPage';

interface MultiEntryPanelProps {
  group: MultiEntryGroup;
  rowNum: number;
  isExpanded: boolean;
  onToggle: (docId: string) => void;
  onBulkReview: (docId: string) => void;
  onOpenDetail: (entryId: string) => void;
  fmt: (n: number | undefined) => string;
}

export default function MultiEntryPanel({
  group, rowNum, isExpanded, onToggle, onBulkReview, onOpenDetail, fmt,
}: MultiEntryPanelProps) {
  return (
    <>
      <tr
        onClick={() => onToggle(group.documentId)}
        className="cursor-pointer bg-indigo-50/50 hover:bg-indigo-50 transition-colors border-l-4 border-indigo-400">
        <td className="px-3 py-3 text-xs text-gray-400">{rowNum}</td>
        <td className="px-4 py-3 text-sm" colSpan={2}>
          <div className="flex items-center gap-2">
            <ChevronDown size={14} className={`text-indigo-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
            <span className="font-medium text-indigo-700">{group.fileName}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-medium">{group.entries.length}件</span>
            {group.uncheckedCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">未確認{group.uncheckedCount}</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">明細</td>
        <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums">{fmt(group.totalAmount)}</td>
        <td className="px-4 py-3 text-center">
          {group.uncheckedCount > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onBulkReview(group.documentId); }}
              className="px-2 py-1 bg-blue-500 text-white rounded text-[10px] hover:bg-blue-600 font-medium">
              全て確認済みに
            </button>
          )}
        </td>
      </tr>
      {isExpanded && group.entries.map((childEntry) => {
        const needsReview = childEntry.requires_review || (childEntry.ai_confidence != null && childEntry.ai_confidence < 0.7);
        return (
          <tr key={childEntry.id} onClick={() => onOpenDetail(childEntry.id)}
            className={`cursor-pointer transition-colors hover:bg-gray-50 bg-white border-l-4 border-indigo-200 ${needsReview ? 'bg-yellow-50' : ''}`}>
            <td className="px-3 py-2 text-xs text-gray-300 pl-6">-</td>
            <td className="px-4 py-2 text-sm text-gray-600">{new Date(childEntry.entry_date).toLocaleDateString('ja-JP')}</td>
            <td className="px-4 py-2 text-sm max-w-[200px] truncate">
              {childEntry.description || '-'}
              {childEntry.notes && <StickyNote size={12} className="text-amber-400 inline ml-1" />}
            </td>
            <td className="px-4 py-2 text-sm">{childEntry.accountItemName || '-'}</td>
            <td className="px-4 py-2 text-sm">{childEntry.taxCategoryName || '-'}</td>
            <td className="px-4 py-2 text-sm text-right tabular-nums">{fmt(childEntry.amount)}</td>
            <td className="px-4 py-2 text-center">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(childEntry.status)}`}>
                {getStatusLabel(childEntry.status)}
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}
