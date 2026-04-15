// レビューコンテキスト
import { useEffect, useCallback, useMemo } from 'react';
import { useWorkflow } from '@/web/app/providers/WorkflowProvider';
import { useAuth } from '@/web/app/providers/AuthProvider';
import type { AccountItem, TaxCategory, Supplier } from '@/types';
import type { JournalEntryLineInput } from '@/web/shared/components/journal/CompoundJournalTable';

import { ReviewViewProvider, useReviewView } from './ReviewViewContext';
import { ReviewFormProvider, useReviewForm } from './ReviewFormContext';
import { ReviewDataProvider, useReviewData as useReviewDataCtx } from './ReviewDataContext';
import { useReviewDataLoader } from './useReviewData';
import { useReviewActions } from './useReviewActions';
import { useReviewKeyboard } from './useReviewKeyboard';

// Re-export types
export type { JournalEntryLineInput };

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
    // extractor の全抽出データ（OCRPage で doc_classification に統合保存される）
    extracted_supplier?: string | null;
    extracted_amount?: number | null;
    extracted_tax_amount?: number | null;
    extracted_date?: string | null;
    extracted_items?: Array<{ name: string; quantity?: number; unit_price?: number; amount: number; tax_rate?: number }> | null;
    extracted_payment_method?: string | null;
    extracted_invoice_number?: string | null;
    extracted_tategaki?: string | null;
    withholding_tax_amount?: number | null;
    invoice_qualification?: string | null;
    extracted_addressee?: string | null;
    extracted_transaction_type?: string | null;
    extracted_transfer_fee_bearer?: string | null;
    confidence_score?: number | null;
    life_insurance_details?: Record<string, { certified_amount: number; declared_amount: number }> | null;
    annual_amount?: number | null;
    donation_amount?: number | null;
    earthquake_premium?: number | null;
    total_medical_expense?: number | null;
    loan_balance?: number | null;
    payroll_details?: Record<string, number> | null;
    sales_details?: Record<string, number> | null;
    acquisition_cost?: number | null;
    useful_life?: number | null;
    carryover_loss?: number | null;
    fiscal_year?: string | null;
    [key: string]: unknown;
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

export interface ReviewContextType {
  currentWorkflow: ReturnType<typeof useWorkflow>['currentWorkflow'];
  updateWorkflowData: ReturnType<typeof useWorkflow>['updateWorkflowData'];
  user: ReturnType<typeof useAuth>['user'];
  isManagerOrAdmin: boolean;

  viewMode: ViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  activeTab: TabFilter;
  setActiveTab: React.Dispatch<React.SetStateAction<TabFilter>>;
  activeCategoryTab: import('../constants/docCategoryMap').DocCategoryGroup;
  setActiveCategoryTab: React.Dispatch<React.SetStateAction<import('../constants/docCategoryMap').DocCategoryGroup>>;
  activeSubCategory: import('../constants/docCategoryMap').DocCategory | null;
  setActiveSubCategory: React.Dispatch<React.SetStateAction<import('../constants/docCategoryMap').DocCategory | null>>;
  loading: boolean;

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

  form: Partial<DocumentWithEntry>;
  setForm: React.Dispatch<React.SetStateAction<Partial<DocumentWithEntry>>>;
  compoundLines: JournalEntryLineInput[];
  setCompoundLines: React.Dispatch<React.SetStateAction<JournalEntryLineInput[]>>;
  aiOriginalForm: Partial<DocumentWithEntry>;
  setAiOriginalForm: React.Dispatch<React.SetStateAction<Partial<DocumentWithEntry>>>;

  accountItems: AccountItem[];
  taxCategories: TaxCategory[];
  taxRates: TaxRateOption[];
  suppliers: Supplier[];
  itemsMaster: ItemMaster[];
  industries: Array<{ id: string; name: string }>;
  clientRatios: Array<{ account_item_id: string; business_ratio: number }>;

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

  isMultiEntry: boolean;
  siblingItems: DocumentWithEntry[];

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

  filteredEntries: EntryRow[];
  allCount: number;
  uncheckedCount: number;
  reviewedCount: number;
  approvedCount: number;
  excludedCount: number;
  reviewCount: number;
  docTypeCodeMap: Map<string, string>;
  categoryCounts: Record<string, number>;
  clientName: string;
}

export function useReview(): ReviewContextType {
  const view = useReviewView();
  const form = useReviewForm();
  const data = useReviewDataCtx();
  const { currentWorkflow, updateWorkflowData } = useWorkflow();
  const { user, userProfile } = useAuth();
  const userRole = userProfile?.role || 'viewer';
  const isManagerOrAdmin = userRole === 'admin' || userRole === 'manager';

  const { loadAllData } = useReviewDataLoader({
    currentWorkflow,
    setLoading: data.setLoading,
    setEntries: data.setEntries,
    setMultiEntryGroups: data.setMultiEntryGroups,
    setItems: data.setItems,
    setCurrentIndex: data.setCurrentIndex,
    setForm: form.setForm,
    setAccountItems: data.setAccountItems,
    setTaxCategories: data.setTaxCategories,
    setTaxRates: data.setTaxRates,
    setSuppliers: data.setSuppliers,
    setItemsMaster: data.setItemsMaster,
    setIndustries: data.setIndustries,
    setClientRatios: data.setClientRatios,
    setClientName: data.setClientName,
  });

  const actions = useReviewActions({
    currentWorkflow, updateWorkflowData, user, isManagerOrAdmin,
    items: data.items, setItems: data.setItems, currentIndex: data.currentIndex, setCurrentIndex: data.setCurrentIndex,
    form: form.form, setForm: form.setForm, compoundLines: form.compoundLines,
    entries: data.entries, setEntries: data.setEntries, multiEntryGroups: data.multiEntryGroups,
    accountItems: data.accountItems, taxCategories: data.taxCategories, taxRates: data.taxRates,
    suppliers: data.suppliers, itemsMaster: data.itemsMaster, clientRatios: data.clientRatios,
    businessRatio: form.businessRatio, setBusinessRatio: form.setBusinessRatio,
    saving: form.saving, setSaving: form.setSaving, setSavedAt: form.setSavedAt,
    addRule: form.addRule, setAddRule: form.setAddRule, ruleScope: form.ruleScope,
    ruleIndustryId: form.ruleIndustryId, ruleSuggestion: form.ruleSuggestion, setRuleSuggestion: form.setRuleSuggestion,
    setSupplierText: form.setSupplierText, setItemText: form.setItemText,
    aiOriginalForm: form.aiOriginalForm, setAiOriginalForm: form.setAiOriginalForm,
    setRotation: view.setRotation, setViewMode: view.setViewMode,
    setRuleIndustryId: form.setRuleIndustryId, setExpandedDocs: data.setExpandedDocs,
    loadAllData,
  });

  const onSwitchSibling = useCallback((sib: DocumentWithEntry) => {
    const i = data.items.indexOf(sib);
    data.setCurrentIndex(i);
    form.setForm({ ...sib });
    form.setAiOriginalForm({ ...sib });
    form.setSupplierText(sib.unmatchedSupplierName || '');
    form.setItemText(sib.unmatchedItemName || '');
  }, [data.items]);

  const filteredEntries = useMemo(
    () => data.filteredEntries(view.activeTab, view.activeCategoryTab, view.activeSubCategory),
    [data.filteredEntries, view.activeTab, view.activeCategoryTab, view.activeSubCategory],
  );

  return {
    currentWorkflow, updateWorkflowData, user, isManagerOrAdmin,
    viewMode: view.viewMode, setViewMode: view.setViewMode,
    activeTab: view.activeTab, setActiveTab: view.setActiveTab,
    activeCategoryTab: view.activeCategoryTab, setActiveCategoryTab: view.setActiveCategoryTab,
    activeSubCategory: view.activeSubCategory, setActiveSubCategory: view.setActiveSubCategory,
    loading: data.loading,
    entries: data.entries, setEntries: data.setEntries,
    multiEntryGroups: data.multiEntryGroups, setMultiEntryGroups: data.setMultiEntryGroups,
    expandedDocs: data.expandedDocs, setExpandedDocs: data.setExpandedDocs,
    items: data.items, setItems: data.setItems,
    currentIndex: data.currentIndex, setCurrentIndex: data.setCurrentIndex, ci: data.ci,
    form: form.form, setForm: form.setForm,
    compoundLines: form.compoundLines, setCompoundLines: form.setCompoundLines,
    aiOriginalForm: form.aiOriginalForm, setAiOriginalForm: form.setAiOriginalForm,
    accountItems: data.accountItems, taxCategories: data.taxCategories, taxRates: data.taxRates,
    suppliers: data.suppliers, itemsMaster: data.itemsMaster, industries: data.industries, clientRatios: data.clientRatios,
    saving: form.saving, savedAt: form.savedAt,
    businessRatio: form.businessRatio, setBusinessRatio: form.setBusinessRatio,
    zoom: view.zoom, setZoom: view.setZoom,
    rotation: view.rotation, setRotation: view.setRotation,
    addRule: form.addRule, setAddRule: form.setAddRule,
    ruleScope: form.ruleScope, setRuleScope: form.setRuleScope,
    ruleIndustryId: form.ruleIndustryId, setRuleIndustryId: form.setRuleIndustryId,
    ruleSuggestion: form.ruleSuggestion, setRuleSuggestion: form.setRuleSuggestion,
    supplierText: form.supplierText, setSupplierText: form.setSupplierText,
    itemText: form.itemText, setItemText: form.setItemText,
    selectedRowRef: view.selectedRowRef,
    isMultiEntry: data.isMultiEntry, siblingItems: data.siblingItems,
    loadAllData, fmt: data.fmt, clientName: data.clientName,
    filteredEntries, docTypeCodeMap: data.docTypeCodeMap, categoryCounts: data.categoryCounts,
    allCount: data.allCount, uncheckedCount: data.uncheckedCount,
    reviewedCount: data.reviewedCount, approvedCount: data.approvedCount,
    excludedCount: data.excludedCount, reviewCount: data.reviewCount,
    onSwitchSibling,
    ...actions,
  };
}

function ReviewProviderInner({ children }: { children: React.ReactNode }) {
  const { currentWorkflow, updateWorkflowData } = useWorkflow();
  const view = useReviewView();
  const formCtx = useReviewForm();
  const dataCtx = useReviewDataCtx();

  const { loadAllData } = useReviewDataLoader({
    currentWorkflow,
    setLoading: dataCtx.setLoading,
    setEntries: dataCtx.setEntries,
    setMultiEntryGroups: dataCtx.setMultiEntryGroups,
    setItems: dataCtx.setItems,
    setCurrentIndex: dataCtx.setCurrentIndex,
    setForm: formCtx.setForm,
    setAccountItems: dataCtx.setAccountItems,
    setTaxCategories: dataCtx.setTaxCategories,
    setTaxRates: dataCtx.setTaxRates,
    setSuppliers: dataCtx.setSuppliers,
    setItemsMaster: dataCtx.setItemsMaster,
    setIndustries: dataCtx.setIndustries,
    setClientRatios: dataCtx.setClientRatios,
    setClientName: dataCtx.setClientName,
  });

  const { user, userProfile } = useAuth();
  const userRole = userProfile?.role || 'viewer';
  const isManagerOrAdmin = userRole === 'admin' || userRole === 'manager';

  const actions = useReviewActions({
    currentWorkflow, updateWorkflowData, user, isManagerOrAdmin,
    items: dataCtx.items, setItems: dataCtx.setItems, currentIndex: dataCtx.currentIndex, setCurrentIndex: dataCtx.setCurrentIndex,
    form: formCtx.form, setForm: formCtx.setForm, compoundLines: formCtx.compoundLines,
    entries: dataCtx.entries, setEntries: dataCtx.setEntries, multiEntryGroups: dataCtx.multiEntryGroups,
    accountItems: dataCtx.accountItems, taxCategories: dataCtx.taxCategories, taxRates: dataCtx.taxRates,
    suppliers: dataCtx.suppliers, itemsMaster: dataCtx.itemsMaster, clientRatios: dataCtx.clientRatios,
    businessRatio: formCtx.businessRatio, setBusinessRatio: formCtx.setBusinessRatio,
    saving: formCtx.saving, setSaving: formCtx.setSaving, setSavedAt: formCtx.setSavedAt,
    addRule: formCtx.addRule, setAddRule: formCtx.setAddRule, ruleScope: formCtx.ruleScope,
    ruleIndustryId: formCtx.ruleIndustryId, ruleSuggestion: formCtx.ruleSuggestion, setRuleSuggestion: formCtx.setRuleSuggestion,
    setSupplierText: formCtx.setSupplierText, setItemText: formCtx.setItemText,
    aiOriginalForm: formCtx.aiOriginalForm, setAiOriginalForm: formCtx.setAiOriginalForm,
    setRotation: view.setRotation, setViewMode: view.setViewMode,
    setRuleIndustryId: formCtx.setRuleIndustryId, setExpandedDocs: dataCtx.setExpandedDocs,
    loadAllData,
  });

  // Keyboard shortcuts
  useReviewKeyboard({
    viewMode: view.viewMode, form: formCtx.form, currentIndex: dataCtx.currentIndex, itemsLength: dataCtx.items.length,
    setBusiness: actions.setBusiness, setAddRule: formCtx.setAddRule, toggleExclude: actions.toggleExclude,
    goNext: actions.goNext, goPrev: actions.goPrev,
    saveCurrentItem: actions.saveCurrentItem, setViewMode: view.setViewMode, loadAllData,
    openDetailFromTop: actions.openDetailFromTop,
    setZoom: view.setZoom,
  });

  // Initial load
  useEffect(() => { if (currentWorkflow) loadAllData(); }, [currentWorkflow]);

  // Scroll to selected row
  useEffect(() => {
    if (view.viewMode === 'detail' && view.selectedRowRef.current) {
      view.selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [dataCtx.currentIndex, view.viewMode]);

  return <>{children}</>;
}

export function ReviewProvider({ children }: { children: React.ReactNode }) {
  return (
    <ReviewDataProvider>
      <ReviewFormProvider>
        <ReviewViewProvider>
          <ReviewProviderInner>{children}</ReviewProviderInner>
        </ReviewViewProvider>
      </ReviewFormProvider>
    </ReviewDataProvider>
  );
}
