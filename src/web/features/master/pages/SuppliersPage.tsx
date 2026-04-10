// 取引先管理ページ

import { useState } from 'react';
import { Plus, Edit, Trash2, Search, BadgeCheck } from 'lucide-react';
import Modal from '@/web/shared/components/ui/Modal';
import type { Supplier, SupplierAlias } from '@/types';
import { suppliersApi } from '@/web/shared/lib/api/backend.api';
import { useConfirm } from '@/web/shared/hooks/useConfirm';
import { useSuppliersData, SUPPLIER_CATEGORIES, KANA_INDEX } from '../hooks/useSuppliersData';

function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)} disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

export default function SuppliersPage() {
  const {
    suppliers, loading, searchQuery, setSearchQuery,
    activeCategory, setActiveCategory, activeKana, setActiveKana,
    canEdit, filteredSuppliers,
    aliases, supplierRules, loadAliases, loadSupplierRules,
    createSupplier, updateSupplier, deleteSupplier, addAlias, deleteAlias,
  } = useSuppliersData();

  const { confirm, ConfirmDialogElement } = useConfirm();
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'info' | 'aliases' | 'rules'>('info');
  const [newAliasName, setNewAliasName] = useState('');
  const [formData, setFormData] = useState({ name: '', name_kana: '', code: '', invoice_number: '', is_invoice_registered: false, category: 'other' });

  const handleOpenNew = () => { setEditingSupplier(null); setActiveModalTab('info'); setNewAliasName(''); setFormData({ name: '', name_kana: '', code: '', invoice_number: '', is_invoice_registered: false, category: 'other' }); setShowModal(true); };
  const handleOpenEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier); setActiveModalTab('info'); setNewAliasName('');
    setFormData({ name: supplier.name, name_kana: supplier.name_kana || '', code: supplier.code || '', invoice_number: supplier.invoice_number || '', is_invoice_registered: supplier.is_invoice_registered, category: supplier.category || 'other' });
    loadAliases(supplier.id); loadSupplierRules(supplier.name); setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: Partial<Supplier> = { name: formData.name, name_kana: formData.name_kana || null, code: formData.code || null, invoice_number: formData.invoice_number || null, is_invoice_registered: formData.is_invoice_registered, is_active: editingSupplier ? editingSupplier.is_active : true };
    const ok = editingSupplier ? await updateSupplier(editingSupplier.id, data) : await createSupplier(data);
    if (ok) { setShowModal(false); setEditingSupplier(null); }
  };

  const handleDelete = async (supplier: Supplier) => {
    if (!await confirm(`「${supplier.name}」を削除しますか？`, { variant: 'danger' })) return;
    await deleteSupplier(supplier.id);
  };
  const handleAddAlias = async () => { if (!newAliasName.trim() || !editingSupplier) return; if (await addAlias(editingSupplier.id, newAliasName.trim())) setNewAliasName(''); };
  const handleDeleteAlias = async (alias: SupplierAlias) => { if (!await confirm(`別名「${alias.alias_name}」を削除しますか？`, { variant: 'danger' })) return; if (editingSupplier) await deleteAlias(alias.id, editingSupplier.id); };
  const handleApproveAlias = async (alias: SupplierAlias) => { await suppliersApi.updateAlias(alias.id, { source: 'manual' }); if (editingSupplier) loadAliases(editingSupplier.id); };

  const categoryCounts: Record<string, number> = { all: suppliers.length };
  suppliers.forEach(s => { const c = s.category || 'other'; categoryCounts[c] = (categoryCounts[c] || 0) + 1; });

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">取引先管理</h1><p className="text-sm text-gray-500 mt-1">OCR・AI仕訳生成で使用する取引先マスタを管理します</p></div>
        <button type="button" onClick={handleOpenNew} disabled={!canEdit} className={`flex items-center gap-2 btn-primary ${!canEdit ? 'opacity-40 cursor-not-allowed' : ''}`}><Plus size={18} />新規取引先</button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUPPLIER_CATEGORIES.map(cat => (
          <button type="button" key={cat.key} onClick={() => { setActiveCategory(cat.key); setActiveKana(null); }}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${activeCategory === cat.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {cat.label}<span className={`ml-1 ${activeCategory === cat.key ? 'text-blue-200' : 'text-gray-400'}`}>{categoryCounts[cat.key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="border-b border-gray-200 pb-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" placeholder="取引先名・読み仮名で検索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="input pl-10" /></div>
            <div className="flex gap-0.5 flex-shrink-0">{KANA_INDEX.map(k => (<button type="button" key={k} onClick={() => setActiveKana(activeKana === k ? null : k)} className={`w-7 h-7 text-[10px] rounded transition-colors ${activeKana === k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{k}</button>))}</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200"><tr>
              {['取引先名', '読み仮名', 'カテゴリ', 'インボイス番号', '課税事業者', '操作'].map(h => (<th key={h} className={`px-4 py-2.5 text-xs font-medium text-gray-500 uppercase ${h === '操作' ? 'text-right' : 'text-left'}`}>{h}</th>))}
            </tr></thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSuppliers.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{suppliers.length === 0 ? '取引先が登録されていません' : '検索条件に一致する取引先が見つかりません'}</td></tr>
              ) : filteredSuppliers.map(supplier => (
                <tr key={supplier.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{supplier.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{supplier.name_kana || '-'}</td>
                  <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{SUPPLIER_CATEGORIES.find(c => c.key === supplier.category)?.label || '-'}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">{supplier.invoice_number || '-'}</td>
                  <td className="px-4 py-3">{supplier.is_invoice_registered ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><BadgeCheck size={12} />課税</span> : <span className="text-xs text-gray-400">未確認</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => canEdit && handleOpenEdit(supplier)} disabled={!canEdit} className={`p-1 rounded ${canEdit ? 'text-gray-600 hover:text-blue-600 hover:bg-blue-50' : 'text-gray-300 cursor-not-allowed'}`}><Edit size={18} /></button>
                      <button type="button" onClick={() => canEdit && handleDelete(supplier)} disabled={!canEdit} className={`p-1 rounded ${canEdit ? 'text-gray-600 hover:text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`}><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-gray-200 text-sm text-gray-500">{filteredSuppliers.length} 件表示 / 全 {suppliers.length} 件</div>
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingSupplier(null); }} title={editingSupplier ? `取引先編集：${editingSupplier.name}` : '新規取引先'} size="lg">
        {editingSupplier && (
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6">
            {(['info', 'aliases', 'rules'] as const).map(tab => (
              <button type="button" key={tab} onClick={() => setActiveModalTab(tab)} className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${activeModalTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                {tab === 'info' ? '基本情報' : tab === 'aliases' ? `別名 (${aliases.length})` : `ルール (${supplierRules.length})`}
              </button>
            ))}
          </div>
        )}
        {activeModalTab === 'info' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">取引先名 <span className="text-red-500">*</span></label><input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input" placeholder="例: エネオス株式会社" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">読み仮名</label><input type="text" value={formData.name_kana} onChange={e => setFormData({ ...formData, name_kana: e.target.value })} className="input" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">略称</label><input type="text" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} className="input" /></div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><span className="text-sm font-medium text-gray-700">インボイス登録事業者</span><Switch checked={formData.is_invoice_registered} onChange={v => setFormData({ ...formData, is_invoice_registered: v })} /></div>
            {formData.is_invoice_registered && <div><label className="block text-sm font-medium text-gray-700 mb-1">インボイス番号</label><input type="text" value={formData.invoice_number} onChange={e => setFormData({ ...formData, invoice_number: e.target.value })} className="input" placeholder="T1234567890123" /></div>}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label><select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="input">{SUPPLIER_CATEGORIES.filter(c => c.key !== 'all').map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
            <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => { setShowModal(false); setEditingSupplier(null); }} className="btn-secondary">キャンセル</button><button type="submit" className="btn-primary" disabled={!canEdit}>{editingSupplier ? '更新する' : '登録する'}</button></div>
          </form>
        )}
        {activeModalTab === 'aliases' && editingSupplier && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">OCRやAIが認識した名称の揺れを管理します。</p>
            <div className="space-y-2">
              {aliases.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">別名が登録されていません</p> : aliases.map(alias => (
                <div key={alias.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{alias.alias_name}</span>
                    {alias.source === 'ai_suggested' && <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">AI提案</span>}
                    {alias.source === 'ocr_learned' && <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">OCR学習</span>}
                    {alias.source === 'manual' && <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">承認済み</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {alias.source === 'ai_suggested' && canEdit && <button type="button" onClick={() => handleApproveAlias(alias)} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">承認</button>}
                    {canEdit && <button type="button" onClick={() => handleDeleteAlias(alias)} className="p-1 text-gray-400 hover:text-red-600 rounded"><Trash2 size={16} /></button>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2"><input type="text" value={newAliasName} onChange={e => setNewAliasName(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddAlias())} className="input flex-1" placeholder="別名を入力" disabled={!canEdit} /><button type="button" onClick={handleAddAlias} disabled={!canEdit || !newAliasName.trim()} className="btn-primary disabled:opacity-50"><Plus size={18} /></button></div>
            <div className="flex justify-end pt-4 border-t"><button type="button" onClick={() => setShowModal(false)} className="btn-secondary">閉じる</button></div>
          </div>
        )}
        {activeModalTab === 'rules' && editingSupplier && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">この取引先にマッチする仕訳ルールの一覧です。</p>
            {supplierRules.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">マッチするルールがありません</p> : (
              <div className="space-y-2">{supplierRules.map(rule => (
                <div key={rule.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 mb-1"><span className="text-sm font-medium text-gray-900">{rule.rule_name}</span><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${rule.scope === 'client' ? 'bg-blue-100 text-blue-700' : rule.scope === 'industry' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{rule.scope === 'client' ? '顧客別' : rule.scope === 'industry' ? '業種別' : '共通'}</span></div>
                  <div className="text-xs text-gray-500">{typeof rule.conditions?.supplier_pattern === 'string' && <span>取引先: {rule.conditions.supplier_pattern}</span>}{typeof rule.actions?.account_item_id === 'string' && <span className="ml-2">→ 勘定科目ID: {rule.actions.account_item_id.slice(0, 8)}...</span>}</div>
                </div>
              ))}</div>
            )}
            <div className="flex justify-end pt-4 border-t"><button type="button" onClick={() => setShowModal(false)} className="btn-secondary">閉じる</button></div>
          </div>
        )}
      </Modal>
      {ConfirmDialogElement}
    </div>
  );
}
