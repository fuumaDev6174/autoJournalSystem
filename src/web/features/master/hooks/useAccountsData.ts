// 勘定科目ページのデータ取得・CRUD・フィルタリングを管理

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { AccountItem, AccountCategory, TaxCategory } from '@/types';
import { accountItemsApi, accountCategoriesApi, taxCategoriesApi, industriesApi } from '@/web/shared/lib/api/backend.api';
import { useAuth } from '@/web/app/providers/AuthProvider';

const CATEGORY_CODE_MAP: Record<string, { label: string; filter: string }> = {
  '1': { label: '資産', filter: 'asset' },
  '2': { label: '負債', filter: 'liability' },
  '3': { label: '純資産', filter: 'equity' },
  '4': { label: '収入', filter: 'income' },
  '5': { label: '支出', filter: 'expense' },
};

export type CategoryFilterType = 'all' | 'income' | 'expense' | 'asset' | 'liability' | 'equity';

export function useAccountsData() {
  const { userProfile } = useAuth();
  const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
  const [accountCategories, setAccountCategories] = useState<AccountCategory[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'general' | 'real_estate'>('general');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilterType>('all');
  const [realEstateIndustryId, setRealEstateIndustryId] = useState<string | null>(null);

  const orgId = userProfile?.organization_id || null;
  const userRole = userProfile?.role || 'viewer';
  const canEdit = userRole === 'admin' || userRole === 'manager';
  const canDelete = userRole === 'admin';

  useEffect(() => {
    (async () => {
      const [catRes, taxRes, industryRes] = await Promise.all([
        accountCategoriesApi.getAll(), taxCategoriesApi.getAll(), industriesApi.getAll(),
      ]);
      if (industryRes.data) {
        const re = industryRes.data.find(ind => ind.code === 'real_estate');
        if (re) setRealEstateIndustryId(re.id);
      }
      if (catRes.data && catRes.data.length > 0) setAccountCategories(catRes.data);
      else setLoading(false);
      if (taxRes.data) setTaxCategories(taxRes.data);
    })();
  }, []);

  const loadAccountItems = useCallback(async () => {
    setLoading(true);
    const params: { industry_id?: string; is_active?: string } = {};
    if (activeTab === 'general') params.industry_id = 'null';
    else if (realEstateIndustryId) params.industry_id = realEstateIndustryId;
    if (showActiveOnly) params.is_active = 'true';
    const { data } = await accountItemsApi.getAll(params);
    if (data) setAccountItems(data);
    setLoading(false);
  }, [activeTab, showActiveOnly, realEstateIndustryId]);

  useEffect(() => { if (accountCategories.length > 0) loadAccountItems(); }, [loadAccountItems, accountCategories]);

  const getCategoryFilter = useCallback((item: AccountItem) => CATEGORY_CODE_MAP[item.account_category?.code ?? '']?.filter ?? '', []);
  const getCategoryName = useCallback((item: AccountItem) => CATEGORY_CODE_MAP[item.account_category?.code ?? '']?.label ?? item.account_category?.name ?? '-', []);
  const getTaxCategoryName = useCallback((item: AccountItem) => item.tax_category?.display_name ?? item.tax_category?.name ?? '対象外', []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return accountItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q)
        || (item.short_name?.toLowerCase().includes(q) ?? false) || (item.name_kana?.toLowerCase().includes(q) ?? false);
      if (!matchesSearch) return false;
      if (activeCategory === 'all') return true;
      return getCategoryFilter(item) === activeCategory;
    });
  }, [accountItems, searchQuery, activeCategory, getCategoryFilter]);

  const getCategoryCount = useCallback((filter: string) => {
    if (filter === 'all') return accountItems.length;
    return accountItems.filter(item => getCategoryFilter(item) === filter).length;
  }, [accountItems, getCategoryFilter]);

  const createItem = useCallback(async (data: Record<string, unknown>) => {
    const payload = { ...data, organization_id: orgId };
    const { error } = await accountItemsApi.create(payload as Partial<AccountItem>);
    if (error) { alert('登録に失敗しました: ' + error); return false; }
    await loadAccountItems();
    return true;
  }, [orgId, loadAccountItems]);

  const updateItem = useCallback(async (id: string, data: Record<string, unknown>) => {
    const { error } = await accountItemsApi.update(id, data as Partial<AccountItem>);
    if (error) { alert('更新に失敗しました: ' + error); return false; }
    await loadAccountItems();
    return true;
  }, [loadAccountItems]);

  const deleteItem = useCallback(async (id: string) => {
    const { error } = await accountItemsApi.delete(id);
    if (error) { alert('削除に失敗しました: ' + error); return false; }
    await loadAccountItems();
    return true;
  }, [loadAccountItems]);

  const toggleActive = useCallback(async (item: AccountItem) => {
    if (item.is_system && item.is_active) { alert('システム科目は無効にできません'); return; }
    await accountItemsApi.update(item.id, { is_active: !item.is_active });
    loadAccountItems();
  }, [loadAccountItems]);

  return {
    accountItems, accountCategories, taxCategories, loading,
    activeTab, setActiveTab, showActiveOnly, setShowActiveOnly,
    searchQuery, setSearchQuery, activeCategory, setActiveCategory,
    canEdit, canDelete, orgId, realEstateIndustryId,
    filteredItems, getCategoryName, getCategoryFilter, getTaxCategoryName, getCategoryCount,
    createItem, updateItem, deleteItem, toggleActive,
    CATEGORY_CODE_MAP,
  };
}
