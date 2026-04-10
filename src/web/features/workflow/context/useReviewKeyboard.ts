/**
 * @module レビューキーボード hooks
 * useRef パターンでイベントリスナーを安定化し、毎レンダリングの再登録を防止する。
 */
import { useEffect, useRef } from 'react';
import type { ViewMode, DocumentWithEntry } from './ReviewContext';
import { ZOOM } from '@/web/shared/constants/ui';

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
  // useRef で最新の params を保持。イベントリスナーは ref 経由で呼ぶため依存配列が空になる。
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const p = paramsRef.current;

      if (p.viewMode === 'detail') {
        if (e.key === 'p' || e.key === 'P') { e.preventDefault(); p.setBusiness(!p.form.isBusiness); }
        else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); p.setAddRule(prev => !prev); }
        else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); p.toggleExclude(); }
        else if ((e.key === 'n' || e.key === 'N') && !e.shiftKey) { e.preventDefault(); p.goNext(); }
        else if ((e.key === 'n' || e.key === 'N') && e.shiftKey) { e.preventDefault(); p.goPrev(); }
        else if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); p.goNext(); }
        else if (e.key === 'ArrowRight' && !e.altKey && p.currentIndex < p.itemsLength - 1) { e.preventDefault(); p.goNext(); }
        else if (e.key === 'ArrowLeft' && !e.altKey && p.currentIndex > 0) { e.preventDefault(); p.goPrev(); }
        else if (e.key === 'Escape') { e.preventDefault(); p.saveCurrentItem(false); p.setViewMode('list'); p.loadAllData(); }
        else if (e.key === '+' || e.key === '=') { e.preventDefault(); p.setZoom(z => Math.min(ZOOM.MAX, z + ZOOM.STEP)); }
        else if (e.key === '-') { e.preventDefault(); p.setZoom(z => Math.max(ZOOM.MIN, z - ZOOM.STEP)); }
        else if (e.key === '0') { e.preventDefault(); p.setZoom(ZOOM.DEFAULT); }
        else if (e.key === 's' && e.ctrlKey) { e.preventDefault(); p.saveCurrentItem(false); }
      }
      if (p.viewMode === 'list') {
        if (e.key === 'i' || e.key === 'I') { e.preventDefault(); p.openDetailFromTop(); }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // 空の依存配列 — リスナーは一度だけ登録
}
