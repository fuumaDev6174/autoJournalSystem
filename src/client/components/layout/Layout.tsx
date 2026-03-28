import { useState, useEffect } from 'react';
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
  ClipboardCheck
} from 'lucide-react';
import { useAuth } from '../../main';
import { auth, supabase } from '../../lib/supabase';
import { useWorkflow } from '../../context/WorkflowContext';


// ============================================================
// サイドバーコンポーネント
// ============================================================
function Sidebar() {
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

  // URLパスパラメータから client_id を取得（ワークフローページにいる場合）
  const workflowMatch = useMatch("/clients/:id/*");
  const clientIdFromPath = workflowMatch?.params?.id;

  // ワークフロー系リンクに使う client_id の優先順位：
  // 1. URLパスパラメータ  2. WorkflowContextの状態
  const activeClientId = clientIdFromPath ?? currentWorkflow?.clientId ?? '';

  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    '業務': true,
    'マスタ管理': true,
    'master_基礎項目': true,
    'master_タグ管理': true,
    'master_その他': false,
  });

  const toggleSection = (label: string) => {
    setExpandedSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path: string) => location.pathname === path;

  // ワークフロー系の動的パスを生成するヘルパー
  const workflowPath = (slug: string) =>
    activeClientId ? `/clients/${activeClientId}/${slug}` : '#';

  // -------------------------------------------------------
  // メニュー順序変更:
  //   顧客一覧
  //   └ 集計・チェック
  //     └ 対象外証憑
  //   └ 証憑アップロード
  //   └ OCR処理
  //   └ 仕訳確認（AIチェック統合）
  //   └ 仕訳出力
  // -------------------------------------------------------

  // マスタ管理: サブグループ構成
  const masterSubGroups = [
    {
      key: 'master_基礎項目',
      label: '基礎項目',
      items: [
        { label: '勘定科目',       icon: <List size={16} />,       path: '/master/accounts' },
        { label: '税区分・適用税率', icon: <Receipt size={16} />,   path: '/master/tax-categories' },
        { label: '業種管理',        icon: <Briefcase size={16} />, path: '/master/industries' },
      ],
    },
    {
      key: 'master_タグ管理',
      label: 'タグ管理',
      items: [
        { label: '取引先',   icon: <Store size={16} />,   path: '/master/suppliers' },
        { label: '品目',     icon: <Package size={16} />, path: '/master/items' },
      ],
    },
    {
      key: 'master_その他',
      label: 'その他',
      items: [
        { label: 'ユーザー権限', icon: <User size={16} />, path: '/settings' },
      ],
    },
  ];

  // 集計・チェックのパス
  const summaryPath = workflowPath('summary');
  const excludedHistoryPath = workflowPath('excluded');
  const summaryActive = isActive(summaryPath);
  const excludedHistoryActive = isActive(excludedHistoryPath);

  // 仕訳確認のサブ: 対象外証憑（同じreviewページに?tab=excludedで遷移）
  const reviewPath = workflowPath('review');
  const reviewExcludedPath = reviewPath !== '#' ? `${reviewPath}?tab=excluded` : '#';
  const reviewActive = isActive(reviewPath);
  const reviewExcludedActive = location.pathname + location.search === reviewExcludedPath;

  // ワークフロー処理系メニュー（4ステップ）
  const workflowProcessItems = [
    { label: '証憑アップロード', icon: <Upload size={18} />,   path: workflowPath('upload') },
    { label: 'OCR処理',         icon: <Scan size={18} />,     path: workflowPath('ocr') },
  ];
  // 仕訳確認と仕訳出力は個別にレンダリング（サブメニュー付きのため）

  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 h-screen flex flex-col flex-shrink-0">
      {/* ロゴ */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Building2 className="text-blue-600" size={24} />
          <h1 className="text-lg font-semibold text-gray-900">仕訳自動化システム</h1>
        </div>
      </div>

      {/* メニュー */}
      <nav className="p-2 flex-1 overflow-y-auto">
        {/* ───────────── 業務セクション ───────────── */}
        <div className="mb-1">
          <button
            onClick={() => toggleSection('業務')}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <span className="flex items-center gap-2">
              <Building2 size={18} />
              業務
            </span>
            {expandedSections['業務'] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {expandedSections['業務'] && (
            <div className="mt-1 space-y-1">

              {/* ① 顧客一覧 */}
              <Link
                to="/clients"
                className={`flex items-center gap-2 px-3 py-2 ml-2 text-sm rounded-md transition-colors ${
                  isActive('/clients')
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className={isActive('/clients') ? 'text-blue-600' : 'text-gray-500'}>
                  <Users size={18} />
                </span>
                <span>顧客一覧</span>
              </Link>

              {/* 承認ダッシュボード */}
              <Link
                to="/approvals"
                className={`flex items-center gap-2 px-3 py-2 ml-2 text-sm rounded-md transition-colors ${
                  isActive('/approvals')
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className={isActive('/approvals') ? 'text-blue-600' : 'text-gray-500'}>
                  <ClipboardCheck size={18} />
                </span>
                <span>承認ダッシュボード</span>
              </Link>

              {/* ワークフロー系サブメニュー */}
              <div className="mt-1 ml-4 border-l-2 border-gray-200 space-y-0.5">

                {/* ② 集計・チェック */}
                {(() => {
                  const disabled = summaryPath === '#';
                  return (
                    <Link
                      to={summaryPath}
                      onClick={(e) => { if (disabled) e.preventDefault(); }}
                      className={`flex items-center gap-2 px-3 py-1.5 ml-2 text-sm rounded-md transition-colors ${
                        disabled
                          ? 'text-gray-400 cursor-not-allowed'
                          : summaryActive
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className={summaryActive ? 'text-blue-600' : 'text-gray-400'}>
                        <BarChart3 size={18} />
                      </span>
                      <span>集計・チェック</span>
                    </Link>
                  );
                })()}

                {/* ②-a 対象外履歴（集計の子要素）*/}
                {(() => {
                  const disabled = excludedHistoryPath === '#';
                  return (
                    <Link
                      to={excludedHistoryPath}
                      onClick={(e) => { if (disabled) e.preventDefault(); }}
                      className={`flex items-center gap-2 px-3 py-1.5 ml-6 text-sm rounded-md transition-colors ${
                        disabled
                          ? 'text-gray-400 cursor-not-allowed'
                          : excludedHistoryActive
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className={excludedHistoryActive ? 'text-blue-600' : 'text-gray-400'}>
                        <FileX size={16} />
                      </span>
                      <span className="text-xs">対象外履歴</span>
                    </Link>
                  );
                })()}

                {/* ③④ 証憑アップロード / OCR処理 */}
                {workflowProcessItems.map((item) => {
                  const active = isActive(item.path);
                  const disabled = item.path === '#';
                  return (
                    <Link
                      key={item.path + item.label}
                      to={item.path}
                      onClick={(e) => { if (disabled) e.preventDefault(); }}
                      className={`flex items-center gap-2 px-3 py-1.5 ml-2 text-sm rounded-md transition-colors ${
                        disabled
                          ? 'text-gray-400 cursor-not-allowed'
                          : active
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className={active ? 'text-blue-600' : 'text-gray-400'}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}

                {/* ⑤ 仕訳確認（サブ: 対象外証憑） */}
                {(() => {
                  const disabled = reviewPath === '#';
                  return (
                    <>
                      <Link
                        to={reviewPath}
                        onClick={(e) => { if (disabled) e.preventDefault(); }}
                        className={`flex items-center gap-2 px-3 py-1.5 ml-2 text-sm rounded-md transition-colors ${
                          disabled
                            ? 'text-gray-400 cursor-not-allowed'
                            : reviewActive && !reviewExcludedActive
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span className={reviewActive ? 'text-blue-600' : 'text-gray-400'}>
                          <Eye size={18} />
                        </span>
                        <span>仕訳確認</span>
                      </Link>
                      {/* 対象外証憑（仕訳確認のサブ）*/}
                      <Link
                        to={reviewExcludedPath}
                        onClick={(e) => { if (disabled) e.preventDefault(); }}
                        className={`flex items-center gap-2 px-3 py-1.5 ml-6 text-sm rounded-md transition-colors ${
                          disabled
                            ? 'text-gray-400 cursor-not-allowed'
                            : reviewExcludedActive
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span className={reviewExcludedActive ? 'text-blue-600' : 'text-gray-400'}>
                          <FileX size={16} />
                        </span>
                        <span className="text-xs">対象外証憑</span>
                      </Link>
                    </>
                  );
                })()}

                {/* ⑥ 仕訳出力 */}
                {(() => {
                  const exportPath = workflowPath('export');
                  const disabled = exportPath === '#';
                  const active = isActive(exportPath);
                  return (
                    <Link
                      to={exportPath}
                      onClick={(e) => { if (disabled) e.preventDefault(); }}
                      className={`flex items-center gap-2 px-3 py-1.5 ml-2 text-sm rounded-md transition-colors ${
                        disabled
                          ? 'text-gray-400 cursor-not-allowed'
                          : active
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className={active ? 'text-blue-600' : 'text-gray-400'}>
                        <Download size={18} />
                      </span>
                      <span>仕訳出力</span>
                    </Link>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* ───────────── マスタ管理セクション ───────────── */}
        <div className="mb-1">
          <button
            onClick={() => toggleSection('マスタ管理')}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <span className="flex items-center gap-2">
              <Settings size={18} />
              マスタ管理
            </span>
            {expandedSections['マスタ管理'] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {expandedSections['マスタ管理'] && (
            <div className="mt-1 space-y-0.5">
              {/* ★ 仕訳ルール管理（トップレベル） */}
              <Link
                to="/master/rules"
                className={`flex items-center gap-2 px-3 py-2 ml-2 text-sm rounded-md transition-colors ${
                  isActive('/master/rules')
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className={isActive('/master/rules') ? 'text-blue-600' : 'text-gray-500'}>
                  <Settings size={18} />
                </span>
                <span>仕訳ルール管理</span>
              </Link>

              {/* ★ サブグループ（基礎項目 / タグ管理 / その他） */}
              {masterSubGroups.map((group) => (
                <div key={group.key} className="ml-2">
                  {/* サブグループヘッダー */}
                  <button
                    onClick={() => toggleSection(group.key)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    <span>{group.label}</span>
                    {expandedSections[group.key] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {/* サブグループ内のリンク */}
                  {expandedSections[group.key] && (
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const active = isActive(item.path);
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-2 px-3 py-1.5 ml-3 text-sm rounded-md transition-colors ${
                              active
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <span className={active ? 'text-blue-600' : 'text-gray-400'}>
                              {item.icon}
                            </span>
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* ユーザー情報（サイドバー下部に固定） */}
      <div className="border-t border-gray-200 p-3 mt-auto">
        <div className="relative">
          <button onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <User size={14} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
              <p className="text-xs text-gray-500 truncate">{displayEmail}</p>
            </div>
            <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
          </button>
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute bottom-full left-0 mb-2 w-full bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <Link to="/settings" onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <Settings size={16} /><span>設定</span>
                </Link>
                <button onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                  <LogOut size={16} /><span>ログアウト</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

// ============================================================
// メインレイアウトコンポーネント
// ============================================================
interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
        if (data?.role === 'viewer') {
          navigate('/upload-only');
        }
      }
    };
    checkRole();
  }, [navigate]);

  return (
    <div className="h-screen bg-gray-100">
      <div className="flex h-full min-w-[1280px]">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}