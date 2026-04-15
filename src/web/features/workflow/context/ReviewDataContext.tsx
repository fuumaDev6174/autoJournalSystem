// レビューデータコンテキスト
import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { AccountItem, TaxCategory, Supplier } from '@/types';
import type {
  EntryRow, DocumentWithEntry, TaxRateOption, MultiEntryGroup, ItemMaster, TabFilter,
} from './ReviewContext';
import { ENTRY_STATUS } from '@/web/shared/constants/statuses';
import type { DocCategoryGroup, DocCategory } from '../constants/docCategoryMap';
import { DOC_TYPE_TO_CATEGORY, matchesCategoryFilter } from '../constants/docCategoryMap';

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

  // document_id → document_type_code 逆引き
  docTypeCodeMap: Map<string, string>;

  // Computed counts (require activeTab from view context, passed as param)
  filteredEntries: (activeTab: TabFilter, categoryGroup?: DocCategoryGroup, subCategory?: DocCategory | null) => EntryRow[];
  allCount: number;
  uncheckedCount: number;
  reviewedCount: number;
  approvedCount: number;
  excludedCount: number;
  reviewCount: number;

  // カテゴリ別件数
  categoryCounts: Record<DocCategoryGroup | DocCategory, number>;

  // Client info
  clientName: string;
  setClientName: React.Dispatch<React.SetStateAction<string>>;

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
  const [clientName, setClientName] = useState('');

  // Computed
  const ci = items[currentIndex];
  const multiGroup = ci ? multiEntryGroups.find(g => g.documentId === ci.docId) : null;
  const isMultiEntry = !!(multiGroup && multiGroup.entries.length > 1);
  const siblingItems = isMultiEntry ? items.filter(it => it.docId === ci.docId) : [];

  // document_id → document_type_code 逆引きマップ
  const docTypeCodeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) {
      const code = it.docClassification?.document_type_code;
      if (it.docId && code) m.set(it.docId, code);
    }
    return m;
  }, [items]);

  const filteredEntries = useCallback((activeTab: TabFilter, categoryGroup: DocCategoryGroup = 'all', subCategory: DocCategory | null = null) => {
    let result = entries;
    if (activeTab === 'unchecked') result = result.filter(e => e.status === ENTRY_STATUS.DRAFT);
    else if (activeTab === 'reviewed') result = result.filter(e => e.status === ENTRY_STATUS.REVIEWED || e.status === ENTRY_STATUS.APPROVED || e.status === ENTRY_STATUS.POSTED);
    else if (activeTab === 'excluded') result = result.filter(e => e.is_excluded);

    if (categoryGroup !== 'all') {
      result = result.filter(e => {
        const code = e.document_id ? docTypeCodeMap.get(e.document_id) : undefined;
        return matchesCategoryFilter(code, categoryGroup, subCategory);
      });
    }
    return result;
  }, [entries, docTypeCodeMap]);

  const allCount = entries.length;
  const uncheckedCount = useMemo(() => entries.filter(e => e.status === ENTRY_STATUS.DRAFT).length, [entries]);
  const reviewedCount = useMemo(() => entries.filter(e => e.status === ENTRY_STATUS.REVIEWED).length, [entries]);
  const approvedCount = useMemo(() => entries.filter(e => e.status === ENTRY_STATUS.APPROVED || e.status === ENTRY_STATUS.POSTED).length, [entries]);
  const excludedCount = useMemo(() => entries.filter(e => e.is_excluded).length, [entries]);
  const reviewCount = useMemo(() => entries.filter(e => e.requires_review || (e.ai_confidence != null && e.ai_confidence < 0.7)).length, [entries]);

  // カテゴリ別件数
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: entries.length, journal: 0, deduction: 0, metadata: 0, archive: 0,
      journal_income: 0, journal_expense: 0, journal_compound: 0, journal_asset: 0,
    };
    for (const e of entries) {
      const code = e.document_id ? docTypeCodeMap.get(e.document_id) : undefined;
      const cat = code ? DOC_TYPE_TO_CATEGORY[code] : undefined;
      if (!cat) continue;
      if (cat in counts) counts[cat]++;
      if (cat.startsWith('journal_')) counts['journal']++;
      else if (cat === 'deduction') counts['deduction']++;
      else if (cat === 'metadata') counts['metadata']++;
      else if (cat === 'archive') counts['archive']++;
    }
    return counts as Record<DocCategoryGroup | DocCategory, number>;
  }, [entries, docTypeCodeMap]);

  const fmt = useCallback((n: number | undefined) => n == null ? '-' : `¥${Number(n).toLocaleString()}`, []);

  const value: ReviewDataContextType = {
    loading, setLoading,
    entries, setEntries, multiEntryGroups, setMultiEntryGroups, expandedDocs, setExpandedDocs,
    items, setItems, currentIndex, setCurrentIndex, ci,
    accountItems, setAccountItems, taxCategories, setTaxCategories, taxRates, setTaxRates,
    suppliers, setSuppliers, itemsMaster, setItemsMaster, industries, setIndustries, clientRatios, setClientRatios,
    isMultiEntry, siblingItems, docTypeCodeMap, clientName, setClientName,
    filteredEntries, allCount, uncheckedCount, reviewedCount, approvedCount, excludedCount, reviewCount,
    categoryCounts, fmt,
  };

  return <ReviewDataCtx.Provider value={value}>{children}</ReviewDataCtx.Provider>;
}
