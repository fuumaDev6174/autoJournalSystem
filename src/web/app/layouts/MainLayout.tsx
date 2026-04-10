/**
 * @module メインレイアウト
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/web/app/providers/AuthProvider';
import NotificationBell from './NotificationBell';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (userProfile?.role === 'viewer') {
      navigate('/upload-only');
    }
  }, [userProfile, navigate]);

  return (
    <div className="h-screen bg-gray-100">
      <div className="flex h-full">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-12 bg-white border-b border-gray-200 flex items-center justify-end px-6 flex-shrink-0">
            <NotificationBell />
          </header>
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
