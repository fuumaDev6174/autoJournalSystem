// 品目ページのデータ取得・CRUD・エイリアス管理

import { useState, useEffect, useCallback, useMemo } from 'react';
import { itemsApi, accountItemsApi, taxCategoriesApi } from '@/web/shared/lib/api/backend.api';
import type { Item, ItemAlias } from '@/web/shared/lib/api/backend.api';
import { useAuth } from '@/web/app/providers/AuthProvider';

export const ITEM_CATEGORIES = ['燃料', '事務用品', '飲食', '交通', '通信', '消耗品', '設備', '衣類', '医療・健康', '美容', '教育', 'その他'];

interface AccountItemOption { id: string; code: string; name: string; }
interface TaxCategoryOption { id: string; name: string; }

export function useItemsData() {
  const { userProfile } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [aliases, setAliases] = useState<ItemAlias[]>([]);
  const [accountItems, setAccountItems] = useState<AccountItemOption[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategoryOption[]>([]);

  const orgId = userProfile?.organization_id || null;
  const canEdit = ['admin', 'manager', 'operator'].includes(userProfile?.role || 'viewer');

  const loadItems = useCallback(async () => {
    setLoading(true);
    const { data } = await itemsApi.getAll({ is_active: 'true' });
    if (data) setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
    (async () => {
      const [accRes, taxRes] = await Promise.all([accountItemsApi.getAll({ is_active: 'true' }), taxCategoriesApi.getAll()]);
      if (accRes.data) setAccountItems(accRes.data);
      if (taxRes.data) setTaxCategories(taxRes.data);
    })();
  }, [loadItems]);

  const loadAliases = useCallback(async (itemId: string) => {
    const { data } = await itemsApi.getAliases(itemId);
    if (data) setAliases(data);
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(q) || (item.code?.toLowerCase().includes(q) ?? false) || (item.category?.toLowerCase().includes(q) ?? false);
      const matchCategory = !categoryFilter || item.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [items, searchQuery, categoryFilter]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(item => { const c = item.category || 'その他'; counts[c] = (counts[c] || 0) + 1; });
    return counts;
  }, [items]);

  const createItem = useCallback(async (data: Partial<Item>) => {
    if (orgId) (data as Record<string, unknown>).organization_id = orgId;
    const { error } = await itemsApi.create(data);
    if (error) { alert('登録に失敗しました: ' + error); return false; }
    await loadItems(); return true;
  }, [orgId, loadItems]);

  const updateItem = useCallback(async (id: string, data: Partial<Item>) => {
    const { error } = await itemsApi.update(id, data);
    if (error) { alert('更新に失敗しました: ' + error); return false; }
    await loadItems(); return true;
  }, [loadItems]);

  const deleteItem = useCallback(async (id: string) => {
    const { error } = await itemsApi.delete(id);
    if (error) { alert('削除に失敗しました: ' + error); return false; }
    await loadItems(); return true;
  }, [loadItems]);

  const addAlias = useCallback(async (itemId: string, aliasName: string) => {
    const { error } = await itemsApi.addAlias(itemId, { alias_name: aliasName, source: 'manual' });
    if (error) { alert('別名の追加に失敗しました: ' + error); return false; }
    await loadAliases(itemId); return true;
  }, [loadAliases]);

  const deleteAlias = useCallback(async (aliasId: string, itemId: string) => {
    const { error } = await itemsApi.deleteAlias(aliasId);
    if (error) { alert('削除に失敗しました: ' + error); return false; }
    await loadAliases(itemId); return true;
  }, [loadAliases]);

  return {
    items, loading, searchQuery, setSearchQuery,
    categoryFilter, setCategoryFilter,
    canEdit, orgId, filteredItems, categoryCounts,
    aliases, accountItems, taxCategories, loadAliases,
    createItem, updateItem, deleteItem, addAlias, deleteAlias,
  };
}
