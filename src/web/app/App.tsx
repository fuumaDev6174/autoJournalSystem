import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { MasterDataProvider } from './providers/MasterDataProvider';
import { WorkflowProvider } from './providers/WorkflowProvider';
import MainLayout from './layouts/MainLayout';
import { AppRoutes } from './routes';
import LoginPage from '@/web/features/auth/pages/LoginPage';
import UploadOnlyPage from '@/web/features/workflow/pages/UploadOnlyPage';

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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/upload-only" element={
            <PrivateRoute>
              <UploadOnlyPage />
            </PrivateRoute>
          } />
          <Route path="/*" element={
            <PrivateRoute>
              <MasterDataProvider>
                <WorkflowProvider>
                  <MainLayout>
                    <AppRoutes />
                  </MainLayout>
                </WorkflowProvider>
              </MasterDataProvider>
            </PrivateRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
