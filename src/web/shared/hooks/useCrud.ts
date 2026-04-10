/**
 * @module CRUD hook
 * マスタデータページの共通パターン（一覧取得・作成・更新・削除 + 自動再読み込み）を抽象化。
 */
import { useState, useCallback, useEffect } from 'react';

interface CrudApi<T> {
  getAll: (...args: unknown[]) => Promise<{ data: T[] | null; error: string | null }>;
  create: (data: Partial<T>) => Promise<{ data: T | null; error: string | null }>;
  update: (id: string, data: Partial<T>) => Promise<{ data: T | null; error: string | null }>;
  delete: (id: string) => Promise<{ data: unknown; error: string | null }>;
}

interface UseCrudReturn<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (data: Partial<T>) => Promise<T | null>;
  update: (id: string, data: Partial<T>) => Promise<T | null>;
  remove: (id: string) => Promise<boolean>;
}

export function useCrud<T>(
  api: CrudApi<T>,
  fetchArgs?: unknown[],
): UseCrudReturn<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await api.getAll(...(fetchArgs || []));
    if (result.data) setItems(result.data);
    if (result.error) setError(result.error);
    setLoading(false);
  }, [api, ...(fetchArgs || [])]);

  useEffect(() => { reload(); }, [reload]);

  const create = useCallback(async (data: Partial<T>): Promise<T | null> => {
    const result = await api.create(data);
    if (result.error) { setError(result.error); return null; }
    await reload();
    return result.data;
  }, [api, reload]);

  const update = useCallback(async (id: string, data: Partial<T>): Promise<T | null> => {
    const result = await api.update(id, data);
    if (result.error) { setError(result.error); return null; }
    await reload();
    return result.data;
  }, [api, reload]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const result = await api.delete(id);
    if (result.error) { setError(result.error); return false; }
    await reload();
    return true;
  }, [api, reload]);

  return { items, loading, error, reload, create, update, remove };
}
