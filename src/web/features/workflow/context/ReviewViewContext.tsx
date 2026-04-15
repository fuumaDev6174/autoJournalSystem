// レビュービューコンテキスト
import { createContext, useContext, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ViewMode, TabFilter } from './ReviewContext';
import type { DocCategoryGroup, DocCategory } from '../constants/docCategoryMap';

export interface ReviewViewContextType {
  viewMode: ViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  activeTab: TabFilter;
  setActiveTab: React.Dispatch<React.SetStateAction<TabFilter>>;
  activeCategoryTab: DocCategoryGroup;
  setActiveCategoryTab: React.Dispatch<React.SetStateAction<DocCategoryGroup>>;
  activeSubCategory: DocCategory | null;
  setActiveSubCategory: React.Dispatch<React.SetStateAction<DocCategory | null>>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  rotation: number;
  setRotation: React.Dispatch<React.SetStateAction<number>>;
  selectedRowRef: React.RefObject<HTMLTableRowElement | null>;
}

const ReviewViewCtx = createContext<ReviewViewContextType | null>(null);

export function useReviewView(): ReviewViewContextType {
  const ctx = useContext(ReviewViewCtx);
  if (!ctx) throw new Error('useReviewView must be used within ReviewViewProvider');
  return ctx;
}

export function ReviewViewProvider({ children }: { children: React.ReactNode }) {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'excluded' ? 'excluded' : 'all';

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeTab, setActiveTab] = useState<TabFilter>(initialTab);
  const [activeCategoryTab, setActiveCategoryTab] = useState<DocCategoryGroup>('all');
  const [activeSubCategory, setActiveSubCategory] = useState<DocCategory | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  const value: ReviewViewContextType = {
    viewMode, setViewMode,
    activeTab, setActiveTab,
    activeCategoryTab, setActiveCategoryTab,
    activeSubCategory, setActiveSubCategory,
    zoom, setZoom,
    rotation, setRotation,
    selectedRowRef,
  };

  return <ReviewViewCtx.Provider value={value}>{children}</ReviewViewCtx.Provider>;
}
