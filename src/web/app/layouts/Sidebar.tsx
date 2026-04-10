/**
 * @module サイドバーコンポーネント
 */
import { useState } from 'react';
import { Link, useLocation, useNavigate, useMatch } from 'react-router-dom';
import {
  Users,
  Upload,
  Scan,
  Eye,
  Download,
  BarChart3,
  FileX,
  Settings,
  List,
  Receipt,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  LogOut,
  User,
  Store,
  Package,
  ClipboardCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '@/web/app/providers/AuthProvider';
import { auth } from '@/web/shared/lib/supabase';
import { useWorkflow } from '@/web/app/providers/WorkflowProvider';

// ────────────────────────────────────────────────
// メニュー定義
// ────────────────────────────────────────────────

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

const MASTER_SUB_GROUPS: { key: string; label: string; items: MenuItem[] }[] = [
  {
    key: 'master_仕訳ルール',
    label: '仕訳ルール',
    items: [
      { label: 'ルール管理',     icon: <List size={16} />,       path: '/master/rules' },
      { label: '顧客業種管理',   icon: <Briefcase size={16} />,  path: '/master/industries' },
      { label: '取引先マスタ',   icon: <Store size={16} />,      path: '/master/suppliers' },
    ],
  },
  {
    key: 'master_設定',
    label: '設定',
    items: [
      { label: '勘定科目',       icon: <List size={16} />,       path: '/master/accounts' },
      { label: '税区分・適用税率', icon: <Receipt size={16} />,   path: '/master/tax-categories' },
      { label: '品目マスタ',     icon: <Package size={16} />,    path: '/master/items' },
      { label: 'ユーザー権限',   icon: <User size={16} />,       path: '/settings' },
    ],
  },
];

// 縮小時のアイコンメニュー
interface CollapsedItem {
  icon: React.ReactNode;
  title: string;
  path: string | (() => string);
  disabled?: boolean | (() => boolean);
  separator?: boolean;
}

// ────────────────────────────────────────────────
// ヘルパー
// ────────────────────────────────────────────────

function NavLink({ to, active, disabled, indent, icon, label, small }: {
  to: string; active: boolean; disabled: boolean;
  indent?: number; icon: React.ReactNode; label: string; small?: boolean;
}) {
  return (
    <Link
      to={to}
      onClick={(e) => { if (disabled) e.preventDefault(); }}
      className={`flex items-center gap-2 px-3 ${small ? 'py-1.5' : 'py-2'} ${indent ? `ml-${indent}` : ''} text-sm rounded-md transition-colors ${
        disabled ? 'text-gray-400 cursor-not-allowed'
          : active ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <span className={active ? 'text-blue-600' : 'text-gray-400'}>{icon}</span>
      <span className={small ? 'text-xs' : ''}>{label}</span>
    </Link>
  );
}

// ────────────────────────────────────────────────
// コンポーネント
// ────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentWorkflow } = useWorkflow();
  const { user } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const displayName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? '';
  const displayEmail = user?.email ?? '';

  const handleSignOut = async () => {
    await auth.signOut();
    navigate('/login');
  };

  // URLパスパラメータから client_id を取得
  const workflowMatch = useMatch("/clients/:id/*");
  const clientIdFromPath = workflowMatch?.params?.id;
  const activeClientId = clientIdFromPath ?? currentWorkflow?.clientId ?? '';

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    '業務': true,
    'マスタ管理': true,
    'master_仕訳ルール': true,
    'master_設定': false,
  });

  const toggleSection = (label: string) => {
    setExpandedSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  const workflowPath = (slug: string) => activeClientId ? `/clients/${activeClientId}/${slug}` : '#';

  // 計算済みパス
  const summaryPath = workflowPath('summary');
  const excludedHistoryPath = workflowPath('excluded');
  const reviewPath = workflowPath('review');
  const reviewExcludedPath = reviewPath !== '#' ? `${reviewPath}?tab=excluded` : '#';
  const reviewActive = isActive(reviewPath);
  const reviewExcludedActive = location.pathname + location.search === reviewExcludedPath;

  // ────────── 縮小時 ──────────
  if (collapsed) {
    const collapsedItems: CollapsedItem[] = [
      { icon: <Users size={20} />, title: '顧客一覧', path: '/clients' },
      { icon: <ClipboardCheck size={20} />, title: '承認', path: '/approvals' },
      { icon: <BarChart3 size={20} />, title: '集計・チェック', path: summaryPath, disabled: summaryPath === '#', separator: true },
      { icon: <Upload size={20} />, title: '証憑アップロード', path: workflowPath('upload'), disabled: !activeClientId },
      { icon: <Scan size={20} />, title: 'OCR処理', path: workflowPath('ocr'), disabled: !activeClientId },
      { icon: <Eye size={20} />, title: '仕訳確認', path: reviewPath, disabled: reviewPath === '#' },
      { icon: <Download size={20} />, title: '仕訳出力', path: workflowPath('export'), disabled: !activeClientId, separator: true },
      { icon: <List size={20} />, title: 'ルール管理', path: '/master/rules' },
      { icon: <Receipt size={20} />, title: '勘定科目', path: '/master/accounts' },
      { icon: <Settings size={20} />, title: '設定', path: '/settings' },
    ];

    return (
      <aside className="w-16 bg-gray-50 border-r border-gray-200 h-screen flex flex-col flex-shrink-0 transition-all duration-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-center">
          <button type="button" onClick={onToggle} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors" title="メニューを展開">
            <PanelLeftOpen size={18} />
          </button>
        </div>
        <nav className="p-1 flex-1 overflow-y-auto" aria-label="メインメニュー">
          <div className="space-y-1">
            {collapsedItems.map((item, i) => {
              const path = typeof item.path === 'function' ? item.path() : item.path;
              const dis = typeof item.disabled === 'function' ? item.disabled() : !!item.disabled;
              return (
                <div key={i}>
                  {item.separator && <div className="border-t border-gray-200 my-1.5" />}
                  <Link
                    to={path}
                    onClick={(e) => { if (dis) e.preventDefault(); }}
                    className={`flex items-center justify-center p-2.5 rounded-md transition-colors ${
                      isActive(path) ? 'bg-blue-50 text-blue-600'
                        : dis ? 'text-gray-300 cursor-not-allowed'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                    title={item.title}
                  >
                    {item.icon}
                  </Link>
                </div>
              );
            })}
          </div>
        </nav>
        <UserMenu
          collapsed
          displayName={displayName}
          displayEmail={displayEmail}
          showUserMenu={showUserMenu}
          setShowUserMenu={setShowUserMenu}
          handleSignOut={handleSignOut}
        />
      </aside>
    );
  }

  // ────────── 展開時 ──────────
  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 h-screen flex flex-col flex-shrink-0 transition-all duration-200">
      {/* ロゴ + 折りたたみボタン */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <Building2 className="text-blue-600 flex-shrink-0" size={24} />
          <h1 className="text-lg font-semibold text-gray-900 whitespace-nowrap">仕訳くん</h1>
        </div>
        <button type="button" onClick={onToggle} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0" title="メニューを縮小">
          <PanelLeftClose size={18} />
        </button>
      </div>

      <nav className="p-2 flex-1 overflow-y-auto" aria-label="メインメニュー">
        {/* ───── 業務セクション ───── */}
        <div className="mb-1">
          <button type="button" onClick={() => toggleSection('業務')}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
            <span className="flex items-center gap-2"><Building2 size={18} />業務</span>
            {expandedSections['業務'] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {expandedSections['業務'] && (
            <div className="mt-1 space-y-1">
              {/* 顧客一覧 */}
              <NavLink to="/clients" active={isActive('/clients')} disabled={false} indent={2} icon={<Users size={18} />} label="顧客一覧" />

              {/* 承認ダッシュボード */}
              <NavLink to="/approvals" active={isActive('/approvals')} disabled={false} indent={2} icon={<ClipboardCheck size={18} />} label="承認ダッシュボード" />

              {/* ワークフロー系サブメニュー */}
              <div className="mt-1 ml-4 border-l-2 border-gray-200 space-y-0.5">
                {/* 集計・チェック */}
                <NavLink to={summaryPath} active={isActive(summaryPath)} disabled={summaryPath === '#'} indent={2} icon={<BarChart3 size={18} />} label="集計・チェック" small />

                {/* 対象外履歴 */}
                <NavLink to={excludedHistoryPath} active={isActive(excludedHistoryPath)} disabled={excludedHistoryPath === '#'} indent={6} icon={<FileX size={16} />} label="対象外履歴" small />

                {/* 証憑アップロード */}
                <NavLink to={workflowPath('upload')} active={isActive(workflowPath('upload'))} disabled={workflowPath('upload') === '#'} indent={2} icon={<Upload size={18} />} label="証憑アップロード" small />

                {/* OCR処理 */}
                <NavLink to={workflowPath('ocr')} active={isActive(workflowPath('ocr'))} disabled={workflowPath('ocr') === '#'} indent={2} icon={<Scan size={18} />} label="OCR処理" small />

                {/* 仕訳確認 */}
                <NavLink to={reviewPath} active={reviewActive && !reviewExcludedActive} disabled={reviewPath === '#'} indent={2} icon={<Eye size={18} />} label="仕訳確認" small />

                {/* 対象外証憑 */}
                <NavLink to={reviewExcludedPath} active={reviewExcludedActive} disabled={reviewPath === '#'} indent={6} icon={<FileX size={16} />} label="対象外証憑" small />

                {/* 仕訳出力 */}
                <NavLink to={workflowPath('export')} active={isActive(workflowPath('export'))} disabled={workflowPath('export') === '#'} indent={2} icon={<Download size={18} />} label="仕訳出力" small />
              </div>
            </div>
          )}
        </div>

        {/* ───── マスタ管理セクション ───── */}
        <div className="mb-1">
          <button type="button" onClick={() => toggleSection('マスタ管理')}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
            <span className="flex items-center gap-2"><Settings size={18} />マスタ管理</span>
            {expandedSections['マスタ管理'] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {expandedSections['マスタ管理'] && (
            <div className="mt-1 space-y-0.5">
              {MASTER_SUB_GROUPS.map((group) => (
                <div key={group.key} className="ml-2">
                  <button type="button" onClick={() => toggleSection(group.key)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-md transition-colors">
                    <span>{group.label}</span>
                    {expandedSections[group.key] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {expandedSections[group.key] && (
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <NavLink key={item.path} to={item.path} active={isActive(item.path)} disabled={false} indent={3} icon={item.icon} label={item.label} small />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>

      <UserMenu
        collapsed={false}
        displayName={displayName}
        displayEmail={displayEmail}
        showUserMenu={showUserMenu}
        setShowUserMenu={setShowUserMenu}
        handleSignOut={handleSignOut}
      />
    </aside>
  );
}

// ────────────────────────────────────────────────
// ユーザーメニュー（サイドバー下部）
// ────────────────────────────────────────────────

function UserMenu({ collapsed, displayName, displayEmail, showUserMenu, setShowUserMenu, handleSignOut }: {
  collapsed: boolean;
  displayName: string;
  displayEmail: string;
  showUserMenu: boolean;
  setShowUserMenu: (v: boolean) => void;
  handleSignOut: () => void;
}) {
  return (
    <div className="border-t border-gray-200 p-3 mt-auto">
      <div className="relative">
        <button type="button" onClick={() => setShowUserMenu(!showUserMenu)}
          className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-2'} px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left`}>
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-blue-600" />
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                <p className="text-xs text-gray-500 truncate">{displayEmail}</p>
              </div>
              <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
            </>
          )}
        </button>
        {showUserMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
            <div className={`absolute bottom-full ${collapsed ? 'left-full ml-2' : 'left-0'} mb-2 ${collapsed ? 'w-48' : 'w-full'} bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50`}>
              <Link to="/settings" onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                <Settings size={16} /><span>設定</span>
              </Link>
              <button type="button" onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                <LogOut size={16} /><span>ログアウト</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
