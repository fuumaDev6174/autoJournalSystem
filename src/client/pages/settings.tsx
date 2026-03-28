import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, User as UserIcon, Shield, UserCog } from 'lucide-react';
import { usersApi } from '@/client/lib/api';
import type { User } from '@/types';
import Modal from '@/client/components/ui/Modal';


// ============================================
// ユーティリティ
// ============================================

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '未ログイン';
  return new Date(dateStr).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ============================================
// 権限ヘルパー
// ============================================

function getRoleName(role: string): string {
  switch (role) {
    case 'admin':    return '管理者';
    case 'manager':  return 'マネージャー';
    case 'operator': return '担当者';
    case 'viewer':   return '閲覧者';
    default:         return role;
  }
}

function getRoleIcon(role: string) {
  switch (role) {
    case 'admin':    return <Shield size={16} className="text-red-600" />;
    case 'manager':  return <UserCog size={16} className="text-blue-600" />;
    case 'operator': return <UserCog size={16} className="text-cyan-600" />;
    case 'viewer':   return <UserIcon size={16} className="text-gray-600" />;
  }
}

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'admin':    return 'bg-red-100 text-red-800';
    case 'manager':  return 'bg-blue-100 text-blue-800';
    case 'operator': return 'bg-cyan-100 text-cyan-800';
    case 'viewer':   return 'bg-gray-100 text-gray-800';
    default:         return role;
  }
}

function getStatusBadge(status: string) {
  return status === 'active'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">有効</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">無効</span>;
}

// ============================================
// メインコンポーネント
// ============================================

export default function SettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailPermissions, setShowDetailPermissions] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // フォーム状態
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'operator' as 'admin' | 'manager' | 'operator' | 'viewer',
  });

  // ============================================
  // データ読み込み
  // ============================================

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const response = await usersApi.getAll();
    if (response.data) {
      setUsers(response.data);
    }
    setLoading(false);
  };

  // ============================================
  // モーダル制御
  // ============================================

  const handleOpenNewModal = () => {
    setEditingUser(null);
    resetForm();
    setShowModal(true);
  };

  const handleOpenEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', password: '', role: 'operator' });
  };

  // ============================================
  // 新規登録・編集
  // ============================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingUser) {
        // 編集
        const updateData: Partial<User> = {
          name: formData.name,
          email: formData.email,
          role: formData.role,
        };

        const response = await usersApi.update(editingUser.id, updateData);
        if (response.error) {
          alert(`更新に失敗しました: ${response.error}`);
          return;
        }
        alert('ユーザー情報を更新しました');
        handleCloseModal();
        loadUsers();
      } else {
        // 新規登録
        if (!formData.password) {
          alert('パスワードを入力してください');
          return;
        }
        if (formData.password.length < 8) {
          alert('パスワードは8文字以上で設定してください');
          return;
        }

        const response = await usersApi.create({
          name: formData.name,
          email: formData.email,
          role: formData.role,
          status: 'active',
        });

        if (response.error) {
          alert(`登録に失敗しました: ${response.error}`);
          return;
        }
        alert('ユーザーを登録しました');
        handleCloseModal();
        loadUsers();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================
  // 削除
  // ============================================

  const handleDelete = async (user: User) => {
    if (user.role === 'admin') {
      alert('管理者ユーザーは削除できません');
      return;
    }
    if (!window.confirm(`ユーザー「${user.name}」を削除しますか？\n\nこの操作は取り消せません。`)) {
      return;
    }

    const response = await usersApi.delete(user.id);
    if (response.error) {
      alert(`削除に失敗しました: ${response.error}`);
    } else {
      alert('ユーザーを削除しました');
      loadUsers();
    }
  };

  // ============================================
  // フィルタリング & 集計
  // ============================================

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const adminCount    = users.filter((u) => u.role === 'admin').length;
  const managerCount  = users.filter((u) => u.role === 'manager').length;
  const operatorCount = users.filter((u) => u.role === 'operator').length;
  const viewerCount   = users.filter((u) => u.role === 'viewer').length;

  // ============================================
  // ローディング
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // レンダリング
  // ============================================

  return (
    <div className="space-y-6 p-6">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ユーザー権限管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            システムユーザーとその権限を管理します
          </p>
        </div>
        <button onClick={handleOpenNewModal} className="flex items-center gap-2 btn-primary">
          <Plus size={18} />
          新規ユーザー
        </button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={20} className="text-red-600" />
            <h3 className="text-sm font-medium text-gray-600">管理者</h3>
          </div>
          <div className="text-3xl font-bold text-gray-900">{adminCount}</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <UserCog size={20} className="text-blue-600" />
            <h3 className="text-sm font-medium text-gray-600">税理士(M)</h3>
          </div>
          <div className="text-3xl font-bold text-gray-900">{managerCount}</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <UserCog size={20} className="text-cyan-600" />
            <h3 className="text-sm font-medium text-gray-600">税理士(S)</h3>
          </div>
          <div className="text-3xl font-bold text-gray-900">{operatorCount}</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <UserIcon size={20} className="text-gray-600" />
            <h3 className="text-sm font-medium text-gray-600">担当者</h3>
          </div>
          <div className="text-3xl font-bold text-gray-900">{viewerCount}</div>
        </div>
      </div>

      {/* ユーザー一覧カード */}
      <div className="card">
        <div className="border-b border-gray-200 pb-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ユーザー一覧</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="名前またはメールアドレスで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['名前', 'メールアドレス', '権限', 'ステータス', '最終ログイン', '操作'].map((h) => (
                  <th
                    key={h}
                    className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                      h === '操作' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    ユーザーが見つかりませんでした
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isAdmin = user.role === 'admin';
                  return (
                    <tr key={user.id} className={`hover:bg-gray-50 transition-colors ${
                      (user.role as string) === 'admin' ? 'bg-red-50/30' : (user.role as string) === 'manager' ? 'bg-blue-50/30' : (user.role as string) === 'operator' ? 'bg-cyan-50/30' : ''
                    }`}>
                      {/* 名前 */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-medium text-gray-900">{user.name}</span>
                      </td>

                      {/* メールアドレス */}
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                        {user.email}
                      </td>

                      {/* 権限 */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getRoleIcon(user.role)}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeClass(user.role)}`}>
                            {getRoleName(user.role)}
                          </span>
                        </div>
                      </td>

                      {/* ステータス */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(user.status)}
                      </td>

                      {/* 最終ログイン */}
                      <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">
                        {formatDateTime(user.last_login_at)}
                      </td>

                      {/* 操作 */}
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditModal(user)}
                            className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="編集"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(user)}
                            disabled={isAdmin}
                            className={`p-1.5 rounded transition-colors ${
                              isAdmin
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-gray-600 hover:text-red-600 hover:bg-red-50'
                            }`}
                            title={isAdmin ? '管理者は削除できません' : '削除'}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 権限説明（簡易版+詳細版切り替え） */}
      <div className="card bg-blue-50 border-blue-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-blue-900">権限の説明</h3>
          <button onClick={() => setShowDetailPermissions(!showDetailPermissions)}
            className="text-xs text-blue-600 hover:underline">
            {showDetailPermissions ? '簡易表示に戻す' : '詳しく見る'}
          </button>
        </div>

        {!showDetailPermissions ? (
          /* 簡易版 */
          <div className="space-y-2 text-sm">
            {[
              { role: '管理者', color: 'text-red-700', desc: 'すべての機能にアクセス可能。ユーザー管理・組織設定の権限を持つ唯一のロール。' },
              { role: 'マネージャー', color: 'text-blue-700', desc: 'ルール承認・仕訳承認・エクスポート。顧客管理+全マスタ編集。' },
              { role: '担当者', color: 'text-cyan-700', desc: '仕訳の確認・修正、ルール提案。承認・エクスポートは不可。' },
              { role: '閲覧者', color: 'text-gray-600', desc: '証憑アップロードと閲覧のみ。編集・承認は一切不可。' },
            ].map(item => (
              <div key={item.role} className="flex items-start gap-2">
                <span className={`font-semibold whitespace-nowrap ${item.color}`}>{item.role}</span>
                <span className="text-gray-600">{item.desc}</span>
              </div>
            ))}
          </div>
        ) : (
          /* 詳細版 */
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-blue-200">
                  <th className="text-left py-2 pr-3 font-semibold text-blue-800">機能</th>
                  <th className="text-center py-2 px-2 font-semibold text-red-700">管理者</th>
                  <th className="text-center py-2 px-2 font-semibold text-blue-700">税理士(M)</th>
                  <th className="text-center py-2 px-2 font-semibold text-cyan-700">税理士(S)</th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-600">担当者</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100">
                {[
                  { fn: 'ユーザーの追加・削除', a: '○', m: '—', s: '—', st: '—' },
                  { fn: '顧客の追加・編集', a: '○', m: '○', s: '—', st: '—' },
                  { fn: '顧客の削除', a: '○', m: '—', s: '—', st: '—' },
                  { fn: '証憑アップロード', a: '○', m: '○', s: '○', st: '○' },
                  { fn: 'OCR処理の実行', a: '○', m: '○', s: '○', st: '○' },
                  { fn: '仕訳確認（draft→approved）', a: '○', m: '○', s: '○', st: '○' },
                  { fn: '仕訳確定（approved→posted）', a: '○', m: '○', s: '○', st: '○' },
                  { fn: '仕訳差し戻し', a: '○', m: '○', s: '○', st: '○' },
                  { fn: '仕訳出力（CSV/freee）', a: '○', m: '○', s: '○', st: '○' },
                  { fn: 'ワークフロー完了', a: '○', m: '○', s: '○', st: '○' },
                  { fn: '集計・レポート', a: '○', m: '○', s: '○', st: '○' },
                  { fn: '--- マスタ管理 ---', a: '', m: '', s: '', st: '' },
                  { fn: '勘定科目マスタ', a: '○', m: '○', s: '—', st: '—' },
                  { fn: '税区分マスタ', a: '○', m: '○', s: '—', st: '—' },
                  { fn: '業種マスタ', a: '○', m: '○', s: '○', st: '—' },
                  { fn: '仕訳ルール管理', a: '○', m: '○', s: '○', st: '—' },
                  { fn: '取引先マスタ', a: '○', m: '○', s: '○', st: '—' },
                  { fn: '品目マスタ', a: '○', m: '○', s: '○', st: '—' },
                  { fn: 'タグ管理', a: '○', m: '○', s: '○', st: '—' },
                  { fn: '--- 申請制（将来実装）---', a: '', m: '', s: '', st: '' },
                  { fn: 'ルール追加（仕訳確認画面から）', a: '○', m: '○', s: '申請', st: '申請' },
                  { fn: '家事按分の変更', a: '○', m: '○', s: '申請', st: '申請' },
                ].map(row => (
                  <tr key={row.fn} className={row.fn.startsWith('---') ? 'bg-blue-100/50' : ''}>
                    <td className={`py-1.5 pr-3 ${row.fn.startsWith('---') ? 'font-semibold text-blue-700 text-[10px]' : 'text-gray-700'}`}>{row.fn.replace(/---/g, '').trim()}</td>
                    {[row.a, row.m, row.s, row.st].map((v, i) => (
                      <td key={i} className={`py-1.5 px-2 text-center ${
                        v === '○' ? 'text-green-600 font-medium' : v === '申請' ? 'text-yellow-600' : 'text-gray-300'
                      }`}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 新規登録・編集モーダル */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingUser ? 'ユーザー編集' : '新規ユーザー登録'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 名前 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              名前 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder="山田太郎"
            />
          </div>

          {/* メールアドレス */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              メールアドレス <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="input"
              placeholder="yamada@example.com"
            />
          </div>

          {/* パスワード（新規のみ必須）*/}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              パスワード {!editingUser && <span className="text-red-500">*</span>}
            </label>
            <input
              type="password"
              required={!editingUser}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="input"
              placeholder={editingUser ? '変更する場合のみ入力' : '8文字以上'}
              minLength={editingUser ? 0 : 8}
            />
            <p className="text-xs text-gray-500 mt-1">
              {editingUser
                ? 'パスワードを変更する場合のみ入力してください'
                : '8文字以上で設定してください'}
            </p>
          </div>

          {/* 権限 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              権限 <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {([
                { value: 'admin',    icon: <Shield size={18} className="text-red-600" />,   label: '管理者',        desc: 'ユーザー管理+全機能' },
                { value: 'manager',  icon: <UserCog size={18} className="text-blue-600" />,  label: 'マネージャー',  desc: 'ルール承認+仕訳承認+エクスポート' },
                { value: 'operator', icon: <UserCog size={18} className="text-cyan-600" />,  label: '担当者',        desc: '仕訳確認・修正+ルール提案' },
                { value: 'viewer',   icon: <UserIcon size={18} className="text-gray-600" />, label: '閲覧者',        desc: '証憑アップロードと閲覧のみ' },
              ] as const).map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    checked={formData.role === opt.value}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as typeof formData.role })}
                    className="mr-3"
                  />
                  <div className="flex items-center gap-3 flex-1">
                    {opt.icon}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* ボタン */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={handleCloseModal}
              className="btn-secondary"
              disabled={submitting}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="btn-primary flex items-center gap-2"
              disabled={submitting}
            >
              {submitting && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {editingUser ? '更新する' : '登録する'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}