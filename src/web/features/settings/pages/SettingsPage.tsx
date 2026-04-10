/**
 * @module 設定ページ
 */
import { useState } from 'react';
import UserManagement from '../components/UserManagement';
import FreeeIntegration from '../components/FreeeIntegration';
import PermissionsTable from '../components/PermissionsTable';

export default function SettingsPage() {
  const [showDetailPermissions, setShowDetailPermissions] = useState(false);

  return (
    <div className="space-y-6 p-6">
      <UserManagement />
      <PermissionsTable showDetail={showDetailPermissions} onToggle={() => setShowDetailPermissions(v => !v)} />
      <FreeeIntegration />
    </div>
  );
}
