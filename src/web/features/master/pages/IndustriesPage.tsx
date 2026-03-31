import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, ArrowLeft } from 'lucide-react';
import type { Industry, Client } from '@/types';
import { useNavigate } from 'react-router-dom';
import Modal from '@/web/shared/components/ui/Modal';
import { industriesApi, clientsApi } from '@/web/shared/lib/api/backend.api';
import { useAuth } from '@/web/app/providers/AuthProvider';

export default function IndustriesPage() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingIndustry, setEditingIndustry] = useState<Industry | null>(null);

  const userRole = userProfile?.role || 'viewer';
  const canEdit = ['admin','manager','operator'].includes(userRole);

  const [formData, setFormData] = useState({
    code: '', name: '', description: '',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [indRes, clientRes] = await Promise.all([
      industriesApi.getAll(),
      clientsApi.getAll(),
    ]);
    if (indRes.data) setIndustries(indRes.data as Industry[]);
    if (clientRes.data) setClients(clientRes.data as Client[]);
    setLoading(false);
  };

  const getClientCount = (id: string) => clients.filter(c => c.industry_id === id).length;

  const handleOpenNewModal = () => {
    setEditingIndustry(null);
    setFormData({ code: '', name: '', description: '' });
    setShowModal(true);
  };
  const handleOpenEditModal = (industry: Industry) => {
    setEditingIndustry(industry);
    setFormData({ code: industry.code, name: industry.name, description: industry.description || '' });
    setShowModal(true);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const maxSort = industries.reduce((max, s) => Math.max(max, s.sort_order), 0);
    const data = {
      code: formData.code, name: formData.name, description: formData.description || null,
      sort_order: editingIndustry ? editingIndustry.sort_order : maxSort + 1, is_active: true,
    };
    if (editingIndustry) {
      const { error } = await industriesApi.update(editingIndustry.id, data);
      if (error) { alert('更新に失敗しました: ' + error); return; }
    } else {
      const { error } = await industriesApi.create(data);
      if (error) { alert('登録に失敗しました: ' + error); return; }
    }
    setShowModal(false); setEditingIndustry(null); loadData();
  };
  const handleDelete = async (industry: Industry) => {
    const clientCount = clients.filter(c => c.industry_id === industry.id).length;
    if (clientCount > 0) { alert(`この業種は${clientCount}件の顧客に紐付いています。\n先に顧客の業種を変更してください。`); return; }
    if (!window.confirm(`「${industry.name}」を削除しますか？`)) return;
    const { error } = await industriesApi.delete(industry.id);
    if (error) alert('削除に失敗しました: ' + error); else loadData();
  };

  const filtered = industries.filter(ind => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return ind.name.toLowerCase().includes(q) || ind.code.toLowerCase().includes(q) ||
      (ind.description?.toLowerCase().includes(q) ?? false);
  });

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center gap-4 mb-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} className="text-gray-700" /></button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">顧客業種管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            業種ごとの仕訳ルール・按分率を管理します（{industries.length}件）
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="検索..." className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-56" />
        </div>
        {canEdit && (
          <button onClick={handleOpenNewModal} className="flex items-center gap-2 btn-primary"><Plus size={18} /> 新規追加</button>
        )}
      </div>

      <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">業種名</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">コード</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">説明</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">顧客数</th>
              {canEdit && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">操作</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(ind => (
              <tr key={ind.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-semibold text-gray-900">{ind.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">{ind.code}</td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-[300px] truncate">{ind.description?.slice(0, 80)}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{getClientCount(ind.id)}</span>
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleOpenEditModal(ind)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                        <Edit size={14} />
                      </button>
                      <button onClick={() => handleDelete(ind)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            {searchQuery ? '検索結果なし' : '業種が登録されていません'}
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingIndustry(null); }}
        title={editingIndustry ? `編集: ${editingIndustry.name}` : '新規業種追加'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称 <span className="text-red-500">*</span></label>
              <input type="text" required value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">コード <span className="text-red-500">*</span></label>
              <input type="text" required value={formData.code} onChange={e => setFormData(p => ({ ...p, code: e.target.value }))} className="input font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">説明（経費の特徴など）</label>
            <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} className="input" rows={3} placeholder="例: 化粧品→経費OK、食事→家事按分、一般衣服→経費NG" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => { setShowModal(false); setEditingIndustry(null); }} className="btn-secondary">キャンセル</button>
            <button type="submit" className="btn-primary">{editingIndustry ? '更新' : '登録'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
