import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, ArrowLeft, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Modal from '@/web/shared/components/ui/Modal';
import { itemsApi, accountItemsApi, taxCategoriesApi } from '@/web/shared/lib/api/backend.api';
import type { Item, ItemAlias } from '@/web/shared/lib/api/backend.api';
import { useAuth } from '@/web/app/providers/AuthProvider';

interface AccountItemOption { id: string; code: string; name: string; }
interface TaxCategoryOption { id: string; name: string; }

// ============================================
// カテゴリ定義（品目の分類）
// ============================================
const ITEM_CATEGORIES = [
  '燃料', '事務用品', '飲食', '交通', '通信', '消耗品',
  '設備', '衣類', '医療・健康', '美容', '教育', 'その他',
];

// ============================================
// メインコンポーネント
// ============================================
export default function ItemsPage() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'info' | 'aliases'>('info');
  const [aliases, setAliases] = useState<ItemAlias[]>([]);
  const [newAliasName, setNewAliasName] = useState('');
  const [accountItems, setAccountItems] = useState<AccountItemOption[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategoryOption[]>([]);

  const orgId = userProfile?.organization_id || null;
  const userRole = userProfile?.role || 'viewer';
  const canEdit = ['admin','manager','operator'].includes(userRole);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    unit: '',
    unit_price: '',
    category: '',
    default_account_item_id: '',
    default_tax_category_id: '',
    description: '',
  });

  useEffect(() => { loadItems(); loadMasters(); }, []);

  // ============================================
  // データ取得
  // ============================================
  const loadItems = async () => {
    setLoading(true);
    const { data, error } = await itemsApi.getAll({ is_active: 'true' });
    if (error) console.error('品目取得エラー:', error);
    if (data) setItems(data as Item[]);
    setLoading(false);
  };

  const loadMasters = async () => {
    const { data: accounts } = await accountItemsApi.getAll({ is_active: 'true' });
    if (accounts) setAccountItems(accounts);

    const { data: taxCats } = await taxCategoriesApi.getAll();
    if (taxCats) setTaxCategories(taxCats);
  };

  const loadAliases = async (itemId: string) => {
    const { data } = await itemsApi.getAliases(itemId);
    if (data) setAliases(data as ItemAlias[]);
  };

  // ============================================
  // モーダル操作
  // ============================================
  const handleOpenNewModal = () => {
    setEditingItem(null);
    setActiveModalTab('info');
    setAliases([]);
    setNewAliasName('');
    setFormData({ name: '', code: '', unit: '', unit_price: '', category: '', default_account_item_id: '', default_tax_category_id: '', description: '' });
    setShowModal(true);
  };

  const handleOpenEditModal = (item: Item) => {
    setEditingItem(item);
    setActiveModalTab('info');
    setAliases([]);
    setNewAliasName('');
    setFormData({
      name: item.name,
      code: item.code || '',
      unit: item.unit || '',
      unit_price: item.unit_price?.toString() || '',
      category: item.category || '',
      default_account_item_id: item.default_account_item_id || '',
      default_tax_category_id: item.default_tax_category_id || '',
      description: item.description || '',
    });
    loadAliases(item.id);
    setShowModal(true);
  };

  // ============================================
  // CRUD操作
  // ============================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<Item> = {
      name: formData.name,
      code: formData.code || null,
      default_account_item_id: formData.default_account_item_id || null,
      default_tax_category_id: formData.default_tax_category_id || null,
      is_active: editingItem ? editingItem.is_active : true,
    };
    const data = payload;
    if (!editingItem) (data as Record<string, unknown>).organization_id = orgId;

    if (editingItem) {
      const { error } = await itemsApi.update(editingItem.id, data);
      if (error) { alert('更新に失敗しました: ' + error); return; }
    } else {
      const { error } = await itemsApi.create(data);
      if (error) { alert('登録に失敗しました: ' + error); return; }
    }

    setShowModal(false);
    setEditingItem(null);
    loadItems();
  };

  const handleDelete = async (item: Item) => {
    if (!window.confirm(`「${item.name}」を削除しますか？`)) return;
    const { error } = await itemsApi.delete(item.id);
    if (error) alert('削除に失敗しました: ' + error);
    else loadItems();
  };

  // ============================================
  // 別名管理
  // ============================================
  const handleAddAlias = async () => {
    if (!newAliasName.trim() || !editingItem) return;
    const { error } = await itemsApi.addAlias(editingItem.id, {
      alias_name: newAliasName.trim(),
      source: 'manual',
    });
    if (error) { alert('別名の追加に失敗しました: ' + error); return; }
    setNewAliasName('');
    loadAliases(editingItem.id);
  };

  const handleDeleteAlias = async (alias: ItemAlias) => {
    if (!window.confirm(`別名「${alias.alias_name}」を削除しますか？`)) return;
    const { error } = await itemsApi.deleteAlias(alias.id);
    if (error) alert('削除に失敗しました: ' + error);
    else if (editingItem) loadAliases(editingItem.id);
  };

  // ============================================
  // フィルタリング
  // ============================================
  const filtered = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.code?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (item.category?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesCategory = !categoryFilter || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // カテゴリ別件数
  const categoryCounts = items.reduce((acc, item) => {
    const cat = item.category || 'その他';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const getAccountName = (id: string | null) => {
    if (!id) return '-';
    return accountItems.find(a => a.id === id)?.name || '-';
  };

  // ============================================
  // レンダリング
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

  return (
    <div className="space-y-6 p-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">品目管理</h1>
          <p className="text-sm text-gray-500 mt-1">仕訳に使用する品目を管理します。別名（表記ゆれ）も登録できます。</p>
        </div>
        <button onClick={handleOpenNewModal} disabled={!canEdit}
          className={`flex items-center gap-2 btn-primary ${!canEdit ? 'opacity-40 cursor-not-allowed' : ''}`}>
          <Plus size={18} />
          新規品目登録
        </button>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900 mb-1">{items.length}</div>
          <div className="text-sm text-gray-600">全品目</div>
        </div>
        {Object.entries(categoryCounts).slice(0, 3).map(([cat, count]) => (
          <div key={cat} className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:border-blue-300 transition-colors"
            onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}>
            <div className="text-2xl font-bold text-blue-600 mb-1">{count}</div>
            <div className="text-sm text-gray-600">{cat}</div>
          </div>
        ))}
      </div>

      {/* 検索 + カテゴリフィルター */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="品目名・コード・カテゴリで検索"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">全カテゴリ</option>
          {ITEM_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">コード</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">品目名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">カテゴリ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">単位</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">単価</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">デフォルト勘定科目</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                    {items.length === 0 ? '品目が登録されていません。「新規品目登録」から追加してください。' : '該当する品目が見つかりません。'}
                  </td>
                </tr>
              ) : filtered.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">{item.code || '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-sm">
                    {item.category ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{item.category}</span>
                    ) : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.unit || '-'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">
                    {item.unit_price != null ? `¥${Number(item.unit_price).toLocaleString()}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{getAccountName(item.default_account_item_id)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => canEdit && handleOpenEditModal(item)} disabled={!canEdit}
                        className={`p-1.5 rounded ${canEdit ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-300 cursor-not-allowed'}`} title="編集">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => canEdit && handleDelete(item)} disabled={!canEdit}
                        className={`p-1.5 rounded ${canEdit ? 'text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`} title="削除">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== モーダル ===== */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingItem(null); }}
        title={editingItem ? `品目の編集: ${editingItem.name}` : '新規品目登録'}>

        {/* モーダルタブ */}
        {editingItem && (
          <div className="flex gap-0 border-b border-gray-200 mb-4">
            <button onClick={() => setActiveModalTab('info')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeModalTab === 'info' ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent'}`}>
              基本情報
            </button>
            <button onClick={() => setActiveModalTab('aliases')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeModalTab === 'aliases' ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent'}`}>
              別名（表記ゆれ）
            </button>
          </div>
        )}

        {/* 基本情報タブ */}
        {activeModalTab === 'info' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">品目名 <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  placeholder="例: レギュラーガソリン" className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">コード</label>
                <input type="text" value={formData.code} onChange={e => setFormData(p => ({ ...p, code: e.target.value }))}
                  placeholder="例: 001" className="input" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
                <select value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} className="input">
                  <option value="">-- 選択 --</option>
                  {ITEM_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">単位</label>
                <input type="text" value={formData.unit} onChange={e => setFormData(p => ({ ...p, unit: e.target.value }))}
                  placeholder="例: L, 個, 箱" className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">単価</label>
                <input type="number" value={formData.unit_price} onChange={e => setFormData(p => ({ ...p, unit_price: e.target.value }))}
                  placeholder="例: 170" className="input" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">デフォルト勘定科目</label>
                <select value={formData.default_account_item_id} onChange={e => setFormData(p => ({ ...p, default_account_item_id: e.target.value }))} className="input">
                  <option value="">-- 選択 --</option>
                  {accountItems.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">デフォルト税区分</label>
                <select value={formData.default_tax_category_id} onChange={e => setFormData(p => ({ ...p, default_tax_category_id: e.target.value }))} className="input">
                  <option value="">-- 選択 --</option>
                  {taxCategories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">説明・メモ</label>
              <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                rows={2} placeholder="任意のメモ" className="input" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => { setShowModal(false); setEditingItem(null); }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                キャンセル
              </button>
              <button type="submit" className="btn-primary" disabled={!canEdit}>
                {editingItem ? '更新' : '登録'}
              </button>
            </div>
          </form>
        )}

        {/* 別名タブ */}
        {activeModalTab === 'aliases' && editingItem && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                OCRで読み取った品目名の表記ゆれを登録します。例えば「ガソリン」に対して「レギュラーガソリン」「Regular」等を登録すると、自動で紐づけられます。
              </p>
            </div>

            {/* 追加フォーム */}
            <div className="flex gap-2">
              <input type="text" value={newAliasName} onChange={e => setNewAliasName(e.target.value)}
                placeholder="別名を入力" className="input flex-1" disabled={!canEdit}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAlias(); } }} />
              <button onClick={handleAddAlias} disabled={!canEdit || !newAliasName.trim()}
                className="btn-primary disabled:opacity-40">
                <Plus size={16} /> 追加
              </button>
            </div>

            {/* 一覧 */}
            {aliases.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">別名は登録されていません</p>
            ) : (
              <div className="space-y-2">
                {aliases.map(alias => (
                  <div key={alias.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Tag size={14} className="text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">{alias.alias_name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        alias.source === 'manual' ? 'bg-blue-100 text-blue-700' :
                        alias.source === 'ocr_learned' ? 'bg-green-100 text-green-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {alias.source === 'manual' ? '手動' : alias.source === 'ocr_learned' ? 'OCR学習' : 'AI提案'}
                      </span>
                    </div>
                    {canEdit && (
                      <button onClick={() => handleDeleteAlias(alias)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}