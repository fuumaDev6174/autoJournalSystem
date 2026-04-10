/**
 * @module 非同期処理 hook
 * loading / error / data を一括管理する汎用 hook。
 */
import { useState, useCallback } from 'react';

interface UseAsyncReturn<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  execute: (...args: unknown[]) => Promise<T | null>;
  reset: () => void;
}

export function useAsync<T>(
  fn: (...args: unknown[]) => Promise<{ data: T | null; error: string | null }>,
  immediate = false,
): UseAsyncReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(immediate);

  const execute = useCallback(async (...args: unknown[]) => {
    setLoading(true);
    setError(null);
    const result = await fn(...args);
    setData(result.data);
    setError(result.error);
    setLoading(false);
    return result.data;
  }, [fn]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, error, loading, execute, reset };
}
