/**
 * @module レビューアクション hooks
 */
import { useCallback, useRef } from 'react';
import type { AccountItem, TaxCategory, Supplier, JournalEntry } from '@/types';
import {
  journalEntriesApi, clientsApi, rulesApi, suppliersApi, itemsApi,
  clientAccountRatiosApi, journalCorrectionsApi,
} from '@/web/shared/lib/api/backend.api';
import { normalizeJapanese } from '@/shared/utils/normalize-japanese';
import type {
  EntryRow, DocumentWithEntry, TaxRateOption, MultiEntryGroup, ViewMode, ItemMaster,
} from './ReviewContext';

interface UseReviewActionsParams {
  currentWorkflow: { id: string; clientId: string } | null;
  updateWorkflowData: (data: any) => void;
  user: any;
  isManagerOrAdmin: boolean;

  items: DocumentWithEntry[];
  setItems: React.Dispatch<React.SetStateAction<DocumentWithEntry[]>>;
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  form: Partial<DocumentWithEntry>;
  setForm: React.Dispatch<React.SetStateAction<Partial<DocumentWithEntry>>>;
  compoundLines: any[];

  entries: EntryRow[];
  setEntries: React.Dispatch<React.SetStateAction<EntryRow[]>>;
  multiEntryGroups: MultiEntryGroup[];

  accountItems: AccountItem[];
  taxCategories: TaxCategory[];
  taxRates: TaxRateOption[];
  suppliers: Supplier[];
  itemsMaster: ItemMaster[];
  clientRatios: Array<{ account_item_id: string; business_ratio: number }>;

  businessRatio: number;
  setBusinessRatio: React.Dispatch<React.SetStateAction<number>>;
  saving: boolean;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setSavedAt: React.Dispatch<React.SetStateAction<string | null>>;

  addRule: boolean;
  setAddRule: React.Dispatch<React.SetStateAction<boolean>>;
  ruleScope: 'shared' | 'industry' | 'client';
  ruleIndustryId: string;
  ruleSuggestion: string;
  setRuleSuggestion: React.Dispatch<React.SetStateAction<string>>;
  setSupplierText: React.Dispatch<React.SetStateAction<string>>;
  setItemText: React.Dispatch<React.SetStateAction<string>>;

  aiOriginalForm: Partial<DocumentWithEntry>;
  setAiOriginalForm: React.Dispatch<React.SetStateAction<Partial<DocumentWithEntry>>>;
  setRotation: React.Dispatch<React.SetStateAction<number>>;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  setRuleIndustryId: React.Dispatch<React.SetStateAction<string>>;
  setExpandedDocs: React.Dispatch<React.SetStateAction<Set<string>>>;

  loadAllData: () => Promise<void>;
}

export function useReviewActions(params: UseReviewActionsParams) {
  const {
    currentWorkflow, user, isManagerOrAdmin,
    items, currentIndex, setCurrentIndex, form, setForm,
    entries, multiEntryGroups,
    accountItems, taxCategories, taxRates, suppliers, itemsMaster, clientRatios,
    setBusinessRatio, setSavedAt,
    setAddRule, setRuleSuggestion,
    setSupplierText, setItemText,
    aiOriginalForm, setAiOriginalForm, setRotation,
    setViewMode, setRuleIndustryId, setExpandedDocs,
    loadAllData,
  } = params;

  // useRef で最新の状態を保持（saveCurrentItem / goNext / goPrev の依存配列を最小化）
  const stateRef = useRef(params);
  stateRef.current = params;

  // ============================================
  // Handler: account item change
  // ============================================
  const handleAccountItemChange = useCallback((accountItemId: string) => {
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
  }, [accountItems, taxCategories, taxRates, clientRatios, items, currentIndex]);

  // ============================================
  // Handler: supplier change
  // ============================================
  const handleSupplierChange = useCallback((supplierId: string) => {
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
  }, [suppliers, accountItems, taxCategories, taxRates]);

  // ============================================
  // Handler: item change
  // ============================================
  const handleItemChange = useCallback((itemId: string) => {
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
  }, [itemsMaster, accountItems, taxCategories, taxRates]);

  // ============================================
  // openDetail / openDetailFromTop
  // ============================================
  const openDetail = useCallback((entryId: string) => {
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
  }, [entries, items]);

  const openDetailFromTop = useCallback(() => {
    if (items.length === 0) return;
    setCurrentIndex(0); setForm({ ...items[0] });
    setAiOriginalForm({ ...items[0] });
    setSupplierText(items[0].unmatchedSupplierName || '');
    setItemText(items[0].unmatchedItemName || '');
    setSavedAt(null); setAddRule(false); setRuleIndustryId(''); setRotation(0);
    setViewMode('detail');
  }, [items]);

  // ============================================
  // saveCurrentItem
  // ============================================
  const saveCurrentItem = useCallback(async (markApproved = false) => {
    const { items, currentIndex, form, isManagerOrAdmin, currentWorkflow, user,
      addRule, ruleScope, ruleIndustryId, businessRatio, suppliers, accountItems,
      taxCategories, aiOriginalForm,
      setSaving, setSavedAt, setItems, setEntries, setForm, setAddRule, setRuleSuggestion,
    } = stateRef.current;
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
        entry_date: form.entryDate, description: form.description, notes: form.notes || undefined,
        is_excluded: form.isExcluded, status: targetStatus as JournalEntry['status'],
      });
      if (form.lineId) {
        await journalEntriesApi.updateLine(form.lineId, {
          account_item_id: form.accountItemId || null, tax_category_id: form.taxCategoryId || null,
          tax_rate: form.taxRate || null, amount: form.lineAmount,
          supplier_id: form.supplierId || null, item_id: form.itemId || null,
        });
      }
      if (markApproved && entryId && !form.isExcluded) {
        const currentUser = user;
        if (currentUser) {
          if (isManagerOrAdmin) {
            await journalEntriesApi.approve(entryId, { approver_id: currentUser.id, approval_status: 'approved', approval_level: 1, comments: '自己確認・承認' });
          } else {
            await journalEntriesApi.approve(entryId, { approver_id: currentUser.id, approval_status: 'pending', approval_level: 1, comments: '確認OK' });
          }
        }
      }
    }

    // Rule creation
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

    // Alias auto-add
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

    // Business ratio save
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

    // Correction tracking
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
        const authUser = user;
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
  }, []); // stateRef 経由で最新値を参照するため依存配列は空

  // ============================================
  // Navigation
  // ============================================
  const goNext = useCallback(async () => {
    await saveCurrentItem(true);
    const { items, currentIndex, setCurrentIndex, setForm, setSavedAt, setAddRule, setRuleIndustryId,
      setRotation, setBusinessRatio, setAiOriginalForm, setSupplierText, setItemText, setRuleSuggestion,
    } = stateRef.current;
    if (currentIndex < items.length - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next); setForm({ ...items[next] }); setSavedAt(null); setAddRule(false); setRuleIndustryId(''); setRotation(0);
      setBusinessRatio(100); setAiOriginalForm({ ...items[next] });
      setSupplierText(items[next].unmatchedSupplierName || ''); setItemText(items[next].unmatchedItemName || '');
      setRuleSuggestion('');
    }
  }, [saveCurrentItem]);

  const goPrev = useCallback(async () => {
    await saveCurrentItem(false);
    const { items, currentIndex, setCurrentIndex, setForm, setSavedAt, setAddRule, setRuleIndustryId,
      setRotation, setBusinessRatio, setAiOriginalForm, setSupplierText, setItemText, setRuleSuggestion,
    } = stateRef.current;
    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      setCurrentIndex(prev); setForm({ ...items[prev] }); setSavedAt(null); setAddRule(false); setRuleIndustryId(''); setRotation(0);
      setBusinessRatio(100); setAiOriginalForm({ ...items[prev] });
      setSupplierText(items[prev].unmatchedSupplierName || ''); setItemText(items[prev].unmatchedItemName || '');
      setRuleSuggestion('');
    }
  }, [saveCurrentItem]);

  // ============================================
  // Business / Exclude
  // ============================================
  const setBusiness = useCallback((isBusiness: boolean) => {
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
  }, [form, accountItems, taxCategories, aiOriginalForm]);

  const toggleExclude = useCallback(() => setForm(p => ({ ...p, isExcluded: !p.isExcluded, isBusiness: p.isExcluded })), []);

  // ============================================
  // List actions
  // ============================================
  const handleRevert = useCallback(async (entryId: string, currentStatus: string) => {
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
  }, [isManagerOrAdmin, loadAllData]);

  const handleApproveFromList = useCallback(async (entryId: string) => {
    const currentUser = user;
    if (!currentUser || !isManagerOrAdmin) return;
    await journalEntriesApi.approve(entryId, {
      approver_id: currentUser.id, approval_status: 'approved', approval_level: 1, comments: '一覧画面から承認',
    });
    await loadAllData();
  }, [user, isManagerOrAdmin, loadAllData]);

  const toggleMultiEntryGroup = useCallback((docId: string) => {
    setExpandedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId); else next.add(docId);
      return next;
    });
  }, []);

  const handleBulkReviewGroup = useCallback(async (docId: string) => {
    const group = multiEntryGroups.find(g => g.documentId === docId);
    if (!group) return;
    const draftIds = group.entries.filter(e => e.status === 'draft').map(e => e.id);
    if (draftIds.length === 0) return;
    const targetStatus = isManagerOrAdmin ? 'approved' : 'reviewed';
    await journalEntriesApi.bulkUpdateStatus(draftIds, targetStatus);
    await loadAllData();
  }, [multiEntryGroups, isManagerOrAdmin, loadAllData]);

  // ============================================
  // Master data creation
  // ============================================
  const onCreateSupplier = useCallback(async (name: string) => {
    const { data: cd } = await clientsApi.getById(currentWorkflow!.clientId);
    if (!cd?.organization_id) return;
    const { data: newSupplier } = await suppliersApi.create({ organization_id: cd.organization_id, name, is_active: true });
    if (newSupplier) {
      // Note: suppliers state is updated via the parent's setSuppliers which we don't have direct access to here.
      // Instead we trigger a full reload after creation to keep things simple.
      handleSupplierChange(newSupplier.id);
      setSupplierText('');
    }
  }, [currentWorkflow, handleSupplierChange]);

  const onCreateItem = useCallback(async (name: string) => {
    const { data: newItem } = await itemsApi.create({ name, code: null, is_active: true });
    if (newItem) {
      handleItemChange(newItem.id);
      setItemText('');
    }
  }, [handleItemChange]);

  // ============================================
  // handleBeforeNext (workflow navigation)
  // ============================================
  const handleBeforeNext = useCallback(async (): Promise<boolean> => {
    const { entries, isManagerOrAdmin, updateWorkflowData, form } = stateRef.current;
    if (form.entryId) await saveCurrentItem(true);
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
  }, [saveCurrentItem]);

  return {
    handleAccountItemChange, handleSupplierChange, handleItemChange,
    openDetail, openDetailFromTop,
    saveCurrentItem, goNext, goPrev,
    setBusiness, toggleExclude,
    handleRevert, handleApproveFromList,
    toggleMultiEntryGroup, handleBulkReviewGroup,
    onCreateSupplier, onCreateItem,
    handleBeforeNext,
  };
}
