/**
 * @module モーダル hook
 * モーダルの開閉 + 編集対象アイテムを管理する汎用 hook。
 */
import { useState, useCallback } from 'react';

interface UseModalReturn<T> {
  isOpen: boolean;
  editingItem: T | null;
  open: (item?: T) => void;
  close: () => void;
}

export function useModal<T = unknown>(): UseModalReturn<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<T | null>(null);

  const open = useCallback((item?: T) => {
    setEditingItem(item ?? null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setEditingItem(null);
  }, []);

  return { isOpen, editingItem, open, close };
}
