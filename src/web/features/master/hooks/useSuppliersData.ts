// 取引先ページのデータ取得・CRUD・エイリアス・ルール管理

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Supplier, SupplierAlias } from '@/types';
import { suppliersApi, rulesApi } from '@/web/shared/lib/api/backend.api';
import { useAuth } from '@/web/app/providers/AuthProvider';

export const SUPPLIER_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'すべて' }, { key: 'fuel', label: '燃料' }, { key: 'vehicle', label: '車両・交通' },
  { key: 'ec_retail', label: 'EC・小売' }, { key: 'streaming', label: '配信' }, { key: 'telecom', label: '通信・IT' },
  { key: 'real_estate', label: '不動産' }, { key: 'insurance', label: '保険・金融' }, { key: 'logistics', label: '物流' },
  { key: 'food', label: '飲食' }, { key: 'other', label: 'その他' },
];

export const KANA_INDEX = ['あ','か','さ','た','な','は','ま','や','ら','わ','A-Z'];

export function useSuppliersData() {
  const { userProfile } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeKana, setActiveKana] = useState<string | null>(null);
  const [aliases, setAliases] = useState<SupplierAlias[]>([]);
  const [supplierRules, setSupplierRules] = useState<Array<{
    id: string; rule_name: string; priority: number; scope: string;
    conditions: Record<string, unknown>; actions: Record<string, unknown>;
  }>>([]);

  const orgId = userProfile?.organization_id || null;
  const canEdit = ['admin', 'manager', 'operator'].includes(userProfile?.role || 'viewer');

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    const { data } = await suppliersApi.getAll({ is_active: 'true' });
    if (data) setSuppliers(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  const loadAliases = useCallback(async (supplierId: string) => {
    const { data } = await suppliersApi.getAliases(supplierId);
    if (data) setAliases(data);
  }, []);

  const loadSupplierRules = useCallback(async (supplierName: string) => {
    const { data: rules } = await rulesApi.getAll({ is_active: 'true' });
    if (rules) {
      const matched = rules.filter(r => {
        const pattern = (r.conditions?.supplier_pattern as string | undefined)?.toLowerCase();
        if (!pattern) return false;
        return supplierName.toLowerCase().includes(pattern) || pattern.includes(supplierName.toLowerCase());
      });
      setSupplierRules(matched);
    }
  }, []);

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return suppliers.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(q) || (s.name_kana?.toLowerCase().includes(q) ?? false) || (s.code?.toLowerCase().includes(q) ?? false);
      if (!matchSearch) return false;
      if (activeCategory !== 'all' && s.category !== activeCategory) return false;
      if (activeKana) {
        const firstChar = (s.name_kana || s.name || '')[0];
        if (activeKana === 'A-Z') return /^[A-Za-z0-9]/.test(firstChar);
        const kanaRanges: Record<string, [number, number]> = { 'あ': [0x3041, 0x304A], 'か': [0x304B, 0x3054], 'さ': [0x3055, 0x305E], 'た': [0x305F, 0x3068], 'な': [0x3069, 0x306E], 'は': [0x306F, 0x307D], 'ま': [0x307E, 0x3082], 'や': [0x3083, 0x3088], 'ら': [0x3089, 0x308D], 'わ': [0x308E, 0x3093] };
        const range = kanaRanges[activeKana];
        if (range) { const code = firstChar.charCodeAt(0); return code >= range[0] && code <= range[1]; }
      }
      return true;
    });
  }, [suppliers, searchQuery, activeCategory, activeKana]);

  const createSupplier = useCallback(async (data: Partial<Supplier>) => {
    if (!data.organization_id && orgId) data.organization_id = orgId;
    const { error } = await suppliersApi.create(data);
    if (error) { alert('登録に失敗しました: ' + error); return false; }
    await loadSuppliers(); return true;
  }, [orgId, loadSuppliers]);

  const updateSupplier = useCallback(async (id: string, data: Partial<Supplier>) => {
    const { error } = await suppliersApi.update(id, data);
    if (error) { alert('更新に失敗しました: ' + error); return false; }
    await loadSuppliers(); return true;
  }, [loadSuppliers]);

  const deleteSupplier = useCallback(async (id: string) => {
    const { error } = await suppliersApi.delete(id);
    if (error) { alert('削除に失敗しました: ' + error); return false; }
    await loadSuppliers(); return true;
  }, [loadSuppliers]);

  const addAlias = useCallback(async (supplierId: string, aliasName: string) => {
    const { error } = await suppliersApi.addAlias(supplierId, { alias_name: aliasName, source: 'manual' });
    if (error) { alert('別名の追加に失敗しました: ' + error); return false; }
    await loadAliases(supplierId); return true;
  }, [loadAliases]);

  const deleteAlias = useCallback(async (aliasId: string, supplierId: string) => {
    const { error } = await suppliersApi.deleteAlias(aliasId);
    if (error) { alert('削除に失敗しました: ' + error); return false; }
    await loadAliases(supplierId); return true;
  }, [loadAliases]);

  return {
    suppliers, loading, searchQuery, setSearchQuery,
    activeCategory, setActiveCategory, activeKana, setActiveKana,
    canEdit, orgId, filteredSuppliers,
    aliases, supplierRules, loadAliases, loadSupplierRules,
    createSupplier, updateSupplier, deleteSupplier, addAlias, deleteAlias,
  };
}
