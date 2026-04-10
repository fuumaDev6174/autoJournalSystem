import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import PageSuspense from '@/web/shared/components/PageSuspense';

// ─── Lazy-loaded pages ────────────────────────────
const ClientsPage = lazy(() => import('@/web/features/clients/pages/ClientListPage'));
const UploadPage = lazy(() => import('@/web/features/workflow/pages/UploadPage'));
const OCRPage = lazy(() => import('@/web/features/workflow/pages/OCRPage'));
const ReviewPage = lazy(() => import('@/web/features/workflow/pages/ReviewPage'));
const ExportPage = lazy(() => import('@/web/features/workflow/pages/ExportPage'));
const SummaryPage = lazy(() => import('@/web/features/clients/pages/ClientSummaryPage'));
const ExcludedPage = lazy(() => import('@/web/features/excluded/pages/ExcludedPage'));
const ExcludedHistoryPage = lazy(() => import('@/web/features/excluded/pages/ExcludedHistoryPage'));
const RulesIndexPage = lazy(() => import('@/web/features/rules/pages/RulesIndexPage'));
const IndustryDetailPage = lazy(() => import('@/web/features/rules/pages/IndustryDetailPage'));
const RulesClientListPage = lazy(() => import('@/web/features/rules/pages/ClientListPage'));
const ClientDetailPage = lazy(() => import('@/web/features/rules/pages/ClientDetailPage'));
const AccountsPage = lazy(() => import('@/web/features/master/pages/AccountsPage'));
const TaxCategoriesPage = lazy(() => import('@/web/features/master/pages/TaxCategoriesPage'));
const IndustriesPage = lazy(() => import('@/web/features/master/pages/IndustriesPage'));
const SuppliersPage = lazy(() => import('@/web/features/master/pages/SuppliersPage'));
const ItemsPage = lazy(() => import('@/web/features/master/pages/ItemsPage'));
const SettingsPage = lazy(() => import('@/web/features/settings/pages/SettingsPage'));
const ApprovalsPage = lazy(() => import('@/web/features/approvals/pages/ApprovalsPage'));

function AiCheckRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/clients/${id}/review`} replace />;
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSuspense />}>{children}</Suspense>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/clients" replace />} />
      <Route path="/clients" element={<Lazy><ClientsPage /></Lazy>} />

      {/* ワークフロー */}
      <Route path="/clients/:id/summary" element={<Lazy><SummaryPage /></Lazy>} />
      <Route path="/clients/:id/upload" element={<Lazy><UploadPage /></Lazy>} />
      <Route path="/clients/:id/ocr" element={<Lazy><OCRPage /></Lazy>} />
      <Route path="/clients/:id/review" element={<Lazy><ReviewPage /></Lazy>} />
      <Route path="/clients/:id/export" element={<Lazy><ExportPage /></Lazy>} />
      <Route path="/clients/:id/excluded" element={<Lazy><ExcludedPage /></Lazy>} />
      <Route path="/clients/:id/excluded-history" element={<Lazy><ExcludedHistoryPage /></Lazy>} />
      <Route path="/clients/:id/aicheck" element={<AiCheckRedirect />} />

      {/* マスタ管理 */}
      <Route path="/master/rules" element={<Lazy><RulesIndexPage /></Lazy>} />
      <Route path="/master/rules/industry/:industryId" element={<Lazy><IndustryDetailPage /></Lazy>} />
      <Route path="/master/rules/industry/:industryId/clients" element={<Lazy><RulesClientListPage /></Lazy>} />
      <Route path="/master/rules/industry/:industryId/client/:clientId" element={<Lazy><ClientDetailPage /></Lazy>} />
      <Route path="/master/accounts" element={<Lazy><AccountsPage /></Lazy>} />
      <Route path="/master/tax-categories" element={<Lazy><TaxCategoriesPage /></Lazy>} />
      <Route path="/master/industries" element={<Lazy><IndustriesPage /></Lazy>} />
      <Route path="/master/suppliers" element={<Lazy><SuppliersPage /></Lazy>} />
      <Route path="/master/items" element={<Lazy><ItemsPage /></Lazy>} />
      <Route path="/approvals" element={<Lazy><ApprovalsPage /></Lazy>} />
      <Route path="/settings" element={<Lazy><SettingsPage /></Lazy>} />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/clients" replace />} />
    </Routes>
  );
}
