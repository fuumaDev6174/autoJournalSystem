/**
 * @module トースト通知
 * window.alert() の代替。画面右上に一時的なメッセージを表示。
 */
import { useState, useCallback, useEffect, createElement } from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: createElement(CheckCircle, { size: 18, className: 'text-green-500' }),
  error: createElement(AlertTriangle, { size: 18, className: 'text-red-500' }),
  warning: createElement(AlertTriangle, { size: 18, className: 'text-yellow-500' }),
  info: createElement(Info, { size: 18, className: 'text-blue-500' }),
};

const BG: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  warning: 'bg-yellow-50 border-yellow-200',
  info: 'bg-blue-50 border-blue-200',
};

const DURATION = 4000;
let nextId = 0;

interface UseToastReturn {
  toast: (message: string, type?: ToastType) => void;
  ToastContainer: React.ReactNode;
}

export function useToast(): UseToastReturn {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId;
    setItems(prev => [...prev, { id, message, type }]);
  }, []);

  const remove = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id));
  }, []);

  const ToastContainer = createElement(ToastList, { items, onRemove: remove });

  return { toast, ToastContainer };
}

function ToastList({ items, onRemove }: { items: ToastItem[]; onRemove: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {items.map(item => (
        <ToastEntry key={item.id} item={item} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastEntry({ item, onRemove }: { item: ToastItem; onRemove: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(item.id), DURATION);
    return () => clearTimeout(timer);
  }, [item.id, onRemove]);

  return (
    <div className={`pointer-events-auto flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg ${BG[item.type]} max-w-sm animate-[fadeIn_0.2s_ease]`}>
      {ICONS[item.type]}
      <p className="text-sm text-gray-800 flex-1">{item.message}</p>
      <button type="button" onClick={() => onRemove(item.id)} className="text-gray-400 hover:text-gray-600">
        <X size={14} />
      </button>
    </div>
  );
}
