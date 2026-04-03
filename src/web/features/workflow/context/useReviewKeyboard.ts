import { useCallback, useEffect } from 'react';
import type { ViewMode, DocumentWithEntry } from './ReviewContext';

interface UseReviewKeyboardParams {
  viewMode: ViewMode;
  form: Partial<DocumentWithEntry>;
  currentIndex: number;
  itemsLength: number;
  setBusiness: (isBusiness: boolean) => void;
  setAddRule: React.Dispatch<React.SetStateAction<boolean>>;
  toggleExclude: () => void;
  goNext: () => Promise<void>;
  goPrev: () => Promise<void>;
  saveCurrentItem: (markApproved?: boolean) => Promise<void>;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  loadAllData: () => Promise<void>;
  openDetailFromTop: () => void;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
}

export function useReviewKeyboard(params: UseReviewKeyboardParams) {
  const {
    viewMode, form, currentIndex, itemsLength,
    setBusiness, setAddRule, toggleExclude,
    goNext, goPrev, saveCurrentItem, setViewMode, loadAllData,
    openDetailFromTop, setZoom,
  } = params;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (viewMode === 'detail') {
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); setBusiness(!form.isBusiness); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setAddRule(prev => !prev); }
      else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); toggleExclude(); }
      else if ((e.key === 'n' || e.key === 'N') && !e.shiftKey) { e.preventDefault(); goNext(); }
      else if ((e.key === 'n' || e.key === 'N') && e.shiftKey) { e.preventDefault(); goPrev(); }
      else if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowRight' && !e.altKey && currentIndex < itemsLength - 1) { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft' && !e.altKey && currentIndex > 0) { e.preventDefault(); goPrev(); }
      else if (e.key === 'Escape') { e.preventDefault(); saveCurrentItem(false); setViewMode('list'); loadAllData(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(z => Math.min(300, z + 25)); }
      else if (e.key === '-') { e.preventDefault(); setZoom(z => Math.max(25, z - 25)); }
      else if (e.key === '0') { e.preventDefault(); setZoom(100); }
      else if (e.key === 's' && e.ctrlKey) { e.preventDefault(); saveCurrentItem(false); }
    }
    if (viewMode === 'list') {
      if (e.key === 'i' || e.key === 'I') { e.preventDefault(); openDetailFromTop(); }
    }
  }, [viewMode, form.isBusiness, currentIndex, itemsLength,
    setBusiness, setAddRule, toggleExclude, goNext, goPrev,
    saveCurrentItem, setViewMode, loadAllData, openDetailFromTop, setZoom]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
