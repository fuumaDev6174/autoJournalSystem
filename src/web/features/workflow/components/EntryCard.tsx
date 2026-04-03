import type { AccountItem, TaxCategory, Supplier } from '@/types';
import type { DocumentWithEntry, TaxRateOption } from '@/web/features/workflow/pages/ReviewPage';

import MultiEntrySiblingTabs from '@/web/features/workflow/sections/MultiEntrySiblingTabs';
import OcrSummaryBadges from '@/web/features/workflow/sections/OcrSummaryBadges';
import RuleCandidatesBar from '@/web/features/workflow/sections/RuleCandidatesBar';
import OcrReferenceBox from '@/web/features/workflow/sections/OcrReferenceBox';
import SupplierField from '@/web/features/workflow/sections/SupplierField';
import CoreFieldsGrid from '@/web/features/workflow/sections/CoreFieldsGrid';
import BusinessRatioPanel from '@/web/features/workflow/sections/BusinessRatioPanel';
import BusinessToggleRow from '@/web/features/workflow/sections/BusinessToggleRow';
import NavigationBar from '@/web/features/workflow/sections/NavigationBar';
import ExcludeButton from '@/web/features/workflow/sections/ExcludeButton';
import SaveStatusBar from '@/web/features/workflow/sections/SaveStatusBar';

// Props are still accepted for backward compat but sections use context internally
interface EntryCardProps {
  ci: DocumentWithEntry;
  form: Partial<DocumentWithEntry>;
  setForm: React.Dispatch<React.SetStateAction<Partial<DocumentWithEntry>>>;
  accountItems: AccountItem[];
  taxCategories: TaxCategory[];
  taxRates: TaxRateOption[];
  suppliers: Supplier[];
  itemsMaster: Array<{ id: string; name: string; code: string | null; default_account_item_id: string | null; default_tax_category_id: string | null }>;
  industries: Array<{ id: string; name: string }>;
  businessRatio: number;
  setBusinessRatio: React.Dispatch<React.SetStateAction<number>>;
  clientRatios: Array<{ account_item_id: string; business_ratio: number }>;
  isManagerOrAdmin: boolean;
  currentIndex: number;
  itemsCount: number;
  saving: boolean;
  savedAt: string | null;
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
  handleAccountItemChange: (accountItemId: string) => void;
  handleSupplierChange: (supplierId: string) => void;
  handleItemChange: (itemId: string) => void;
  setBusiness: (isBusiness: boolean) => void;
  toggleExclude: () => void;
  goNext: () => Promise<void>;
  goPrev: () => Promise<void>;
  saveCurrentItem: (markApproved?: boolean) => Promise<void>;
  setViewMode: (mode: 'list' | 'detail') => void;
  loadAllData: () => Promise<void>;
  onCreateSupplier: (name: string) => Promise<void>;
  onCreateItem: (name: string) => Promise<void>;
  fmt: (n: number | undefined) => string;
  isMultiEntry: boolean;
  siblingItems: DocumentWithEntry[];
  onSwitchSibling: (sib: DocumentWithEntry) => void;
}

export default function EntryCard(_props: EntryCardProps) {
  // All sections read from ReviewContext internally.
  // Props are kept for backward compatibility with ReviewPage's prop passing.
  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden" style={{ minHeight: 480 }}>
      <MultiEntrySiblingTabs />
      <OcrSummaryBadges />
      <RuleCandidatesBar />
      <div className="flex-1 p-4 flex flex-col gap-3.5 overflow-y-auto">
        <OcrReferenceBox />
        <SupplierField />
        <CoreFieldsGrid />
        <BusinessRatioPanel />
        <BusinessToggleRow />
        <NavigationBar />
        <ExcludeButton />
        <SaveStatusBar />
      </div>
    </div>
  );
}
