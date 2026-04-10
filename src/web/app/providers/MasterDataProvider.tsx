/**
 * @module マスタデータプロバイダー
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { accountItemsApi, taxCategoriesApi } from '@/web/shared/lib/api/backend.api';
import type { AccountItem, TaxCategory } from '@/types';

interface MasterDataContextType {
  accountItems: AccountItem[];
  taxCategories: TaxCategory[];
  accountMap: Map<string, string>;
  taxCatMap: Map<string, string>;
  loading: boolean;
  refresh: () => Promise<void>;
}

const MasterDataContext = createContext<MasterDataContextType>({
  accountItems: [], taxCategories: [], accountMap: new Map(), taxCatMap: new Map(), loading: true, refresh: async () => {},
});

export function useMasterData() { return useContext(MasterDataContext); }

export function MasterDataProvider({ children }: { children: React.ReactNode }) {
  const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [accountMap, setAccountMap] = useState<Map<string, string>>(new Map());
  const [taxCatMap, setTaxCatMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [acctRes, taxRes] = await Promise.all([
      accountItemsApi.getAll(),
      taxCategoriesApi.getAll(),
    ]);
    if (acctRes.data) {
      setAccountItems(acctRes.data);
      setAccountMap(new Map(acctRes.data.map(a => [a.id, a.name])));
    }
    if (taxRes.data) {
      setTaxCategories(taxRes.data);
      setTaxCatMap(new Map(taxRes.data.map(t => [t.id, t.display_name || t.name])));
    }
    setLoading(false);
    loaded.current = true;
  }, []);

  useEffect(() => { if (!loaded.current) load(); }, [load]);

  return (
    <MasterDataContext.Provider value={{ accountItems, taxCategories, accountMap, taxCatMap, loading, refresh: load }}>
      {children}
    </MasterDataContext.Provider>
  );
}
