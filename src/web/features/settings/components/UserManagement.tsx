/**
 * @module ユーザー管理セクション
 */
import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, User as UserIcon, Shield, UserCog } from 'lucide-react';
import { usersApi } from '@/web/shared/lib/api/backend.api';
import type { User } from '@/types';
import Modal from '@/web/shared/components/ui/Modal';
import { useConfirm } from '@/web/shared/hooks/useConfirm';

const ROLE_CONFIG = {
  admin:    { label: '管理者',       badgeClass: 'bg-red-100 text-red-800',   icon: <Shield size={16} className="text-red-600" />,   iconLg: <Shield size={18} className="text-red-600" />,   cardIcon: <Shield size={20} className="text-red-600" />,   desc: 'ユーザー管理+全機能' },
  manager:  { label: 'マネージャー', badgeClass: 'bg-blue-100 text-blue-800',  icon: <UserCog size={16} className="text-blue-600" />,  iconLg: <UserCog size={18} className="text-blue-600" />,  cardIcon: <UserCog size={20} className="text-blue-600" />,  desc: 'ルール承認+仕訳承認+エクスポート' },
  operator: { label: '担当者',       badgeClass: 'bg-cyan-100 text-cyan-800',  icon: <UserCog size={16} className="text-cyan-600" />,  iconLg: <UserCog size={18} className="text-cyan-600" />,  cardIcon: <UserCog size={20} className="text-cyan-600" />,  desc: '仕訳確認・修正+ルール提案' },
  viewer:   { label: '閲覧者',       badgeClass: 'bg-gray-100 text-gray-800',  icon: <UserIcon size={16} className="text-gray-600" />, iconLg: <UserIcon size={18} className="text-gray-600" />, cardIcon: <UserIcon size={20} className="text-gray-600" />, desc: '証憑アップロードと閲覧のみ' },
} as const;

const CARD_LABELS: Record<string, string> = { admin: '管理者', manager: '税理士(M)', operator: '税理士(S)', viewer: '担当者' };

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '未ログイン';
  return new Date(dateStr).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function UserManagement() {
  const { confirm, ConfirmDialogElement } = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'operator' as User['role'] });

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    const { data } = await usersApi.getAll();
    if (data) setUsers(data);
    setLoading(false);
  };

  const resetForm = () => setFormData({ name: '', email: '', password: '', role: 'operator' });

  const handleOpenNew = () => { setEditingUser(null); resetForm(); setShowModal(true); };
  const handleOpenEdit = (user: User) => { setEditingUser(user); setFormData({ name: user.name, email: user.email, password: '', role: user.role }); setShowModal(true); };
  const handleClose = () => { setShowModal(false); setEditingUser(null); resetForm(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingUser) {
        const { error } = await usersApi.update(editingUser.id, { name: formData.name, email: formData.email, role: formData.role });
        if (error) { alert(`更新に失敗しました: ${error}`); return; }
        alert('ユーザー情報を更新しました');
      } else {
        if (!formData.password || formData.password.length < 8) { alert('パスワードは8文字以上で設定してください'); return; }
        const { error } = await usersApi.create({ name: formData.name, email: formData.email, role: formData.role, status: 'active' });
        if (error) { alert(`登録に失敗しました: ${error}`); return; }
        alert('ユーザーを登録しました');
      }
      handleClose(); loadUsers();
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (user: User) => {
    if (user.role === 'admin') { alert('管理者ユーザーは削除できません'); return; }
    if (!await confirm(`ユーザー「${user.name}」を削除しますか？\n\nこの操作は取り消せません。`, { variant: 'danger' })) return;
    const { error } = await usersApi.delete(user.id);
    if (error) alert(`削除に失敗しました: ${error}`);
    else { alert('ユーザーを削除しました'); loadUsers(); }
  };

  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase()));
  const countByRole = (role: string) => users.filter(u => u.role === role).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ユーザー権限管理</h1>
          <p className="text-sm text-gray-500 mt-1">システムユーザーとその権限を管理します</p>
        </div>
        <button type="button" onClick={handleOpenNew} className="flex items-center gap-2 btn-primary"><Plus size={18} />新規ユーザー</button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-4 gap-4">
        {(['admin', 'manager', 'operator', 'viewer'] as const).map(role => (
          <div key={role} className="card">
            <div className="flex items-center gap-2 mb-2">{ROLE_CONFIG[role].cardIcon}<h3 className="text-sm font-medium text-gray-600">{CARD_LABELS[role]}</h3></div>
            <div className="text-3xl font-bold text-gray-900">{countByRole(role)}</div>
          </div>
        ))}
      </div>

      {/* ユーザー一覧 */}
      <div className="card">
        <div className="border-b border-gray-200 pb-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ユーザー一覧</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" placeholder="名前またはメールアドレスで検索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="input pl-10" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['名前', 'メールアドレス', '権限', 'ステータス', '最終ログイン', '操作'].map(h => (
                  <th key={h} className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${h === '操作' ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">ユーザーが見つかりませんでした</td></tr>
              ) : filteredUsers.map(user => {
                const cfg = ROLE_CONFIG[user.role] || ROLE_CONFIG.viewer;
                return (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap"><span className="font-medium text-gray-900">{user.name}</span></td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">{cfg.icon}<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badgeClass}`}>{cfg.label}</span></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{user.status === 'active' ? '有効' : '無効'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">{formatDateTime(user.last_login_at)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => handleOpenEdit(user)} className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="編集"><Edit size={16} /></button>
                        <button type="button" onClick={() => handleDelete(user)} disabled={user.role === 'admin'} className={`p-1.5 rounded transition-colors ${user.role === 'admin' ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:text-red-600 hover:bg-red-50'}`} title={user.role === 'admin' ? '管理者は削除できません' : '削除'}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ユーザーモーダル */}
      <Modal isOpen={showModal} onClose={handleClose} title={editingUser ? 'ユーザー編集' : '新規ユーザー登録'} size="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">名前 <span className="text-red-500">*</span></label>
            <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input" placeholder="山田太郎" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">メールアドレス <span className="text-red-500">*</span></label>
            <input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="input" placeholder="yamada@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">パスワード {!editingUser && <span className="text-red-500">*</span>}</label>
            <input type="password" required={!editingUser} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className="input" placeholder={editingUser ? '変更する場合のみ入力' : '8文字以上'} minLength={editingUser ? 0 : 8} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">権限 <span className="text-red-500">*</span></label>
            <div className="space-y-2">
              {(Object.entries(ROLE_CONFIG) as [User['role'], typeof ROLE_CONFIG.admin][]).map(([value, cfg]) => (
                <label key={value} className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="radio" name="role" value={value} checked={formData.role === value} onChange={e => setFormData({ ...formData, role: e.target.value as User['role'] })} className="mr-3" />
                  <div className="flex items-center gap-3 flex-1">
                    {cfg.iconLg}
                    <div><p className="text-sm font-medium text-gray-900">{cfg.label}</p><p className="text-xs text-gray-500">{cfg.desc}</p></div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={handleClose} className="btn-secondary" disabled={submitting}>キャンセル</button>
            <button type="submit" className="btn-primary flex items-center gap-2" disabled={submitting}>
              {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {editingUser ? '更新する' : '登録する'}
            </button>
          </div>
        </form>
      </Modal>
      {ConfirmDialogElement}
    </>
  );
}
