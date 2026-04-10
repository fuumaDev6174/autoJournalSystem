/**
 * @module 検索フィルタ hook
 * アイテムリストに対する検索クエリ + フィルタリングを管理する。
 */
import { useState, useMemo } from 'react';

interface UseSearchFilterReturn<T> {
  query: string;
  setQuery: (q: string) => void;
  filtered: T[];
}

export function useSearchFilter<T>(
  items: T[],
  searchFn: (item: T, query: string) => boolean,
): UseSearchFilterReturn<T> {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase().trim();
    return items.filter(item => searchFn(item, q));
  }, [items, query, searchFn]);

  return { query, setQuery, filtered };
}
