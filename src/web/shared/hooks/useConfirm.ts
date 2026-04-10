/**
 * @module 確認ダイアログ hook
 * window.confirm() の代替。Promise ベースで使える。
 *
 * @example
 * const { confirm, ConfirmDialogElement } = useConfirm();
 * const ok = await confirm('削除しますか？');
 * // JSX内: {ConfirmDialogElement}
 */
import { useState, useCallback, createElement } from 'react';
import ConfirmDialog from '@/web/shared/components/ui/ConfirmDialog';

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
}

interface UseConfirmReturn {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  ConfirmDialogElement: React.ReactNode;
}

export function useConfirm(): UseConfirmReturn {
  const [state, setState] = useState<{
    isOpen: boolean;
    message: string;
    options: ConfirmOptions;
    resolve: ((value: boolean) => void) | null;
  }>({
    isOpen: false,
    message: '',
    options: {},
    resolve: null,
  });

  const confirm = useCallback((message: string, options: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ isOpen: true, message, options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState(prev => ({ ...prev, isOpen: false, resolve: null }));
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState(prev => ({ ...prev, isOpen: false, resolve: null }));
  }, [state.resolve]);

  const ConfirmDialogElement = createElement(ConfirmDialog, {
    isOpen: state.isOpen,
    message: state.message,
    title: state.options.title,
    confirmLabel: state.options.confirmLabel,
    cancelLabel: state.options.cancelLabel,
    variant: state.options.variant,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  });

  return { confirm, ConfirmDialogElement };
}
