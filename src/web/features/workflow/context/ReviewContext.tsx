import { createContext, useContext, useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useWorkflow } from '@/web/app/providers/WorkflowProvider';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/web/app/providers/AuthProvider';
import type { AccountItem, TaxCategory, Supplier } from '@/types';
import type { JournalEntryLineInput } from '@/web/shared/components/journal/CompoundJournalTable';
import { useReviewData } from './useReviewData';
import { useReviewActions } from './useReviewActions';
import { useReviewKeyboard } from './useReviewKeyboard';

// ============================================
// 型定義（以前 ReviewPage.tsx にあったもの）
// ============================================
export interface EntryRow {
  id: string;
  client_id: string;
  document_id?: string;
  entry_date: string;
  description?: string;
  status: string;
  notes?: string;
  ai_confidence?: number;
  ai_generated?: boolean;
  requires_review?: boolean;
  is_excluded?: boolean;
  lines: LineRow[];
  accountItemName?: string;
  taxCategoryName?: string;
  amount?: number;
}
export interface LineRow {
  id: string;
  line_number: number;
  debit_credit: string;
  account_item_id?: string;
  tax_category_id?: string;
  amount?: number;
  description?: string;
  account_item?: { id: string; name: string };
  tax_category?: { id: string; name: string };
}
export interface DocumentWithEntry {
  docId: string;
  fileName: string;
  storagePath: string;
  imageUrl: string | null;
  supplierName: string | null;
  documentDate: string | null;
  amount: number | null;
  taxAmount: number | null;
  entryId: string | null;
  entryDate: string;
  description: string;
  status: string;
  isExcluded: boolean;
  isBusiness: boolean;
  aiConfidence: number | null;
  lineId: string | null;
  accountItemId: string;
  taxCategoryId: string;
  lineAmount: number;
  taxRate: number | null;
  supplierId: string | null;
  itemId: string | null;
  notes: string | null;
  docClassification: {
    document_type_code?: string;
    confidence?: number;
    estimated_lines?: number;
    description?: string;
    tategaki?: string | null;
    withholding_tax_amount?: number | null;
    invoice_qualification?: string | null;
    transaction_type?: string | null;
  } | null;
  unmatchedSupplierName: string | null;
  unmatchedItemName: string | null;
  matchedRuleBusinessRatio: number | null;
  ruleCandidates: Array<{ rule_id: string; rule_name: string; scope: string; priority: number; account_item_id: string }>;
}
export interface TaxRateOption { id: string; rate: number; name: string; is_current: boolean; }

export interface MultiEntryGroup {
  documentId: string;
  fileName: string;
  storagePath: string;
  entries: EntryRow[];
  totalAmount: number;
  uncheckedCount: number;
  isExpanded: boolean;
}

export type ViewMode = 'list' | 'detail';
export type TabFilter = 'all' | 'unchecked' | 'reviewed' | 'excluded';

export type ItemMaster = { id: string; name: string; code: string | null; default_account_item_id: string | null; default_tax_category_id: string | null };

// ============================================
// Context 型
// ============================================
export interface ReviewContextType {
  // Workflow
  currentWorkflow: ReturnType<typeof useWorkflow>['currentWorkflow'];
  updateWorkflowData: ReturnType<typeof useWorkflow>['updateWorkflowData'];

  // Auth
  user: ReturnType<typeof useAuth>['user'];
  isManagerOrAdmin: boolean;

  // View state
  viewMode: ViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  activeTab: TabFilter;
  setActiveTab: React.Dispatch<React.SetStateAction<TabFilter>>;
  loading: boolean;

  // List data
  entries: EntryRow[];
  setEntries: React.Dispatch<React.SetStateAction<EntryRow[]>>;
  multiEntryGroups: MultiEntryGroup[];
  setMultiEntryGroups: React.Dispatch<React.SetStateAction<MultiEntryGroup[]>>;
  expandedDocs: Set<string>;
  setExpandedDocs: React.Dispatch<React.SetStateAction<Set<string>>>;

  // Detail data
  items: DocumentWithEntry[];
  setItems: React.Dispatch<React.SetStateAction<DocumentWithEntry[]>>;
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  ci: DocumentWithEntry | undefined;

  // Form
  form: Partial<DocumentWithEntry>;
  setForm: React.Dispatch<React.SetStateAction<Partial<DocumentWithEntry>>>;
  compoundLines: JournalEntryLineInput[];
  setCompoundLines: React.Dispatch<React.SetStateAction<JournalEntryLineInput[]>>;
  aiOriginalForm: Partial<DocumentWithEntry>;
  setAiOriginalForm: React.Dispatch<React.SetStateAction<Partial<DocumentWithEntry>>>;

  // Master data
  accountItems: AccountItem[];
  taxCategories: TaxCategory[];
  taxRates: TaxRateOption[];
  suppliers: Supplier[];
  itemsMaster: ItemMaster[];
  industries: Array<{ id: string; name: string }>;
  clientRatios: Array<{ account_item_id: string; business_ratio: number }>;

  // UI state
  saving: boolean;
  savedAt: string | null;
  businessRatio: number;
  setBusinessRatio: React.Dispatch<React.SetStateAction<number>>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  rotation: number;
  setRotation: React.Dispatch<React.SetStateAction<number>>;
  addRule: boolean;
  setAddRule: React.Dispatch<React.SetStateAction<boolean>>;
  ruleScope: 'shared' | 'industry' | 'client';
  setRuleScope: React.Dispatch<React.SetStateAction<'shared' | 'industry' | 'client'>>;
  ruleIndustryId: string;
  setRuleIndustryId: React.Dispatch<React.SetStateAction<string>>;
  ruleSuggestion: string;
  setRuleSuggestion: React.Dispatch<React.SetStateAction<string>>;
  supplierText: string;
  setSupplierText: React.Dispatch<React.SetStateAction<string>>;
  itemText: string;
  setItemText: React.Dispatch<React.SetStateAction<string>>;
  selectedRowRef: React.RefObject<HTMLTableRowElement | null>;

  // Multi-entry
  isMultiEntry: boolean;
  siblingItems: DocumentWithEntry[];

  // Actions
  loadAllData: () => Promise<void>;
  saveCurrentItem: (markApproved?: boolean) => Promise<void>;
  goNext: () => Promise<void>;
  goPrev: () => Promise<void>;
  openDetail: (entryId: string) => void;
  openDetailFromTop: () => void;
  handleAccountItemChange: (accountItemId: string) => void;
  handleSupplierChange: (supplierId: string) => void;
  handleItemChange: (itemId: string) => void;
  setBusiness: (isBusiness: boolean) => void;
  toggleExclude: () => void;
  handleRevert: (entryId: string, currentStatus: string) => Promise<void>;
  handleApproveFromList: (entryId: string) => Promise<void>;
  toggleMultiEntryGroup: (docId: string) => void;
  handleBulkReviewGroup: (docId: string) => Promise<void>;
  onCreateSupplier: (name: string) => Promise<void>;
  onCreateItem: (name: string) => Promise<void>;
  handleBeforeNext: () => Promise<boolean>;
  onSwitchSibling: (sib: DocumentWithEntry) => void;
  fmt: (n: number | undefined) => string;

  // Computed
  filteredEntries: EntryRow[];
  allCount: number;
  uncheckedCount: number;
  reviewedCount: number;
  approvedCount: number;
  excludedCount: number;
  reviewCount: number;
}

const ReviewContext = createContext<ReviewContextType | null>(null);

export function useReview(): ReviewContextType {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error('useReview must be used within ReviewProvider');
  return ctx;
}

// ============================================
// Provider
// ============================================
export function ReviewProvider({ children }: { children: React.ReactNode }) {
  const { currentWorkflow, updateWorkflowData } = useWorkflow();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'excluded' ? 'excluded' : 'all';
  const { user, userProfile } = useAuth();
  const userRole = userProfile?.role || 'viewer';
  const isManagerOrAdmin = userRole === 'admin' || userRole === 'manager';

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeTab, setActiveTab] = useState<TabFilter>(initialTab);
  const [loading, setLoading] = useState(true);

  // List state
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [multiEntryGroups, setMultiEntryGroups] = useState<MultiEntryGroup[]>([]);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  // Detail state
  const [items, setItems] = useState<DocumentWithEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [form, setForm] = useState<Partial<DocumentWithEntry>>({});
  const [compoundLines, setCompoundLines] = useState<JournalEntryLineInput[]>([]);
  const [aiOriginalForm, setAiOriginalForm] = useState<Partial<DocumentWithEntry>>({});

  // Master data
  const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [itemsMaster, setItemsMaster] = useState<ItemMaster[]>([]);
  const [industries, setIndustries] = useState<Array<{ id: string; name: string }>>([]);
  const [clientRatios, setClientRatios] = useState<Array<{ account_item_id: string; business_ratio: number }>>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [businessRatio, setBusinessRatio] = useState(100);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [addRule, setAddRule] = useState(false);
  const [ruleScope, setRuleScope] = useState<'shared' | 'industry' | 'client'>('shared');
  const [ruleIndustryId, setRuleIndustryId] = useState('');
  const [ruleSuggestion, setRuleSuggestion] = useState('');
  const [supplierText, setSupplierText] = useState('');
  const [itemText, setItemText] = useState('');
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  // Computed
  const ci = items[currentIndex];
  const multiGroup = ci ? multiEntryGroups.find(g => g.documentId === ci.docId) : null;
  const isMultiEntry = !!(multiGroup && multiGroup.entries.length > 1);
  const siblingItems = isMultiEntry ? items.filter(it => it.docId === ci.docId) : [];

  const fmt = useCallback((n: number | undefined) => n == null ? '-' : `¥${Number(n).toLocaleString()}`, []);

  const filteredEntries = useMemo(() => {
    if (activeTab === 'unchecked') return entries.filter(e => e.status === 'draft');
    if (activeTab === 'excluded') return entries.filter(e => e.is_excluded);
    return entries;
  }, [entries, activeTab]);

  const allCount = entries.length;
  const uncheckedCount = useMemo(() => entries.filter(e => e.status === 'draft').length, [entries]);
  const reviewedCount = useMemo(() => entries.filter(e => e.status === 'reviewed').length, [entries]);
  const approvedCount = useMemo(() => entries.filter(e => e.status === 'approved' || e.status === 'posted').length, [entries]);
  const excludedCount = useMemo(() => entries.filter(e => e.is_excluded).length, [entries]);
  const reviewCount = useMemo(() => entries.filter(e => e.requires_review || (e.ai_confidence != null && e.ai_confidence < 0.7)).length, [entries]);

  // Data loading hook
  const { loadAllData } = useReviewData({
    currentWorkflow, setLoading, setEntries, setMultiEntryGroups, setItems, setCurrentIndex, setForm,
    setAccountItems, setTaxCategories, setTaxRates, setSuppliers, setItemsMaster, setIndustries, setClientRatios,
  });

  // Action handlers hook
  const actions = useReviewActions({
    currentWorkflow, updateWorkflowData, user, isManagerOrAdmin,
    items, setItems, currentIndex, setCurrentIndex, form, setForm, compoundLines,
    entries, setEntries, multiEntryGroups,
    accountItems, taxCategories, taxRates, suppliers, itemsMaster, clientRatios,
    businessRatio, setBusinessRatio, saving: false, setSaving, setSavedAt,
    addRule, setAddRule, ruleScope, ruleIndustryId, ruleSuggestion, setRuleSuggestion,
    setSupplierText, setItemText,
    aiOriginalForm, setAiOriginalForm, setRotation,
    setViewMode, setRuleIndustryId, setExpandedDocs,
    loadAllData,
  });

  // Keyboard shortcut hook
  useReviewKeyboard({
    viewMode, form, currentIndex, itemsLength: items.length,
    setBusiness: actions.setBusiness, setAddRule, toggleExclude: actions.toggleExclude,
    goNext: actions.goNext, goPrev: actions.goPrev,
    saveCurrentItem: actions.saveCurrentItem, setViewMode, loadAllData,
    openDetailFromTop: actions.openDetailFromTop,
    setZoom,
  });

  // Initial load
  useEffect(() => { if (currentWorkflow) loadAllData(); }, [currentWorkflow]);

  // Scroll to selected row in mini table
  useEffect(() => {
    if (viewMode === 'detail' && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentIndex, viewMode]);

  const onSwitchSibling = useCallback((sib: DocumentWithEntry) => {
    const i = items.indexOf(sib);
    setCurrentIndex(i);
    setForm({ ...sib });
    setAiOriginalForm({ ...sib });
    setSupplierText(sib.unmatchedSupplierName || '');
    setItemText(sib.unmatchedItemName || '');
  }, [items]);

  const value: ReviewContextType = {
    currentWorkflow, updateWorkflowData, user, isManagerOrAdmin,
    viewMode, setViewMode, activeTab, setActiveTab, loading,
    entries, setEntries, multiEntryGroups, setMultiEntryGroups, expandedDocs, setExpandedDocs,
    items, setItems, currentIndex, setCurrentIndex, ci,
    form, setForm, compoundLines, setCompoundLines, aiOriginalForm, setAiOriginalForm,
    accountItems, taxCategories, taxRates, suppliers, itemsMaster, industries, clientRatios,
    saving, savedAt, businessRatio, setBusinessRatio,
    zoom, setZoom, rotation, setRotation,
    addRule, setAddRule, ruleScope, setRuleScope, ruleIndustryId, setRuleIndustryId,
    ruleSuggestion, setRuleSuggestion, supplierText, setSupplierText, itemText, setItemText,
    selectedRowRef,
    isMultiEntry, siblingItems,
    loadAllData, fmt,
    filteredEntries, allCount, uncheckedCount, reviewedCount, approvedCount, excludedCount, reviewCount,
    onSwitchSibling,
    ...actions,
  };

  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}
