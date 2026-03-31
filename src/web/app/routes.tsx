import { Routes, Route, Navigate, useParams } from 'react-router-dom';

// web/features/ からインポート
import ClientsPage from '@/web/features/clients/pages/ClientListPage';
import UploadPage from '@/web/features/workflow/pages/UploadPage';
import OCRPage from '@/web/features/workflow/pages/OCRPage';
import ReviewPage from '@/web/features/workflow/pages/ReviewPage/ReviewPage';
import ExportPage from '@/web/features/workflow/pages/ExportPage';
import SummaryPage from '@/web/features/clients/pages/ClientSummaryPage';
import ExcludedPage from '@/web/features/excluded/pages/ExcludedPage';
import ExcludedHistoryPage from '@/web/features/excluded/pages/ExcludedHistoryPage';
import RulesIndexPage from '@/web/features/rules/pages/RulesIndexPage';
import IndustryDetailPage from '@/web/features/rules/pages/IndustryDetailPage';
import ClientListPage from '@/web/features/rules/pages/ClientListPage';
import ClientDetailPage from '@/web/features/rules/pages/ClientDetailPage';
import AccountsPage from '@/web/features/master/pages/AccountsPage';
import TaxCategoriesPage from '@/web/features/master/pages/TaxCategoriesPage';
import IndustriesPage from '@/web/features/master/pages/IndustriesPage';
import SuppliersPage from '@/web/features/master/pages/SuppliersPage';
import ItemsPage from '@/web/features/master/pages/ItemsPage';
import SettingsPage from '@/web/features/settings/pages/SettingsPage';
import ApprovalsPage from '@/web/features/approvals/pages/ApprovalsPage';

function AiCheckRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/clients/${id}/review`} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/clients" replace />} />
      <Route path="/clients" element={<ClientsPage />} />

      {/* ワークフロー */}
      <Route path="/clients/:id/summary" element={<SummaryPage />} />
      <Route path="/clients/:id/upload" element={<UploadPage />} />
      <Route path="/clients/:id/ocr" element={<OCRPage />} />
      <Route path="/clients/:id/review" element={<ReviewPage />} />
      <Route path="/clients/:id/export" element={<ExportPage />} />
      <Route path="/clients/:id/excluded" element={<ExcludedPage />} />
      <Route path="/clients/:id/excluded-history" element={<ExcludedHistoryPage />} />
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
  );
}
