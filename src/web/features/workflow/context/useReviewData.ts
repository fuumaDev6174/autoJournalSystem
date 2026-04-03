import { useCallback } from 'react';
import type { AccountItem, TaxCategory, Supplier } from '@/types';
import {
  journalEntriesApi, documentsApi, clientsApi, accountItemsApi, taxCategoriesApi,
  taxRatesApi, suppliersApi, itemsApi, storageApi, clientAccountRatiosApi,
  industriesApi, clientIndustriesApi,
} from '@/web/shared/lib/api/backend.api';
import { normalizeJapanese } from '@/shared/utils/normalize-japanese';
import type {
  EntryRow, DocumentWithEntry, TaxRateOption, MultiEntryGroup, ItemMaster,
} from './ReviewContext';

interface UseReviewDataParams {
  currentWorkflow: { id: string; clientId: string } | null;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setEntries: React.Dispatch<React.SetStateAction<EntryRow[]>>;
  setMultiEntryGroups: React.Dispatch<React.SetStateAction<MultiEntryGroup[]>>;
  setItems: React.Dispatch<React.SetStateAction<DocumentWithEntry[]>>;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  setForm: React.Dispatch<React.SetStateAction<Partial<DocumentWithEntry>>>;
  setAccountItems: React.Dispatch<React.SetStateAction<AccountItem[]>>;
  setTaxCategories: React.Dispatch<React.SetStateAction<TaxCategory[]>>;
  setTaxRates: React.Dispatch<React.SetStateAction<TaxRateOption[]>>;
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  setItemsMaster: React.Dispatch<React.SetStateAction<ItemMaster[]>>;
  setIndustries: React.Dispatch<React.SetStateAction<Array<{ id: string; name: string }>>>;
  setClientRatios: React.Dispatch<React.SetStateAction<Array<{ account_item_id: string; business_ratio: number }>>>;
}

export function useReviewData(params: UseReviewDataParams) {
  const {
    currentWorkflow, setLoading, setEntries, setMultiEntryGroups, setItems, setCurrentIndex, setForm,
    setAccountItems, setTaxCategories, setTaxRates, setSuppliers, setItemsMaster, setIndustries, setClientRatios,
  } = params;

  const loadAllData = useCallback(async () => {
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

    // Detail items
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

    // Master data
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

    // Auto-matching
    const autoMatched = merged.map(item => {
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
  }, [currentWorkflow]);

  return { loadAllData };
}
