import React, { createContext, useContext, useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { WorkflowProvider } from './context/WorkflowContext';
import Layout from './components/layout/Layout';
import './index.css';

// ページコンポーネントのインポート
import ClientsPage from './pages/clients';
import UploadPage from './pages/upload';
import OCRPage from './pages/ocr';
import ReviewPage from './pages/review';
import ExportPage from './pages/export';
import SummaryPage from './pages/summary';
import ExcludedPage from './pages/excluded';
import ExcludedHistoryPage from './pages/excludedHistory';
import LoginPage from './pages/login';

// マスタ登録コンポーネント
import RulesIndexPage from './pages/master/rules/index';
import IndustryDetailPage from './pages/master/rules/IndustryDetail';
import ClientListPage from './pages/master/rules/ClientList';
import ClientDetailPage from './pages/master/rules/ClientDetail';
import AccountsPage from './pages/master/accounts';
import TaxCategoriesPage from './pages/master/taxCategories';
import IndustriesPage from './pages/master/industries';
import SuppliersPage from './pages/master/suppliers';
import ItemsPage from './pages/master/items';
import SettingsPage from './pages/settings';
import ApprovalsPage from './pages/approvals';
import UploadOnlyPage from './pages/uploadOnly';

// ============================================================
// Auth Context（認証状態管理）
// ============================================================
interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 初期セッション取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 認証状態変化の監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// PrivateRoute（認証必須ガード）
// ============================================================
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// ============================================================
// AIチェック旧URL → 仕訳確認へリダイレクト
// ============================================================
function AiCheckRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/clients/${id}/review`} replace />;
}

// ============================================================
// App
// ============================================================
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ─── 公開ルート（認証不要）───────────────────── */}
          <Route path="/login" element={<LoginPage />} />

          {/* ─── viewer専用（Layout外）───────────────────── */}
          <Route path="/upload-only" element={
            <PrivateRoute>
              <UploadOnlyPage />
            </PrivateRoute>
          } />

          {/* ─── 保護ルート（認証必須）───────────────────── */}
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <WorkflowProvider>
                  <Layout>
                    <Routes>
                      {/* デフォルトルート */}
                      <Route path="/" element={<Navigate to="/clients" replace />} />

                      {/* 業務メニュー */}
                      <Route path="/clients" element={<ClientsPage />} />

                      {/* ワークフロー（/clients/:id/xxx）*/}
                      <Route path="/clients/:id/summary" element={<SummaryPage />} />
                      <Route path="/clients/:id/upload" element={<UploadPage />} />
                      <Route path="/clients/:id/ocr" element={<OCRPage />} />
                      <Route path="/clients/:id/review" element={<ReviewPage />} />
                      <Route path="/clients/:id/export" element={<ExportPage />} />
                      <Route path="/clients/:id/excluded" element={<ExcludedPage />} />
                      <Route path="/clients/:id/excluded-history" element={<ExcludedHistoryPage />} />

                      {/* 旧AIチェックURL → 仕訳確認にリダイレクト */}
                      <Route path="/clients/:id/aicheck" element={<AiCheckRedirect />} />

                      {/* マスタ管理 */}
                      <Route path="/master/rules" element={<RulesIndexPage />} />
                      <Route path="/master/rules/industry/:industryId" element={<IndustryDetailPage />} />
                      <Route path="/master/rules/industry/:industryId/clients" element={<ClientListPage />} />
                      <Route path="/master/rules/industry/:industryId/client/:clientId" element={<ClientDetailPage />} />
                      <Route path="/master/accounts" element={<AccountsPage />} />
                      <Route path="/master/tax-categories" element={<TaxCategoriesPage />} />
                      <Route path="/master/industries" element={<IndustriesPage />} />
                      <Route path="/master/suppliers" element={<SuppliersPage />} />
                      <Route path="/master/items" element={<ItemsPage />} />
                      <Route path="/approvals" element={<ApprovalsPage />} />
                      <Route path="/settings" element={<SettingsPage />} />

                      {/* 404 */}
                      <Route path="*" element={<Navigate to="/clients" replace />} />
                    </Routes>
                  </Layout>
                </WorkflowProvider>
              </PrivateRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);