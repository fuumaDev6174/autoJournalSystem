import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Ban, AlertCircle, Loader, CheckCircle, Eye, Undo2, Clock, StickyNote
} from 'lucide-react';
import { useWorkflow } from '@/web/app/providers/WorkflowProvider';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/adapters/supabase/supabase.client';
import {
  journalEntriesApi, documentsApi, clientsApi, accountItemsApi, taxCategoriesApi,
  taxRatesApi, suppliersApi, itemsApi, rulesApi, storageApi, clientAccountRatiosApi,
  journalCorrectionsApi, industriesApi, clientIndustriesApi,
} from '@/web/shared/lib/api/backend.api';
import WorkflowHeader from '@/web/features/workflow/components/WorkflowHeader';
import { useAuth } from '@/web/app/providers/AuthProvider';
import type { AccountItem, TaxCategory, Supplier } from '@/types';
import { normalizeJapanese } from '@/shared/utils/normalize-japanese';

import ImageViewer from '@/web/features/workflow/components/ImageViewer';
import EntryCard from '@/web/features/workflow/components/EntryCard';
import MultiEntryPanel from '@/web/features/workflow/components/MultiEntryPanel';

// ============================================
// 型定義（子コンポーネントからも参照）
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

type ViewMode = 'list' | 'detail';
type TabFilter = 'all' | 'unchecked' | 'reviewed' | 'excluded';

// ============================================
// メインコンポーネント
// ============================================
export default function ReviewPage() {
  const { currentWorkflow, updateWorkflowData } = useWorkflow();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'excluded' ? 'excluded' : 'all';

  // 共通 state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeTab, setActiveTab] = useState<TabFilter>(initialTab);
  const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [industries, setIndustries] = useState<Array<{ id: string; name: string }>>([]);
  const [itemsMaster, setItemsMaster] = useState<Array<{ id: string; name: string; code: string | null; default_account_item_id: string | null; default_tax_category_id: string | null }>>([]);
  const [businessRatio, setBusinessRatio] = useState(100);
  const { userProfile } = useAuth();
  const userRole = userProfile?.role || 'viewer';
  const isManagerOrAdmin = userRole === 'admin' || userRole === 'manager';
  const [clientRatios, setClientRatios] = useState<Array<{ account_item_id: string; business_ratio: number }>>([]);
  const [loading, setLoading] = useState(true);

  // 一覧 state
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [multiEntryGroups, setMultiEntryGroups] = useState<MultiEntryGroup[]>([]);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  // 個別チェック state
  const [items, setItems] = useState<DocumentWithEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [form, setForm] = useState<Partial<DocumentWithEntry>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [addRule, setAddRule] = useState(false);
  const [ruleScope, setRuleScope] = useState<'shared' | 'industry' | 'client'>('shared');
  const [ruleIndustryId, setRuleIndustryId] = useState('');
  const [ruleSuggestion, setRuleSuggestion] = useState('');
  const [supplierText, setSupplierText] = useState('');
  const [itemText, setItemText] = useState('');
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const [aiOriginalForm, setAiOriginalForm] = useState<Partial<DocumentWithEntry>>({});

  // ============================================
  // データ読み込み
  // ============================================
  useEffect(() => { if (currentWorkflow) loadAllData(); }, [currentWorkflow]);

  const loadAllData = async () => {
    if (!currentWorkflow) return;
    setLoading(true);
    const clientId = currentWorkflow.clientId;
    const { data: docs } = await documentsApi.getAll({ client_id: clientId, workflow_id: currentWorkflow.id });

    if (!docs || docs.length === 0) { setEntries([]); setItems([]); setLoading(false); return; }
    const docIds = docs.map((d: any) => d.id);

    const { data: allEntriesData } = await journalEntriesApi.getAll({ client_id: clientId, status: 'draft,reviewed,approved,posted,amended' });
    const entriesData = (allEntriesData || []).filter((e: any) => docIds.includes(e.document_id));

    const mappedEntries: EntryRow[] = docIds.flatMap(docId => {
      const docEntries = (entriesData || []).filter((e: any) => e.document_id === docId);
      if (docEntries.length === 0) return [];
      return docEntries.map((entry: any) => {
        const dl = entry.journal_entry_lines?.find((l: any) => l.debit_credit === 'debit') || entry.journal_entry_lines?.[0];
        return { ...entry, lines: entry.journal_entry_lines || [],
          accountItemName: (() => { const ai = dl?.account_item as any; return Array.isArray(ai) ? ai[0]?.name : ai?.name; })(),
          taxCategoryName: (() => { const tc = dl?.tax_category as any; return Array.isArray(tc) ? tc[0]?.name : tc?.name; })(),
          amount: dl?.amount };
      });
    }) as unknown as EntryRow[];
    mappedEntries.sort((a, b) => (a.entry_date || '').localeCompare(b.entry_date || '') || (a.description || '').localeCompare(b.description || ''));
    setEntries(mappedEntries);

    // multi_entry groups
    const docEntryMap = new Map<string, EntryRow[]>();
    for (const entry of mappedEntries) {
      if (!entry.document_id) continue;
      const existing = docEntryMap.get(entry.document_id) || [];
      existing.push(entry);
      docEntryMap.set(entry.document_id, existing);
    }
    const groups: MultiEntryGroup[] = [];
    for (const [docId, docEntries] of docEntryMap) {
      if (docEntries.length <= 1) continue;
      const doc = docs.find((d: any) => d.id === docId);
      groups.push({
        documentId: docId,
        fileName: doc?.original_file_name || doc?.file_name || '',
        storagePath: doc?.storage_path || doc?.file_path || '',
        entries: docEntries,
        totalAmount: docEntries.reduce((sum, e) => sum + (e.amount || 0), 0),
        uncheckedCount: docEntries.filter(e => e.status === 'draft').length,
        isExpanded: false,
      });
    }
    setMultiEntryGroups(groups);

    // 個別用
    const { data: allEntriesForDetail } = await journalEntriesApi.getAll({ client_id: clientId, status: 'draft,approved,posted' });
    const entriesForDetail = (allEntriesForDetail || []).filter((e: any) => docIds.includes(e.document_id));

    const merged: DocumentWithEntry[] = await Promise.all(docs.map(async (doc: any) => {
      const path = doc.storage_path || doc.file_path || '';
      let imageUrl: string | null = null;
      if (path) { const { data: u } = await storageApi.getSignedUrl(path); imageUrl = u?.signedUrl || null; }
      const entry = entriesForDetail?.find((e: any) => e.document_id === doc.id);
      const dl = entry?.journal_entry_lines?.find((l: any) => l.debit_credit === 'debit') || entry?.journal_entry_lines?.[0];
      return {
        docId: doc.id, fileName: doc.original_file_name || doc.file_name, storagePath: path, imageUrl,
        supplierName: doc.supplier_name, documentDate: doc.document_date, amount: doc.amount, taxAmount: doc.tax_amount,
        entryId: entry?.id || null, entryDate: entry?.entry_date || doc.document_date || new Date().toISOString().split('T')[0],
        description: entry?.description || doc.supplier_name || '', status: entry?.status || 'draft',
        isExcluded: entry?.is_excluded || false, isBusiness: !entry?.is_excluded,
        aiConfidence: entry?.ai_confidence || null, lineId: dl?.id || null,
        accountItemId: dl?.account_item_id || '', taxCategoryId: dl?.tax_category_id || '',
        lineAmount: dl?.amount || doc.amount || 0, taxRate: dl?.tax_rate || null,
        supplierId: dl?.supplier_id || null, itemId: dl?.item_id || null,
        notes: entry?.notes || null,
        docClassification: doc.doc_classification || null,
        unmatchedSupplierName: null, unmatchedItemName: null, matchedRuleBusinessRatio: null, ruleCandidates: [],
      } as DocumentWithEntry;
    }));
    const merged_temp = merged;

    // マスタ
    const [aRes, tRes] = await Promise.all([accountItemsApi.getAll(), taxCategoriesApi.getAll()]);
    if (aRes.data) setAccountItems(aRes.data);
    if (tRes.data) setTaxCategories(tRes.data);
    const { data: rates } = await taxRatesApi.getAll();
    if (rates) setTaxRates(rates.map((r: any) => ({ id: r.id, rate: Number(r.rate), name: r.name, is_current: r.is_current })));
    const { data: sData } = await suppliersApi.getAll({ is_active: 'true' });
    if (sData) setSuppliers(sData);
    const { data: inds } = await industriesApi.getAll({ is_active: 'true' });
    if (inds) setIndustries(inds);
    const { data: itemsData } = await itemsApi.getAll({ is_active: 'true' });
    if (itemsData) setItemsMaster(itemsData);

    if (currentWorkflow?.clientId) {
      const { data: ratios } = await clientAccountRatiosApi.getByClient(currentWorkflow.clientId);
      if (ratios) setClientRatios(ratios);
    }

    const { data: clientIndustryData } = await clientIndustriesApi.getAll({ client_id: clientId });
    const { data: clientRow } = await clientsApi.getById(clientId);
    const clientIndustryIds = [
      ...(clientIndustryData?.map((ci: any) => ci.industry_id) || []),
      ...(clientRow?.industry_id ? [clientRow.industry_id] : []),
    ].filter((id, idx, arr) => arr.indexOf(id) === idx);

    let industryAccountItems: any[] = [];
    if (clientIndustryIds.length > 0) {
      const results = await Promise.all(clientIndustryIds.map((indId: string) => accountItemsApi.getAll({ industry_id: indId, is_active: 'true' })));
      industryAccountItems = results.flatMap(r => r.data || []);
    }

    const { data: aliasData } = await suppliersApi.getAllAliases();
    const aliases = aliasData || [];
    const allAccountItems = aRes.data || [];
    const allItemsData = itemsData || [];

    const autoMatched = merged_temp.map(item => {
      const updated = { ...item };

      if (!updated.supplierId && updated.supplierName && sData) {
        const sName = normalizeJapanese(updated.supplierName).toLowerCase();
        const exactMatch = sData.find((s: any) => normalizeJapanese(s.name).toLowerCase() === sName);
        const partialMatch = !exactMatch ? sData.find((s: any) => {
          const norm = normalizeJapanese(s.name).toLowerCase();
          return sName.includes(norm) || norm.includes(sName);
        }) : null;
        const aliasMatch = !exactMatch && !partialMatch ? aliases.find(a => {
          const normAlias = normalizeJapanese(a.alias_name).toLowerCase();
          return sName.includes(normAlias) || normAlias.includes(sName);
        }) : null;

        let matchedSupplier: any = null;
        if (exactMatch) { updated.supplierId = exactMatch.id; matchedSupplier = exactMatch; }
        else if (partialMatch) { updated.supplierId = partialMatch.id; matchedSupplier = partialMatch; }
        else if (aliasMatch) { updated.supplierId = aliasMatch.supplier_id; matchedSupplier = sData.find((s: any) => s.id === aliasMatch.supplier_id); }

        if (matchedSupplier) {
          if (!updated.accountItemId && matchedSupplier.default_account_item_id) {
            updated.accountItemId = matchedSupplier.default_account_item_id;
            const acct = allAccountItems.find((a: any) => a.id === matchedSupplier.default_account_item_id);
            if (acct?.tax_category_id && !updated.taxCategoryId) updated.taxCategoryId = acct.tax_category_id;
          }
          if (!updated.taxCategoryId && matchedSupplier.default_tax_category_id) updated.taxCategoryId = matchedSupplier.default_tax_category_id;
        }
        if (!matchedSupplier && updated.supplierName) updated.unmatchedSupplierName = updated.supplierName;
        else updated.unmatchedSupplierName = null;
      }

      if (!updated.itemId && allItemsData) {
        const desc = (updated.description || '').toLowerCase();
        const itemMatch = allItemsData.find((it: any) =>
          it.name && (desc.includes(it.name.toLowerCase()) || it.name.toLowerCase().includes(desc))
        );
        if (itemMatch) {
          updated.itemId = itemMatch.id;
          if (!updated.accountItemId && itemMatch.default_account_item_id) {
            updated.accountItemId = itemMatch.default_account_item_id;
            const acct = allAccountItems.find((a: any) => a.id === itemMatch.default_account_item_id);
            if (acct?.tax_category_id && !updated.taxCategoryId) updated.taxCategoryId = acct.tax_category_id;
          }
          if (!updated.taxCategoryId && itemMatch.default_tax_category_id) updated.taxCategoryId = itemMatch.default_tax_category_id;
        }
        if (!itemMatch && updated.description) updated.unmatchedItemName = updated.description;
        else updated.unmatchedItemName = null;
      }

      if (!updated.accountItemId && industryAccountItems.length > 0) {
        const industryDefault = industryAccountItems[0];
        if (industryDefault) {
          updated.accountItemId = industryDefault.id;
          if (industryDefault.tax_category_id && !updated.taxCategoryId) updated.taxCategoryId = industryDefault.tax_category_id;
        }
      }

      return updated;
    });

    autoMatched.sort((a, b) => (a.entryDate || '').localeCompare(b.entryDate || '') || (a.description || '').localeCompare(b.description || ''));
    setItems(autoMatched);
    if (autoMatched.length > 0) { setCurrentIndex(0); setForm({ ...autoMatched[0] }); }
    setLoading(false);
  };

  // ============================================
  // ハンドラー
  // ============================================
  const handleAccountItemChange = (accountItemId: string) => {
    const ai = accountItems.find(a => a.id === accountItemId);
    const updates: Partial<DocumentWithEntry> = { accountItemId };
    if (ai?.tax_category_id) {
      updates.taxCategoryId = ai.tax_category_id;
      const tc = taxCategories.find(t => t.id === ai.tax_category_id);
      if (tc?.current_tax_rate_id) {
        const rate = taxRates.find(r => r.id === tc.current_tax_rate_id);
        if (rate) updates.taxRate = rate.rate;
      } else if (tc) {
        const mr = taxRates.find(r => tc.name.includes(`${Math.round(r.rate * 100)}%`));
        if (mr) updates.taxRate = mr.rate;
        else updates.taxRate = null;
      }
    }
    const ratio = clientRatios.find(r => r.account_item_id === accountItemId);
    if (ratio) setBusinessRatio(Math.round(Number(ratio.business_ratio) * 100));
    const currentItem = items[currentIndex];
    if (currentItem && currentItem.accountItemId && currentItem.accountItemId !== accountItemId) {
      setAddRule(true);
      setRuleSuggestion(`勘定科目変更: ${accountItems.find(a => a.id === currentItem.accountItemId)?.name || '?'} → ${ai?.name || '?'}`);
    }
    setForm(p => ({ ...p, ...updates }));
  };

  const handleSupplierChange = (supplierId: string) => {
    const s = suppliers.find(x => x.id === supplierId);
    const updates: Partial<DocumentWithEntry> = { supplierId: supplierId || null };
    if (s) {
      if (s.default_account_item_id) {
        updates.accountItemId = s.default_account_item_id;
        const acct = accountItems.find(a => a.id === s.default_account_item_id);
        if (acct?.tax_category_id) {
          updates.taxCategoryId = acct.tax_category_id;
          const tc = taxCategories.find(t => t.id === acct.tax_category_id);
          if (tc?.current_tax_rate_id) { const rate = taxRates.find(r => r.id === tc.current_tax_rate_id); if (rate) updates.taxRate = rate.rate; }
        }
      }
      if (!updates.taxCategoryId && s.default_tax_category_id) {
        updates.taxCategoryId = s.default_tax_category_id;
        const tc = taxCategories.find(t => t.id === s.default_tax_category_id);
        if (tc?.current_tax_rate_id) { const rate = taxRates.find(r => r.id === tc.current_tax_rate_id); if (rate) updates.taxRate = rate.rate; }
      }
    }
    setForm(p => ({ ...p, ...updates }));
  };

  const handleItemChange = (itemId: string) => {
    const item = itemsMaster.find(x => x.id === itemId);
    const updates: Partial<DocumentWithEntry> = { itemId: itemId || null };
    if (item) {
      if (item.default_account_item_id) {
        updates.accountItemId = item.default_account_item_id;
        const acct = accountItems.find(a => a.id === item.default_account_item_id);
        if (acct?.tax_category_id) {
          updates.taxCategoryId = acct.tax_category_id;
          const tc = taxCategories.find(t => t.id === acct.tax_category_id);
          if (tc?.current_tax_rate_id) { const rate = taxRates.find(r => r.id === tc.current_tax_rate_id); if (rate) updates.taxRate = rate.rate; }
        }
      }
      if (!updates.taxCategoryId && item.default_tax_category_id) {
        updates.taxCategoryId = item.default_tax_category_id;
        const tc = taxCategories.find(t => t.id === item.default_tax_category_id);
        if (tc?.current_tax_rate_id) { const rate = taxRates.find(r => r.id === tc.current_tax_rate_id); if (rate) updates.taxRate = rate.rate; }
      }
    }
    setForm(p => ({ ...p, ...updates }));
    setItemText('');
  };

  const openDetail = (entryId: string) => {
    const entry = entries.find(e => e.id === entryId);
    const docItem = items.find(i => i.docId === entry?.document_id || i.entryId === entryId);
    if (docItem) {
      setCurrentIndex(items.indexOf(docItem));
      setForm({ ...docItem });
      setAiOriginalForm({ ...docItem });
      setSupplierText(docItem.unmatchedSupplierName || '');
      setItemText(docItem.unmatchedItemName || '');
    }
    setSavedAt(null); setAddRule(false); setRuleIndustryId(''); setRotation(0);
    setViewMode('detail');
  };

  const openDetailFromTop = () => {
    if (items.length === 0) return;
    setCurrentIndex(0); setForm({ ...items[0] });
    setAiOriginalForm({ ...items[0] });
    setSupplierText(items[0].unmatchedSupplierName || '');
    setItemText(items[0].unmatchedItemName || '');
    setSavedAt(null); setAddRule(false); setRuleIndustryId(''); setRotation(0);
    setViewMode('detail');
  };

  // ============================================
  // 保存
  // ============================================
  const saveCurrentItem = async (markApproved = false) => {
    const item = items[currentIndex];
    if (!item) return;
    setSaving(true);
    let entryId = form.entryId;
    let targetStatus: string;
    if (form.isExcluded) {
      targetStatus = 'draft';
    } else if (!markApproved) {
      targetStatus = item.status === 'posted' ? 'posted' : item.status;
    } else if (isManagerOrAdmin) {
      targetStatus = 'approved';
    } else {
      targetStatus = 'reviewed';
    }

    if (!entryId) {
      const { data: cd } = await clientsApi.getById(currentWorkflow!.clientId);
      if (!cd?.organization_id) { setSaving(false); return; }
      const { data: ne, error } = await journalEntriesApi.create({
        organization_id: cd.organization_id, client_id: currentWorkflow!.clientId, document_id: item.docId,
        entry_date: form.entryDate || new Date().toISOString().split('T')[0], entry_type: 'normal',
        description: form.description || '', notes: form.notes || null, status: targetStatus, is_excluded: form.isExcluded || false, ai_generated: false,
        lines: [{
          line_number: 1, debit_credit: 'debit',
          account_item_id: form.accountItemId || null, tax_category_id: form.taxCategoryId || null,
          tax_rate: form.taxRate || null, amount: form.lineAmount || 0,
          supplier_id: form.supplierId || null, item_id: form.itemId || null,
        }],
      });
      if (error || !ne) { console.error('仕訳作成エラー:', error); setSaving(false); return; }
      entryId = ne.id;
      const nl = ne.journal_entry_lines?.[0];
      setForm(p => ({ ...p, entryId, lineId: nl?.id || null }));
    } else {
      await journalEntriesApi.update(entryId, {
        entry_date: form.entryDate, description: form.description, notes: form.notes || null,
        is_excluded: form.isExcluded, status: targetStatus,
      });
      if (form.lineId) {
        await journalEntriesApi.updateLine(form.lineId, {
          account_item_id: form.accountItemId || null, tax_category_id: form.taxCategoryId || null,
          tax_rate: form.taxRate || null, amount: form.lineAmount,
          supplier_id: form.supplierId || null, item_id: form.itemId || null,
        });
      }
      if (markApproved && entryId && !form.isExcluded) {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          if (isManagerOrAdmin) {
            await journalEntriesApi.approve(entryId, {
              approver_id: currentUser.id,
              approval_status: 'approved', approval_level: 1,
              comments: '自己確認・承認',
            });
          } else {
            await journalEntriesApi.approve(entryId, {
              approver_id: currentUser.id,
              approval_status: 'pending', approval_level: 1, comments: '確認OK',
            });
          }
        }
      }
    }
    // ルール追加
    if (addRule && form.accountItemId) {
      await rulesApi.create({
        rule_name: `${form.description || item.supplierName || '不明'} → 自動仕訳`, priority: 100,
        rule_type: '支出', scope: ruleScope, industry_id: ruleScope === 'industry' ? (ruleIndustryId || null) : null,
        client_id: ruleScope === 'client' ? currentWorkflow?.clientId || null : null,
        conditions: { supplier_pattern: item.supplierName || null },
        actions: { account_item_id: form.accountItemId, tax_category_id: form.taxCategoryId || null, description_template: form.description || null },
        auto_apply: true, require_confirmation: false, is_active: true,
      });
    }

    // alias自動追加
    if (form.supplierId && item.supplierName) {
      const matchedSupplier = suppliers.find(s => s.id === form.supplierId);
      if (matchedSupplier && normalizeJapanese(matchedSupplier.name) !== normalizeJapanese(item.supplierName)) {
        const { data: existingAliases } = await suppliersApi.getAliases(form.supplierId);
        const existingAlias = (existingAliases || []).find((a: any) => a.alias_name === item.supplierName);
        if (!existingAlias) {
          await suppliersApi.addAlias(form.supplierId, { alias_name: item.supplierName, source: 'ai_suggested' });
        }
      }
    }

    // 家事按分率の保存
    if (!form.isExcluded && form.accountItemId && businessRatio < 100 && currentWorkflow?.clientId) {
      const { data: clientData } = await clientsApi.getById(currentWorkflow.clientId);
      if (clientData?.organization_id) {
        await clientAccountRatiosApi.upsert({
          organization_id: clientData.organization_id, client_id: currentWorkflow.clientId,
          account_item_id: form.accountItemId, business_ratio: businessRatio / 100,
          valid_from: new Date().toISOString().split('T')[0],
          notes: `仕訳確認画面から設定（${form.description || ''})`,
        });
      }
    }

    // 修正履歴の記録
    if (entryId && !form.isExcluded && currentWorkflow?.clientId) {
      const corrections: Array<{ field_name: string; original_value: string | null; corrected_value: string | null; original_name: string | null; corrected_name: string | null }> = [];
      if (aiOriginalForm.accountItemId && form.accountItemId && aiOriginalForm.accountItemId !== form.accountItemId) {
        corrections.push({
          field_name: 'account_item_id', original_value: aiOriginalForm.accountItemId, corrected_value: form.accountItemId,
          original_name: accountItems.find(a => a.id === aiOriginalForm.accountItemId)?.name || null,
          corrected_name: accountItems.find(a => a.id === form.accountItemId)?.name || null,
        });
      }
      if (aiOriginalForm.taxCategoryId && form.taxCategoryId && aiOriginalForm.taxCategoryId !== form.taxCategoryId) {
        corrections.push({
          field_name: 'tax_category_id', original_value: aiOriginalForm.taxCategoryId, corrected_value: form.taxCategoryId,
          original_name: taxCategories.find(t => t.id === aiOriginalForm.taxCategoryId)?.name || null,
          corrected_name: taxCategories.find(t => t.id === form.taxCategoryId)?.name || null,
        });
      }
      if (corrections.length > 0) {
        const { data: cd } = await clientsApi.getById(currentWorkflow.clientId);
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (cd?.organization_id && authUser) {
          for (const c of corrections) {
            await journalCorrectionsApi.create({
              organization_id: cd.organization_id, journal_entry_id: entryId, client_id: currentWorkflow.clientId,
              field_name: c.field_name, original_value: c.original_value, corrected_value: c.corrected_value,
              original_name: c.original_name, corrected_name: c.corrected_name,
              supplier_name: item.supplierName || null, corrected_by: authUser.id,
            });
          }
          if (corrections.find(c => c.field_name === 'account_item_id')) {
            const { data: countResult } = await journalCorrectionsApi.count({
              client_id: currentWorkflow.clientId, field_name: 'account_item_id',
              corrected_value: form.accountItemId!, rule_suggested: 'false',
            });
            const correctionCount = countResult?.count || 0;
            if (correctionCount >= 3) {
              setAddRule(true);
              setRuleSuggestion(`同じ修正が${correctionCount}回検出されました。ルール追加を推奨します。`);
              await journalCorrectionsApi.markSuggested({
                client_id: currentWorkflow.clientId, field_name: 'account_item_id',
                corrected_value: form.accountItemId!, supplier_name: item.supplierName || '',
              });
            }
          }
        }
      }
    }

    setItems(prev => prev.map((it, i) => i === currentIndex ? { ...it, ...form, entryId, status: targetStatus } as DocumentWithEntry : it));
    setEntries(prev => prev.map(e => {
      if (e.id === entryId || e.document_id === item.docId) {
        return { ...e, status: targetStatus, is_excluded: form.isExcluded || false,
          description: form.description || e.description,
          accountItemName: accountItems.find(a => a.id === form.accountItemId)?.name || e.accountItemName,
          taxCategoryName: taxCategories.find(t => t.id === form.taxCategoryId)?.name || e.taxCategoryName,
          amount: form.lineAmount || e.amount,
        };
      }
      return e;
    }));
    setSaving(false); setSavedAt(new Date().toLocaleTimeString('ja-JP'));
  };

  const goNext = async () => {
    await saveCurrentItem(true);
    if (currentIndex < items.length - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next); setForm({ ...items[next] }); setSavedAt(null); setAddRule(false); setRuleIndustryId(''); setRotation(0);
      setBusinessRatio(100); setAiOriginalForm({ ...items[next] });
      setSupplierText(items[next].unmatchedSupplierName || ''); setItemText(items[next].unmatchedItemName || '');
      setRuleSuggestion('');
    }
  };
  const goPrev = async () => {
    await saveCurrentItem(false);
    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      setCurrentIndex(prev); setForm({ ...items[prev] }); setSavedAt(null); setAddRule(false); setRuleIndustryId(''); setRotation(0);
      setBusinessRatio(100); setAiOriginalForm({ ...items[prev] });
      setSupplierText(items[prev].unmatchedSupplierName || ''); setItemText(items[prev].unmatchedItemName || '');
      setRuleSuggestion('');
    }
  };

  const setBusiness = (isBusiness: boolean) => {
    if (!isBusiness) {
      setAiOriginalForm({ accountItemId: form.accountItemId, taxCategoryId: form.taxCategoryId, taxRate: form.taxRate });
      const jk = accountItems.find(a => a.name === '事業主貸');
      const taigaisotsu = taxCategories.find(t => t.code === 'NON_TAXABLE');
      setForm(p => ({ ...p, isBusiness: false, isExcluded: false,
        accountItemId: jk?.id || p.accountItemId, taxCategoryId: taigaisotsu?.id || p.taxCategoryId, taxRate: null }));
    } else {
      setForm(p => ({ ...p, isBusiness: true, isExcluded: false,
        accountItemId: aiOriginalForm.accountItemId || p.accountItemId,
        taxCategoryId: aiOriginalForm.taxCategoryId || p.taxCategoryId,
        taxRate: aiOriginalForm.taxRate ?? p.taxRate }));
    }
  };
  const toggleExclude = () => setForm(p => ({ ...p, isExcluded: !p.isExcluded, isBusiness: p.isExcluded }));

  const handleRevert = async (entryId: string, currentStatus: string) => {
    if (currentStatus === 'reviewed' && isManagerOrAdmin) {
      await journalEntriesApi.updateStatus(entryId, 'draft');
    } else if (currentStatus === 'approved') {
      if (!isManagerOrAdmin) return;
      await journalEntriesApi.updateStatus(entryId, 'draft');
    } else if (currentStatus === 'posted') {
      if (!isManagerOrAdmin) return;
      if (!window.confirm('エクスポート済みの仕訳を修正対象にしますか？')) return;
      await journalEntriesApi.updateStatus(entryId, 'amended');
    }
    await loadAllData();
  };

  const handleApproveFromList = async (entryId: string) => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser || !isManagerOrAdmin) return;
    await journalEntriesApi.approve(entryId, {
      approver_id: currentUser.id,
      approval_status: 'approved', approval_level: 1,
      comments: '一覧画面から承認',
    });
    await loadAllData();
  };

  const toggleMultiEntryGroup = (docId: string) => {
    setExpandedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId); else next.add(docId);
      return next;
    });
  };

  const handleBulkReviewGroup = async (docId: string) => {
    const group = multiEntryGroups.find(g => g.documentId === docId);
    if (!group) return;
    const draftIds = group.entries.filter(e => e.status === 'draft').map(e => e.id);
    if (draftIds.length === 0) return;
    const targetStatus = isManagerOrAdmin ? 'approved' : 'reviewed';
    await journalEntriesApi.bulkUpdateStatus(draftIds, targetStatus);
    await loadAllData();
  };

  const onCreateSupplier = async (name: string) => {
    const { data: cd } = await clientsApi.getById(currentWorkflow!.clientId);
    if (!cd?.organization_id) return;
    const { data: newSupplier } = await suppliersApi.create({ organization_id: cd.organization_id, name, is_active: true });
    if (newSupplier) { setSuppliers(prev => [...prev, newSupplier]); handleSupplierChange(newSupplier.id); setSupplierText(''); }
  };

  const onCreateItem = async (name: string) => {
    const { data: newItem } = await itemsApi.create({ name, code: null, is_active: true });
    if (newItem) { setItemsMaster(prev => [...prev, newItem]); handleItemChange(newItem.id); setItemText(''); }
  };

  // ============================================
  // ショートカットキー
  // ============================================
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
      else if (e.key === 'ArrowRight' && !e.altKey && currentIndex < items.length - 1) { e.preventDefault(); goNext(); }
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
  }, [viewMode, form.isBusiness, currentIndex, items.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (viewMode === 'detail' && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentIndex, viewMode]);

  const handleBeforeNext = async (): Promise<boolean> => {
    if (viewMode === 'detail') await saveCurrentItem(true);
    const drafts = entries.filter(e => e.status === 'draft');
    if (drafts.length > 0) {
      const ok = window.confirm(`未確認の仕訳が${drafts.length}件あります。\n\n仕訳を確定して出力に進みますか？`);
      if (!ok) return false;
      const bulkStatus = isManagerOrAdmin ? 'approved' : 'reviewed';
      await journalEntriesApi.bulkUpdateStatus(drafts.map(e => e.id), bulkStatus);
    }
    const allIds = entries.map(e => e.id);
    if (allIds.length > 0) await journalEntriesApi.bulkUpdateStatus(allIds, 'posted');
    updateWorkflowData({ reviewCompleted: true });
    return true;
  };

  const fmt = (n: number | undefined) => n == null ? '-' : `¥${Number(n).toLocaleString()}`;

  const filteredEntries = useMemo(() => {
    if (activeTab === 'unchecked') return entries.filter(e => e.status === 'draft');
    if (activeTab === 'excluded') return entries.filter(e => e.is_excluded);
    return entries;
  }, [entries, activeTab]);

  const allCount = entries.length;
  const uncheckedCount = entries.filter(e => e.status === 'draft').length;
  const reviewedCount = entries.filter(e => e.status === 'reviewed').length;
  const approvedCount = entries.filter(e => e.status === 'approved' || e.status === 'posted').length;
  const excludedCount = entries.filter(e => e.is_excluded).length;
  const reviewCount = entries.filter(e => e.requires_review || (e.ai_confidence != null && e.ai_confidence < 0.7)).length;

  // ============================================
  // ガード
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

  const ci = items[currentIndex];
  const multiGroup = ci ? multiEntryGroups.find(g => g.documentId === ci.docId) : null;
  const isMultiEntry = !!(multiGroup && multiGroup.entries.length > 1);
  const siblingItems = isMultiEntry ? items.filter(it => it.docId === ci.docId) : [];

  // ============================================
  // レンダリング
  // ============================================
  return (
    <div className="flex flex-col bg-gray-50">
      <WorkflowHeader onBeforeNext={handleBeforeNext} nextLabel="仕訳出力へ" />

      {/* タブ */}
      <div className="bg-white px-6 border-b border-gray-200 flex gap-0 flex-shrink-0">
        {([
          { key: 'all' as TabFilter, label: 'すべて', count: allCount },
          { key: 'unchecked' as TabFilter, label: '未確認', count: uncheckedCount },
          { key: 'reviewed' as TabFilter, label: '承認待ち', count: reviewedCount },
          { key: 'excluded' as TabFilter, label: '対象外', count: excludedCount },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? 'text-blue-600 border-blue-600 font-semibold' : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}>
            {tab.label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-7xl mx-auto space-y-5">

          {/* サマリーカード */}
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
                if (!window.confirm(`確認済みの${reviewedCount}件を一括承認しますか？`)) return;
                const reviewedEntries = entries.filter(e => e.status === 'reviewed');
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) return;
                for (const e of reviewedEntries) {
                  await journalEntriesApi.approve(e.id, {
                    approver_id: currentUser.id,
                    approval_status: 'approved', approval_level: 1,
                    comments: '一括承認',
                  });
                }
                await loadAllData();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <CheckCircle size={16} /> 確認済み{reviewedCount}件を一括承認
            </button>
          )}

          {/* テーブル */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {viewMode === 'list' && (
              <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-900">仕訳一覧</h2>
                <button onClick={openDetailFromTop}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ background: '#dc4a3a' }}>
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
                          const statusLabel = entry.is_excluded ? '外' : entry.status === 'approved' ? '承認' : entry.status === 'posted' ? '済' : entry.status === 'reviewed' ? '確認' : entry.status === 'amended' ? '修正' : '未';
                          return (
                            <tr key={entry.id} ref={isSelected ? selectedRowRef : undefined}
                              onClick={() => openDetail(entry.id)}
                              className={`cursor-pointer text-xs transition-colors ${isSelected ? 'bg-blue-100 font-semibold' : 'hover:bg-gray-50'}`}>
                              <td className="pl-3 pr-1 py-1 text-gray-400 w-6">{idx + 1}</td>
                              <td className="px-1 py-1 text-gray-700 truncate max-w-[120px]">{entry.description || '-'}</td>
                              <td className="px-1 py-1 text-gray-500 truncate max-w-[80px]">{entry.accountItemName || '-'}</td>
                              <td className="px-1 py-1 text-right tabular-nums">{fmt(entry.amount)}</td>
                              <td className="px-1 py-1 text-center">
                                <span className={`text-[9px] px-1 py-0.5 rounded ${
                                  entry.status === 'approved' ? 'bg-green-100 text-green-700' :
                                  entry.status === 'posted' ? 'bg-purple-100 text-purple-700' :
                                  entry.status === 'reviewed' ? 'bg-yellow-100 text-yellow-700' :
                                  entry.status === 'amended' ? 'bg-orange-100 text-orange-700' :
                                  entry.is_excluded ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                                }`}>{statusLabel}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={() => { saveCurrentItem(false); setViewMode('list'); loadAllData(); }}
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
                            <td className="px-4 py-3 text-sm max-w-[200px] truncate">
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
                                  <button onClick={(e) => { e.stopPropagation(); handleRevert(entry.id, 'posted'); }}
                                    className="p-0.5 text-purple-500 hover:bg-purple-50 rounded" title="確定解除"><Undo2 size={12} /></button>
                                </div>
                              ) : entry.status === 'reviewed' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                  <Clock size={10} />確認済み
                                  {isManagerOrAdmin && (
                                    <button onClick={(e) => { e.stopPropagation(); handleApproveFromList(entry.id); }}
                                      className="ml-1 px-1.5 py-0.5 bg-green-500 text-white rounded text-[10px] hover:bg-green-600">
                                      承認
                                    </button>
                                  )}
                                </span>
                              ) : entry.status === 'approved' ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle size={10} />承認済</span>
                                  <button onClick={(e) => { e.stopPropagation(); handleRevert(entry.id, 'approved'); }}
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

          {/* 個別チェック詳細 */}
          {viewMode === 'detail' && ci && (
            <div className="grid grid-cols-2 gap-4" style={{ animation: 'fadeSlideUp .3s ease' }}>
              <ImageViewer
                fileName={ci.fileName}
                imageUrl={ci.imageUrl}
                zoom={zoom}
                setZoom={setZoom}
                rotation={rotation}
                setRotation={setRotation}
              />
              <EntryCard
                ci={ci}
                form={form}
                setForm={setForm}
                accountItems={accountItems}
                taxCategories={taxCategories}
                taxRates={taxRates}
                suppliers={suppliers}
                itemsMaster={itemsMaster}
                industries={industries}
                businessRatio={businessRatio}
                setBusinessRatio={setBusinessRatio}
                clientRatios={clientRatios}
                isManagerOrAdmin={isManagerOrAdmin}
                currentIndex={currentIndex}
                itemsCount={items.length}
                saving={saving}
                savedAt={savedAt}
                addRule={addRule}
                setAddRule={setAddRule}
                ruleScope={ruleScope}
                setRuleScope={setRuleScope}
                ruleIndustryId={ruleIndustryId}
                setRuleIndustryId={setRuleIndustryId}
                ruleSuggestion={ruleSuggestion}
                setRuleSuggestion={setRuleSuggestion}
                supplierText={supplierText}
                setSupplierText={setSupplierText}
                itemText={itemText}
                setItemText={setItemText}
                handleAccountItemChange={handleAccountItemChange}
                handleSupplierChange={handleSupplierChange}
                handleItemChange={handleItemChange}
                setBusiness={setBusiness}
                toggleExclude={toggleExclude}
                goNext={goNext}
                goPrev={goPrev}
                saveCurrentItem={saveCurrentItem}
                setViewMode={setViewMode}
                loadAllData={loadAllData}
                onCreateSupplier={onCreateSupplier}
                onCreateItem={onCreateItem}
                fmt={fmt}
                isMultiEntry={isMultiEntry}
                siblingItems={siblingItems}
                onSwitchSibling={(sib) => {
                  const i = items.indexOf(sib);
                  setCurrentIndex(i); setForm({ ...sib }); setAiOriginalForm({ ...sib });
                  setSupplierText(sib.unmatchedSupplierName || ''); setItemText(sib.unmatchedItemName || '');
                }}
              />
            </div>
          )}

        </div>
      </div>

      <style>{`
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
