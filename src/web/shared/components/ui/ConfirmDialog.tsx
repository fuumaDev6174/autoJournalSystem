/**
 * @module 確認ダイアログ
 * window.confirm() の代替。Promise ベースの useConfirm hook と組み合わせて使用。
 */
import Modal from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen, title = '確認', message,
  confirmLabel = 'OK', cancelLabel = 'キャンセル',
  variant = 'default',
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const confirmClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-blue-600 hover:bg-blue-700 text-white';

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} size="sm">
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{message}</p>
      <div className="flex justify-end gap-3 mt-6">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${confirmClass}`}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
