/**
 * @module レビューデータコンテキスト
 * 読み取り専用データ（items, entries, masterData, computed counts）を管理。
 */
import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { AccountItem, TaxCategory, Supplier } from '@/types';
import type {
  EntryRow, DocumentWithEntry, TaxRateOption, MultiEntryGroup, ItemMaster, TabFilter,
} from './ReviewContext';
import { ENTRY_STATUS } from '@/web/shared/constants/statuses';

export interface ReviewDataContextType {
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;

  entries: EntryRow[];
  setEntries: React.Dispatch<React.SetStateAction<EntryRow[]>>;
  multiEntryGroups: MultiEntryGroup[];
  setMultiEntryGroups: React.Dispatch<React.SetStateAction<MultiEntryGroup[]>>;
  expandedDocs: Set<string>;
  setExpandedDocs: React.Dispatch<React.SetStateAction<Set<string>>>;

  items: DocumentWithEntry[];
  setItems: React.Dispatch<React.SetStateAction<DocumentWithEntry[]>>;
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  ci: DocumentWithEntry | undefined;

  // Master data
  accountItems: AccountItem[];
  setAccountItems: React.Dispatch<React.SetStateAction<AccountItem[]>>;
  taxCategories: TaxCategory[];
  setTaxCategories: React.Dispatch<React.SetStateAction<TaxCategory[]>>;
  taxRates: TaxRateOption[];
  setTaxRates: React.Dispatch<React.SetStateAction<TaxRateOption[]>>;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  itemsMaster: ItemMaster[];
  setItemsMaster: React.Dispatch<React.SetStateAction<ItemMaster[]>>;
  industries: Array<{ id: string; name: string }>;
  setIndustries: React.Dispatch<React.SetStateAction<Array<{ id: string; name: string }>>>;
  clientRatios: Array<{ account_item_id: string; business_ratio: number }>;
  setClientRatios: React.Dispatch<React.SetStateAction<Array<{ account_item_id: string; business_ratio: number }>>>;

  // Multi-entry computed
  isMultiEntry: boolean;
  siblingItems: DocumentWithEntry[];

  // Computed counts (require activeTab from view context, passed as param)
  filteredEntries: (activeTab: TabFilter) => EntryRow[];
  allCount: number;
  uncheckedCount: number;
  reviewedCount: number;
  approvedCount: number;
  excludedCount: number;
  reviewCount: number;

  // Format helper
  fmt: (n: number | undefined) => string;
}

const ReviewDataCtx = createContext<ReviewDataContextType | null>(null);

export function useReviewData(): ReviewDataContextType {
  const ctx = useContext(ReviewDataCtx);
  if (!ctx) throw new Error('useReviewData must be used within ReviewDataProvider');
  return ctx;
}

export function ReviewDataProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);

  // List state
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [multiEntryGroups, setMultiEntryGroups] = useState<MultiEntryGroup[]>([]);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  // Detail state
  const [items, setItems] = useState<DocumentWithEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Master data
  const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [itemsMaster, setItemsMaster] = useState<ItemMaster[]>([]);
  const [industries, setIndustries] = useState<Array<{ id: string; name: string }>>([]);
  const [clientRatios, setClientRatios] = useState<Array<{ account_item_id: string; business_ratio: number }>>([]);

  // Computed
  const ci = items[currentIndex];
  const multiGroup = ci ? multiEntryGroups.find(g => g.documentId === ci.docId) : null;
  const isMultiEntry = !!(multiGroup && multiGroup.entries.length > 1);
  const siblingItems = isMultiEntry ? items.filter(it => it.docId === ci.docId) : [];

  const filteredEntries = useCallback((activeTab: TabFilter) => {
    if (activeTab === 'unchecked') return entries.filter(e => e.status === ENTRY_STATUS.DRAFT);
    if (activeTab === 'excluded') return entries.filter(e => e.is_excluded);
    return entries;
  }, [entries]);

  const allCount = entries.length;
  const uncheckedCount = useMemo(() => entries.filter(e => e.status === ENTRY_STATUS.DRAFT).length, [entries]);
  const reviewedCount = useMemo(() => entries.filter(e => e.status === ENTRY_STATUS.REVIEWED).length, [entries]);
  const approvedCount = useMemo(() => entries.filter(e => e.status === ENTRY_STATUS.APPROVED || e.status === ENTRY_STATUS.POSTED).length, [entries]);
  const excludedCount = useMemo(() => entries.filter(e => e.is_excluded).length, [entries]);
  const reviewCount = useMemo(() => entries.filter(e => e.requires_review || (e.ai_confidence != null && e.ai_confidence < 0.7)).length, [entries]);

  const fmt = useCallback((n: number | undefined) => n == null ? '-' : `¥${Number(n).toLocaleString()}`, []);

  const value: ReviewDataContextType = {
    loading, setLoading,
    entries, setEntries, multiEntryGroups, setMultiEntryGroups, expandedDocs, setExpandedDocs,
    items, setItems, currentIndex, setCurrentIndex, ci,
    accountItems, setAccountItems, taxCategories, setTaxCategories, taxRates, setTaxRates,
    suppliers, setSuppliers, itemsMaster, setItemsMaster, industries, setIndustries, clientRatios, setClientRatios,
    isMultiEntry, siblingItems,
    filteredEntries, allCount, uncheckedCount, reviewedCount, approvedCount, excludedCount, reviewCount,
    fmt,
  };

  return <ReviewDataCtx.Provider value={value}>{children}</ReviewDataCtx.Provider>;
}
