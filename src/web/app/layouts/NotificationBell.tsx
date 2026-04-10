/**
 * @module 通知ベルコンポーネント
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  FileText,
  AlertTriangle,
  ClipboardCheck,
  Upload,
  Download,
  Info,
} from 'lucide-react';
import { useAuth } from '@/web/app/providers/AuthProvider';
import { notificationsApi } from '@/web/shared/lib/api/backend.api';
import type { Notification } from '@/types';
import { NOTIFICATION_POLL_INTERVAL } from '@/web/shared/constants/ui';

function getNotificationUrl(n: Notification): string | null {
  if (n.link_url) return n.link_url;
  if (!n.entity_type || !n.entity_id) return null;
  switch (n.entity_type) {
    case 'document': return '/review';
    case 'journal_entry': return '/review';
    default: return null;
  }
}

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  ocr_completed:   <FileText size={14} className="text-green-500" />,
  ocr_error:       <AlertTriangle size={14} className="text-red-500" />,
  approval_needed: <ClipboardCheck size={14} className="text-orange-500" />,
  approved:        <CheckCheck size={14} className="text-green-600" />,
  rejected:        <AlertTriangle size={14} className="text-red-600" />,
  upload:          <Upload size={14} className="text-blue-500" />,
  exported:        <Download size={14} className="text-purple-500" />,
};

function getNotificationIcon(type: string) {
  return NOTIFICATION_ICONS[type] ?? <Info size={14} className="text-gray-500" />;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '今';
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const d = Math.floor(hr / 24);
  return `${d}日前`;
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;
    const [recentRes, countRes] = await Promise.all([
      notificationsApi.getAll({ user_id: user.id, limit: '15' }),
      notificationsApi.getUnreadCount(user.id),
    ]);
    if (recentRes.data) setNotifications(recentRes.data);
    if (countRes.data !== null) setUnreadCount(countRes.data as unknown as number);
  }, [user?.id]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, NOTIFICATION_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleNotificationClick = async (n: Notification) => {
    if (!n.is_read) {
      await notificationsApi.markRead(n.id);
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    const url = n.link_url || getNotificationUrl(n);
    if (url) { navigate(url); setIsOpen(false); }
  };

  const handleMarkAllRead = async () => {
    if (!user?.id) return;
    await notificationsApi.markAllRead(user.id);
    setNotifications(prev => prev.map(x => ({ ...x, is_read: true })));
    setUnreadCount(0);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) loadNotifications(); }}
        aria-label={`通知${unreadCount > 0 ? ` (${unreadCount}件の未読)` : ''}`}
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">通知</h3>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-xs text-blue-600 hover:underline">すべて既読</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">通知はありません</div>
            ) : (
              notifications.map(n => (
                <button key={n.id} type="button" onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex gap-3 ${!n.is_read ? 'bg-blue-50/50' : ''}`}>
                  <div className="mt-0.5 flex-shrink-0">{getNotificationIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${!n.is_read ? 'font-medium text-gray-900' : 'text-gray-600'}`}>{n.title}</p>
                    {n.message && <p className="text-xs text-gray-400 truncate mt-0.5">{n.message}</p>}
                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.is_read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
