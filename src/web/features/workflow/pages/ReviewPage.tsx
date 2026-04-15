// レビューページ
import { useState } from 'react';
import {
  Ban, AlertCircle, Loader, CheckCircle, Eye, Undo2, Clock, StickyNote, ChevronDown,
} from 'lucide-react';
import { journalEntriesApi } from '@/web/shared/lib/api/backend.api';
import WorkflowHeader from '@/web/features/workflow/components/WorkflowHeader';
import { useConfirm } from '@/web/shared/hooks/useConfirm';
import { getStatusLabel, getStatusBadgeClass } from '@/web/shared/constants/statuses';
import MultiEntryPanel from '@/web/features/workflow/components/MultiEntryPanel';
import LayoutDispatcher from '@/web/features/workflow/layouts/LayoutDispatcher';
import {
  ReviewProvider, useReview,
  type EntryRow, type LineRow, type DocumentWithEntry, type TaxRateOption, type MultiEntryGroup,
} from '@/web/features/workflow/context/ReviewContext';
import {
  DOC_CATEGORY_TABS, getCategoryLabel, getCategoryColor,
} from '@/web/features/workflow/constants/docCategoryMap';

// Re-export types for backward compatibility
export type { EntryRow, LineRow, DocumentWithEntry, TaxRateOption, MultiEntryGroup };

// ============================================
// Inner component (uses context)
// ============================================
function ReviewPageContent() {
  const { confirm, ConfirmDialogElement } = useConfirm();
  const {
    currentWorkflow, viewMode, setViewMode, activeTab, setActiveTab, loading,
    activeCategoryTab, setActiveCategoryTab, activeSubCategory, setActiveSubCategory,
    entries, multiEntryGroups, expandedDocs, items, currentIndex, ci,
    isManagerOrAdmin, selectedRowRef, docTypeCodeMap,
    loadAllData, saveCurrentItem,
    openDetail, openDetailFromTop,
    handleRevert, handleApproveFromList,
    toggleMultiEntryGroup, handleBulkReviewGroup,
    handleBeforeNext, fmt,
    filteredEntries, categoryCounts, allCount, uncheckedCount, reviewedCount, approvedCount, excludedCount, reviewCount,
    user,
  } = useReview();
  const [journalDropdownOpen, setJournalDropdownOpen] = useState(false);

  // ============================================
  // Guards
  // ============================================
  if (!currentWorkflow) return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="text-center max-w-md">
        <AlertCircle size={64} className="text-yellow-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">ワークフローが開始されていません</h2>
        <p className="text-gray-600 mb-6">顧客一覧からワークフローを開始してください。</p>
        <a href="/clients" className="btn-primary">顧客一覧へ戻る</a>
      </div>
    </div>
  );
  if (loading) return (
    <div className="flex flex-col">
      <WorkflowHeader onBeforeNext={handleBeforeNext} nextLabel="仕訳出力へ" />
      <div className="flex-1 flex items-center justify-center p-6">
        <Loader size={32} className="animate-spin text-blue-500" /><span className="ml-3 text-gray-500">読み込み中...</span>
      </div>
    </div>
  );

  // ============================================
  // Render
  // ============================================
  return (
    <div className="flex flex-col bg-gray-50">
      <WorkflowHeader onBeforeNext={handleBeforeNext} nextLabel="仕訳出力へ" />

      {/* Tabs */}
      <div className="bg-white px-6 border-b border-gray-200 flex gap-0 flex-shrink-0">
        {([
          { key: 'all' as const, label: 'すべて', count: allCount },
          { key: 'unchecked' as const, label: '未確認', count: uncheckedCount },
          { key: 'reviewed' as const, label: '承認待ち', count: reviewedCount },
          { key: 'excluded' as const, label: '対象外', count: excludedCount },
        ]).map(tab => (
          <button type="button" key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? 'text-blue-600 border-blue-600 font-semibold' : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}>
            {tab.label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* 第2階層: 種別サブタブ */}
      <div className="bg-white px-6 border-b border-gray-100 flex gap-1 flex-shrink-0 py-1.5 relative">
        {DOC_CATEGORY_TABS.map(tab => {
          const isActive = activeCategoryTab === tab.key;
          const count = categoryCounts[tab.key] ?? 0;
          const hasDropdown = tab.subCategories && tab.subCategories.length > 0;

          return (
            <div key={tab.key} className="relative"
              onMouseEnter={() => hasDropdown && tab.key === 'journal' && setJournalDropdownOpen(true)}
              onMouseLeave={() => hasDropdown && setJournalDropdownOpen(false)}>
              <button type="button"
                onClick={() => {
                  setActiveCategoryTab(tab.key);
                  setActiveSubCategory(null);
                  if (hasDropdown) setJournalDropdownOpen(prev => !prev);
                }}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}>
                {tab.label}
                {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>{count}</span>}
                {hasDropdown && <ChevronDown size={12} className={`transition-transform ${journalDropdownOpen && isActive ? 'rotate-180' : ''}`} />}
              </button>

              {/* ドロップダウン（仕訳対象のサブカテゴリ） */}
              {hasDropdown && journalDropdownOpen && tab.key === 'journal' && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-40 min-w-[140px]">
                  {tab.subCategories!.map(sub => {
                    const subCount = categoryCounts[sub.key] ?? 0;
                    const isSubActive = activeSubCategory === sub.key;
                    return (
                      <button type="button" key={sub.key}
                        onClick={() => {
                          setActiveCategoryTab('journal');
                          setActiveSubCategory(isSubActive ? null : sub.key);
                          setJournalDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${
                          isSubActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                        <span>{sub.label}</span>
                        {subCount > 0 && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{subCount}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {activeSubCategory && (
          <button type="button" onClick={() => { setActiveSubCategory(null); setActiveCategoryTab('all'); }}
            className="ml-2 text-[10px] text-gray-400 hover:text-gray-600 underline">
            フィルタ解除
          </button>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-7xl mx-auto space-y-5">

          {/* Summary cards */}
          {viewMode === 'list' && (
            <div className="grid grid-cols-4 gap-3">
              {([
                { label: '全件', count: allCount, color: 'text-gray-900', bg: 'bg-white' },
                { label: '確認済み', count: approvedCount, color: 'text-green-600', bg: 'bg-green-50' },
                { label: '未確認', count: uncheckedCount, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: '要確認', count: reviewCount, color: 'text-orange-600', bg: 'bg-orange-50' },
              ]).map(c => (
                <div key={c.label} className={`${c.bg} rounded-lg border border-gray-200 p-4`}>
                  <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                  <div className={`text-3xl font-bold ${c.color}`}>{c.count}</div>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'list' && isManagerOrAdmin && reviewedCount > 0 && (
            <button
              onClick={async () => {
                if (!await confirm(`確認済みの${reviewedCount}件を一括承認しますか？`)) return;
                const reviewedEntries = entries.filter(e => e.status === 'reviewed');
                const currentUser = user;
                if (!currentUser) return;
                for (const e of reviewedEntries) {
                  await journalEntriesApi.approve(e.id, {
                    approver_id: currentUser.id, approval_status: 'approved', approval_level: 1, comments: '一括承認',
                  });
                }
                await loadAllData();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <CheckCircle size={16} /> 確認済み{reviewedCount}件を一括承認
            </button>
          )}

          {/* Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {viewMode === 'list' && (
              <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-900">仕訳一覧</h2>
                <button type="button" onClick={openDetailFromTop}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors bg-red-500 hover:bg-red-600">
                  <Eye size={16} /> 個別チェックに切り替え
                </button>
              </div>
            )}

            <div>
              {viewMode === 'detail' ? (
                <div className="flex">
                  <div className="flex-1 max-h-[90px] overflow-y-auto">
                    <table className="w-full">
                      <tbody className="divide-y divide-gray-100">
                        {filteredEntries.map((entry, idx) => {
                          const isSelected = items[currentIndex]?.entryId === entry.id;
                          const statusLabel = entry.is_excluded ? '外' : getStatusLabel(entry.status);
                          const badgeClass = entry.is_excluded ? 'bg-red-100 text-red-600' : getStatusBadgeClass(entry.status);
                          return (
                            <tr key={entry.id} ref={isSelected ? selectedRowRef : undefined}
                              onClick={() => openDetail(entry.id)}
                              className={`cursor-pointer text-xs transition-colors ${isSelected ? 'bg-blue-100 font-semibold' : 'hover:bg-gray-50'}`}>
                              <td className="pl-3 pr-1 py-1 text-gray-400 w-6">{idx + 1}</td>
                              <td className="px-1 py-1 text-gray-700 truncate max-w-[120px]">{entry.description || '-'}</td>
                              <td className="px-1 py-1 text-gray-500 truncate max-w-[80px]">{entry.accountItemName || '-'}</td>
                              <td className="px-1 py-1 text-right tabular-nums">{fmt(entry.amount)}</td>
                              <td className="px-1 py-1 text-center">
                                <span className={`text-[9px] px-1 py-0.5 rounded ${badgeClass}`}>{statusLabel}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={() => { saveCurrentItem(false); setViewMode('list'); loadAllData(); }}
                    className="w-7 flex-shrink-0 bg-gray-100 hover:bg-gray-200 border-l border-gray-200 flex items-center justify-center transition-colors"
                    title="一覧に戻る">
                    <span className="text-[10px] font-medium text-gray-500" style={{ writingMode: 'vertical-rl' }}>一覧へ</span>
                  </button>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase w-10">#</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">取引日</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">摘要</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">勘定科目</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">税区分</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">金額</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">状態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredEntries.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">データがありません</td></tr>
                    ) : (() => {
                      const renderedDocIds = new Set<string>();
                      const rows: React.ReactNode[] = [];
                      let rowNum = 0;

                      filteredEntries.forEach((entry) => {
                        const docId = entry.document_id || '';
                        const group = multiEntryGroups.find(g => g.documentId === docId);
                        const isMulti = group && group.entries.length > 1;

                        if (isMulti && !renderedDocIds.has(docId)) {
                          renderedDocIds.add(docId);
                          rowNum++;
                          rows.push(
                            <MultiEntryPanel key={`group-${docId}`}
                              group={group} rowNum={rowNum}
                              isExpanded={expandedDocs.has(docId)}
                              onToggle={toggleMultiEntryGroup}
                              onBulkReview={handleBulkReviewGroup}
                              onOpenDetail={openDetail}
                              fmt={fmt} />
                          );
                          return;
                        }

                        if (isMulti && renderedDocIds.has(docId)) return;

                        rowNum++;
                        const needsReview = entry.requires_review || (entry.ai_confidence != null && entry.ai_confidence < 0.7);
                        const isSelected = items[currentIndex]?.entryId === entry.id;
                        rows.push(
                          <tr key={entry.id} onClick={() => openDetail(entry.id)}
                            className={`cursor-pointer transition-colors hover:bg-gray-50 ${needsReview ? 'bg-yellow-50' : ''} ${isSelected ? 'bg-blue-50' : ''} ${entry.status === 'approved' ? 'bg-green-50/30' : ''}`}>
                            <td className="px-3 py-3 text-xs text-gray-400">{rowNum}</td>
                            <td className="px-4 py-3 text-sm">{new Date(entry.entry_date).toLocaleDateString('ja-JP')}</td>
                            <td className="px-4 py-3 text-sm max-w-[250px] truncate">
                              {(() => {
                                const dtCode = entry.document_id ? docTypeCodeMap.get(entry.document_id) : undefined;
                                const catLabel = getCategoryLabel(dtCode);
                                const catColor = getCategoryColor(dtCode);
                                return catLabel ? <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium mr-1.5 ${catColor}`}>{catLabel}</span> : null;
                              })()}
                              {entry.description || '-'}
                              {entry.notes && <StickyNote size={12} className="text-amber-400 inline ml-1" />}
                            </td>
                            <td className="px-4 py-3 text-sm">{entry.accountItemName || '-'}</td>
                            <td className="px-4 py-3 text-sm">{entry.taxCategoryName || '-'}</td>
                            <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums">{fmt(entry.amount)}</td>
                            <td className="px-4 py-3 text-center">
                              {entry.is_excluded ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><Ban size={10} />対象外</span>
                              ) : entry.status === 'posted' ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"><CheckCircle size={10} />確定</span>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleRevert(entry.id, 'posted'); }}
                                    className="p-0.5 text-purple-500 hover:bg-purple-50 rounded" title="確定解除"><Undo2 size={12} /></button>
                                </div>
                              ) : entry.status === 'reviewed' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                  <Clock size={10} />確認済み
                                  {isManagerOrAdmin && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleApproveFromList(entry.id); }}
                                      className="ml-1 px-1.5 py-0.5 bg-green-500 text-white rounded text-[10px] hover:bg-green-600">
                                      承認
                                    </button>
                                  )}
                                </span>
                              ) : entry.status === 'approved' ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle size={10} />承認済</span>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleRevert(entry.id, 'approved'); }}
                                    className="p-0.5 text-green-500 hover:bg-green-50 rounded" title="差し戻し"><Undo2 size={12} /></button>
                                </div>
                              ) : needsReview ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><AlertCircle size={10} />要確認</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">未確認</span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                      return rows;
                    })()}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Detail view — dispatched by document type */}
          {viewMode === 'detail' && ci && <LayoutDispatcher />}

        </div>
      </div>

      <style>{`
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      {ConfirmDialogElement}
    </div>
  );
}

// ============================================
// Main export (wraps with provider)
// ============================================
export default function ReviewPage() {
  return (
    <ReviewProvider>
      <ReviewPageContent />
    </ReviewProvider>
  );
}
