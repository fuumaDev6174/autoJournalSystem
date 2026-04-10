// 品目管理ページ

import { useState } from 'react';
import { Plus, Edit, Trash2, Search, ArrowLeft, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Modal from '@/web/shared/components/ui/Modal';
import type { Item, ItemAlias } from '@/web/shared/lib/api/backend.api';
import { useConfirm } from '@/web/shared/hooks/useConfirm';
import { useItemsData, ITEM_CATEGORIES } from '../hooks/useItemsData';

export default function ItemsPage() {
  const navigate = useNavigate();
  const {
    items, loading, searchQuery, setSearchQuery, categoryFilter, setCategoryFilter,
    canEdit, filteredItems, categoryCounts, aliases, accountItems, taxCategories,
    loadAliases, createItem, updateItem, deleteItem, addAlias, deleteAlias,
  } = useItemsData();

  const { confirm, ConfirmDialogElement } = useConfirm();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'info' | 'aliases'>('info');
  const [newAliasName, setNewAliasName] = useState('');
  const [formData, setFormData] = useState({ name: '', code: '', unit: '', unit_price: '', category: '', default_account_item_id: '', default_tax_category_id: '', description: '' });

  const handleOpenNew = () => { setEditingItem(null); setActiveModalTab('info'); setNewAliasName(''); setFormData({ name: '', code: '', unit: '', unit_price: '', category: '', default_account_item_id: '', default_tax_category_id: '', description: '' }); setShowModal(true); };
  const handleOpenEdit = (item: Item) => {
    setEditingItem(item); setActiveModalTab('info'); setNewAliasName('');
    setFormData({ name: item.name, code: item.code || '', unit: item.unit || '', unit_price: item.unit_price?.toString() || '', category: item.category || '', default_account_item_id: item.default_account_item_id || '', default_tax_category_id: item.default_tax_category_id || '', description: item.description || '' });
    loadAliases(item.id); setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: Partial<Item> = { name: formData.name, code: formData.code || null, default_account_item_id: formData.default_account_item_id || null, default_tax_category_id: formData.default_tax_category_id || null, is_active: editingItem ? editingItem.is_active : true };
    const ok = editingItem ? await updateItem(editingItem.id, data) : await createItem(data);
    if (ok) { setShowModal(false); setEditingItem(null); }
  };

  const handleDelete = async (item: Item) => { if (!await confirm(`「${item.name}」を削除しますか？`, { variant: 'danger' })) return; await deleteItem(item.id); };
  const handleAddAlias = async () => { if (!newAliasName.trim() || !editingItem) return; if (await addAlias(editingItem.id, newAliasName.trim())) setNewAliasName(''); };
  const handleDeleteAlias = async (alias: ItemAlias) => { if (!await confirm(`別名「${alias.alias_name}」を削除しますか？`, { variant: 'danger' })) return; if (editingItem) await deleteAlias(alias.id, editingItem.id); };

  const getAccountName = (id: string | null) => id ? accountItems.find(a => a.id === id)?.name || '-' : '-';

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" /></div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} className="text-gray-700" /></button>
        <div className="flex-1"><h1 className="text-2xl font-bold text-gray-900">品目管理</h1><p className="text-sm text-gray-500 mt-1">仕訳に使用する品目を管理します。別名も登録できます。</p></div>
        <button type="button" onClick={handleOpenNew} disabled={!canEdit} className={`flex items-center gap-2 btn-primary ${!canEdit ? 'opacity-40 cursor-not-allowed' : ''}`}><Plus size={18} />新規品目登録</button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4"><div className="text-2xl font-bold text-gray-900 mb-1">{items.length}</div><div className="text-sm text-gray-600">全品目</div></div>
        {Object.entries(categoryCounts).slice(0, 3).map(([cat, count]) => (
          <div key={cat} className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:border-blue-300 transition-colors" onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}>
            <div className="text-2xl font-bold text-blue-600 mb-1">{count}</div><div className="text-sm text-gray-600">{cat}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md"><Search size={18} className="absolute left-3 top-2.5 text-gray-400" /><input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="品目名・コード・カテゴリで検索" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"><option value="">全カテゴリ</option>{ITEM_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200"><tr>
              {['コード', '品目名', 'カテゴリ', '単位', '単価', 'デフォルト勘定科目', '操作'].map(h => (<th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase ${h === '操作' || h === '単価' ? 'text-right' : 'text-left'}`}>{h}</th>))}
            </tr></thead>
            <tbody className="divide-y divide-gray-200">
              {filteredItems.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-500">{items.length === 0 ? '品目が登録されていません' : '該当する品目が見つかりません'}</td></tr>
              ) : filteredItems.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">{item.code || '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-sm">{item.category ? <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{item.category}</span> : <span className="text-gray-400">-</span>}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.unit || '-'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{item.unit_price != null ? `¥${Number(item.unit_price).toLocaleString()}` : '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{getAccountName(item.default_account_item_id)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => canEdit && handleOpenEdit(item)} disabled={!canEdit} className={`p-1.5 rounded ${canEdit ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-300'}`}><Edit size={16} /></button>
                      <button type="button" onClick={() => canEdit && handleDelete(item)} disabled={!canEdit} className={`p-1.5 rounded ${canEdit ? 'text-red-600 hover:bg-red-50' : 'text-gray-300'}`}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingItem(null); }} title={editingItem ? `品目の編集: ${editingItem.name}` : '新規品目登録'}>
        {editingItem && (
          <div className="flex gap-0 border-b border-gray-200 mb-4">
            <button type="button" onClick={() => setActiveModalTab('info')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeModalTab === 'info' ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent'}`}>基本情報</button>
            <button type="button" onClick={() => setActiveModalTab('aliases')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeModalTab === 'aliases' ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent'}`}>別名（表記ゆれ）</button>
          </div>
        )}
        {activeModalTab === 'info' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">品目名 <span className="text-red-500">*</span></label><input type="text" required value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="例: レギュラーガソリン" className="input" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">コード</label><input type="text" value={formData.code} onChange={e => setFormData(p => ({ ...p, code: e.target.value }))} placeholder="例: 001" className="input" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label><select value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} className="input"><option value="">-- 選択 --</option>{ITEM_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">単位</label><input type="text" value={formData.unit} onChange={e => setFormData(p => ({ ...p, unit: e.target.value }))} placeholder="例: L" className="input" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">単価</label><input type="number" value={formData.unit_price} onChange={e => setFormData(p => ({ ...p, unit_price: e.target.value }))} placeholder="例: 170" className="input" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">デフォルト勘定科目</label><select value={formData.default_account_item_id} onChange={e => setFormData(p => ({ ...p, default_account_item_id: e.target.value }))} className="input"><option value="">-- 選択 --</option>{accountItems.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">デフォルト税区分</label><select value={formData.default_tax_category_id} onChange={e => setFormData(p => ({ ...p, default_tax_category_id: e.target.value }))} className="input"><option value="">-- 選択 --</option>{taxCategories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">説明・メモ</label><textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="任意のメモ" className="input" /></div>
            <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => { setShowModal(false); setEditingItem(null); }} className="btn-secondary">キャンセル</button><button type="submit" className="btn-primary" disabled={!canEdit}>{editingItem ? '更新' : '登録'}</button></div>
          </form>
        )}
        {activeModalTab === 'aliases' && editingItem && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3"><p className="text-sm text-blue-800">OCRで読み取った品目名の表記ゆれを登録します。</p></div>
            <div className="flex gap-2"><input type="text" value={newAliasName} onChange={e => setNewAliasName(e.target.value)} placeholder="別名を入力" className="input flex-1" disabled={!canEdit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAlias(); } }} /><button type="button" onClick={handleAddAlias} disabled={!canEdit || !newAliasName.trim()} className="btn-primary disabled:opacity-40"><Plus size={16} /> 追加</button></div>
            {aliases.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">別名は登録されていません</p> : (
              <div className="space-y-2">{aliases.map(alias => (
                <div key={alias.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2"><Tag size={14} className="text-gray-400" /><span className="text-sm font-medium text-gray-700">{alias.alias_name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${alias.source === 'manual' ? 'bg-blue-100 text-blue-700' : alias.source === 'ocr_learned' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{alias.source === 'manual' ? '手動' : alias.source === 'ocr_learned' ? 'OCR学習' : 'AI提案'}</span>
                  </div>
                  {canEdit && <button type="button" onClick={() => handleDeleteAlias(alias)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>}
                </div>
              ))}</div>
            )}
          </div>
        )}
      </Modal>
      {ConfirmDialogElement}
    </div>
  );
}
