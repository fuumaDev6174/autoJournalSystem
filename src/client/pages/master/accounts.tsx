import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import type { AccountItem, AccountCategory, TaxCategory } from '@/types';
import Modal from '@/client/components/ui/Modal';
import { supabase } from '@/client/lib/supabase';


// 不動産賃貸業のindustry id（DB登録済み）
const REAL_ESTATE_INDUSTRY_ID = 'b4124b27-de96-4675-87d9-6f08eccce3f6';

// account_categories のコード → 表示名・区分
const CATEGORY_CODE_MAP: Record<string, { label: string; filter: string }> = {
  '1': { label: '資産', filter: 'asset' },
  '2': { label: '負債', filter: 'liability' },
  '3': { label: '純資産', filter: 'equity' },
  '4': { label: '収入', filter: 'income' },
  '5': { label: '支出', filter: 'expense' },
};

type CategoryFilterType = 'all' | 'income' | 'expense' | 'asset' | 'liability';

export default function AccountsPage() {
  const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
  const [accountCategories, setAccountCategories] = useState<AccountCategory[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'general' | 'real_estate'>('general');
  const [activeCategory, setActiveCategory] = useState<CategoryFilterType>('all');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<AccountItem | null>(null);
  const [expandedDescription, setExpandedDescription] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('viewer');

  const canEdit = userRole === 'admin' || userRole === 'manager';
  const canDelete = userRole === 'admin';

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    name_kana: '',
    category_id: '',
    tax_category_id: '',
    short_name: '',
    description: '',
    sub_category: '',
  });

  useEffect(() => {
    loadMasterData();
  }, []);

  useEffect(() => {
    if (accountCategories.length > 0) {
      loadAccountItems();
    }
  }, [activeTab, showActiveOnly, accountCategories]);

  // マスタデータ（カテゴリ・税区分）を先に取得 + P1: orgId/role
  const loadMasterData = async () => {
    // ユーザー情報取得
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      const { data: userRow } = await supabase.from('users').select('organization_id, role').eq('id', authData.user.id).single();
      if (userRow) { setOrgId(userRow.organization_id); setUserRole(userRow.role); }
    }
    const [catRes, taxRes] = await Promise.all([
      supabase.from('account_categories').select('*').order('sort_order'),
      supabase.from('tax_categories').select('*').order('sort_order'),
    ]);
    if (catRes.data && catRes.data.length > 0) {
      setAccountCategories(catRes.data as AccountCategory[]);
    } else {
      // カテゴリが空の場合、loadAccountItemsが呼ばれないのでloadingを解除
      setLoading(false);
    }
    if (taxRes.data) setTaxCategories(taxRes.data as TaxCategory[]);
  };

  const loadAccountItems = async () => {
    setLoading(true);

    let query = supabase
      .from('account_items')
      .select(`
        *,
        account_category:account_categories(*),
        tax_category:tax_categories(*),
        industry:industries(*)
      `)
      .order('code', { ascending: true });

    // タブに応じて業種フィルタ
    if (activeTab === 'general') {
      query = query.is('industry_id', null);
    } else {
      query = query.eq('industry_id', REAL_ESTATE_INDUSTRY_ID);
    }

    // 有効のみ表示
    if (showActiveOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('取得エラー:', error.message);
      alert('データの取得に失敗しました: ' + error.message);
    } else if (data) {
      setAccountItems(data as AccountItem[]);
    }

    setLoading(false);
  };

  // カテゴリIDから表示名を取得
  const getCategoryName = (item: AccountItem): string => {
    const cat = item.account_category;
    if (!cat) return '-';
    return CATEGORY_CODE_MAP[cat.code]?.label ?? cat.name;
  };

  // カテゴリIDから絞り込みキーを取得
  const getCategoryFilter = (item: AccountItem): string => {
    const cat = item.account_category;
    if (!cat) return '';
    return CATEGORY_CODE_MAP[cat.code]?.filter ?? '';
  };

  // 税区分の表示名
  const getTaxCategoryName = (item: AccountItem): string => {
    if (!item.tax_category) return '対象外';
    return item.tax_category.display_name ?? item.tax_category.name;
  };

  // 新規登録モーダルを開く
  const handleOpenNewModal = () => {
    setEditingItem(null);
    resetForm();
    setShowModal(true);
  };

  // 編集モーダルを開く
  const handleOpenEditModal = (item: AccountItem) => {
    setEditingItem(item);
    setFormData({
      code: item.code,
      name: item.name,
      name_kana: item.name_kana ?? '',
      category_id: item.category_id,
      tax_category_id: item.tax_category_id ?? '',
      short_name: item.short_name ?? '',
      description: item.description ?? '',
      sub_category: item.sub_category ?? '',
    });
    setShowModal(true);
  };

  // 送信処理（CREATE / UPDATE）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.category_id) {
      alert('区分を選択してください');
      return;
    }

    const itemData: any = {
      code: formData.code,
      name: formData.name,
      name_kana: formData.name_kana || null,
      category_id: formData.category_id,
      tax_category_id: formData.tax_category_id || null,
      short_name: formData.short_name || null,
      description: formData.description || null,
      sub_category: formData.sub_category || null,
      industry_id: activeTab === 'real_estate' ? REAL_ESTATE_INDUSTRY_ID : null,
      is_default: false,
      is_system: false,
      is_active: true,
    };
    // P1: 新規作成時のみorganization_idをセット
    if (!editingItem) itemData.organization_id = orgId;

    if (editingItem) {
      const { error } = await supabase
        .from('account_items')
        .update(itemData)
        .eq('id', editingItem.id);

      if (error) {
        alert('更新に失敗しました: ' + error.message);
        return;
      }
      alert('勘定科目を更新しました');
    } else {
      const { error } = await supabase
        .from('account_items')
        .insert([itemData]);

      if (error) {
        alert('登録に失敗しました: ' + error.message);
        return;
      }
      alert('勘定科目を登録しました');
    }

    setShowModal(false);
    setEditingItem(null);
    resetForm();
    loadAccountItems();
  };

  // 削除処理
  const handleDelete = async (item: AccountItem) => {
    if (item.is_system) {
      alert('システム科目は削除できません');
      return;
    }
    if (!window.confirm(`勘定科目「${item.name}」を削除しますか？\n\nこの操作は取り消せません。`)) return;

    const { error } = await supabase
      .from('account_items')
      .delete()
      .eq('id', item.id);

    if (error) {
      alert('削除に失敗しました: ' + error.message);
    } else {
      alert('勘定科目を削除しました');
      loadAccountItems();
    }
  };

  // 有効/無効トグル
  const handleToggleActive = async (item: AccountItem) => {
    if (item.is_system && item.is_active) {
      alert('システム科目は無効にできません');
      return;
    }
    const { error } = await supabase
      .from('account_items')
      .update({ is_active: !item.is_active })
      .eq('id', item.id);

    if (!error) loadAccountItems();
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      name_kana: '',
      category_id: '',
      tax_category_id: '',
      short_name: '',
      description: '',
      sub_category: '',
    });
  };

  // フィルタリング（検索 + カテゴリ）
  const filteredItems = accountItems.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      item.name.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q) ||
      (item.short_name?.toLowerCase().includes(q) ?? false) ||
      (item.name_kana?.toLowerCase().includes(q) ?? false) ||
      (item.description?.toLowerCase().includes(q) ?? false);

    if (!matchesSearch) return false;
    if (activeCategory === 'all') return true;
    return getCategoryFilter(item) === activeCategory;
  });

  // カテゴリ別カウント
  const getCategoryCount = (filter: string) => {
    if (filter === 'all') return accountItems.length;
    return accountItems.filter((item) => getCategoryFilter(item) === filter).length;
  };

  if (loading && accountItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">勘定科目管理</h1>
          <p className="text-sm text-gray-500 mt-1">仕訳で使用する勘定科目を管理します</p>
        </div>
        <button onClick={handleOpenNewModal} disabled={!canEdit}
          className={`flex items-center gap-2 btn-primary ${!canEdit ? 'opacity-40 cursor-not-allowed' : ''}`}
          title={!canEdit ? '編集権限がありません' : ''}>
          <Plus size={18} />
          新規勘定科目
        </button>
      </div>

      {/* タブ：一般用 / 不動産賃貸業用 */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['general', 'real_estate'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setActiveCategory('all'); setSearchQuery(''); }}
            className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab === 'general' ? `一般用 (${activeTab === 'general' ? accountItems.length : '-'})` : `不動産賃貸業用 (${activeTab === 'real_estate' ? accountItems.length : '-'})`}
          </button>
        ))}
      </div>

      {/* 勘定科目一覧カード */}
      <div className="card">
        {/* 検索 + 有効のみフィルタ */}
        <div className="border-b border-gray-200 pb-4 mb-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {activeTab === 'general' ? '一般用' : '不動産賃貸業用'}勘定科目
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">有効のみ</span>
              <button
                type="button"
                onClick={() => setShowActiveOnly(!showActiveOnly)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  showActiveOnly ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showActiveOnly ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="科目名・コード・ショートカットで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10"
            />
          </div>
        </div>

        {/* カテゴリフィルタータブ */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                { key: 'all',       label: 'すべて',  color: 'bg-gray-800 text-white' },
                { key: 'income',    label: '収入',    color: 'bg-blue-600 text-white' },
                { key: 'expense',   label: '支出',    color: 'bg-red-600 text-white' },
                { key: 'asset',     label: '資産',    color: 'bg-green-600 text-white' },
                { key: 'liability', label: '負債',    color: 'bg-orange-600 text-white' },
              ] as { key: CategoryFilterType; label: string; color: string }[]
            ).map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeCategory === key
                    ? color
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {label} ({getCategoryCount(key)})
              </button>
            ))}
          </div>
        </div>

        {/* テーブル */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">コード</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">科目名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">区分</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">税区分</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">収入相手方</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">支出相手方</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ショートカット</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">知識ベース</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">状態</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                    {accountItems.length === 0
                      ? '勘定科目が登録されていません。「新規勘定科目」から追加してください。'
                      : '検索条件に一致する勘定科目が見つかりませんでした'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const contraAccount = item.default_contra_account_id
                    ? accountItems.find(a => a.id === item.default_contra_account_id)
                    : null;
                  return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-600">{item.code}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      {item.name_kana && <div className="text-[10px] text-gray-400">{item.name_kana}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        getCategoryFilter(item) === 'income' ? 'bg-blue-100 text-blue-700' :
                        getCategoryFilter(item) === 'expense' ? 'bg-red-100 text-red-700' :
                        getCategoryFilter(item) === 'asset' ? 'bg-green-100 text-green-700' :
                        getCategoryFilter(item) === 'liability' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {getCategoryName(item)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{getTaxCategoryName(item)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{contraAccount?.name || '-'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{contraAccount?.name || '-'}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">{item.short_name || '-'}</td>
                    <td className="px-4 py-3">
                      {item.description ? (
                        <button onClick={() => setExpandedDescription(expandedDescription === item.id ? null : item.id)}
                          className="text-xs text-blue-600 hover:underline">
                          {expandedDescription === item.id ? '閉じる' : '表示'}
                        </button>
                      ) : <span className="text-xs text-gray-300">-</span>}
                      {expandedDescription === item.id && item.description && (
                        <p className="text-xs text-gray-500 mt-1 max-w-[200px]">{item.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(item)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          item.is_active ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          item.is_active ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => canEdit && handleOpenEditModal(item)}
                          disabled={!canEdit}
                          className={`p-1 rounded ${canEdit ? 'text-gray-600 hover:text-blue-600 hover:bg-blue-50' : 'text-gray-300 cursor-not-allowed'}`}
                        >
                          <Edit size={18} />
                        </button>
                        {!item.is_system && (
                          <button
                            onClick={() => canDelete && handleDelete(item)}
                            disabled={!canDelete}
                            className={`p-1 rounded ${canDelete ? 'text-gray-600 hover:text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* フッター */}
        <div className="px-4 py-3 border-t border-gray-200 text-sm text-gray-500">
          {filteredItems.length} 件表示 / 全 {accountItems.length} 件
        </div>
      </div>

      {/* 登録・編集モーダル */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingItem(null); }}
        title={editingItem ? `勘定科目編集：${editingItem.name}` : '新規勘定科目'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                コード <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="input"
                placeholder="例: 111"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                科目名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input"
                placeholder="例: 現金"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">よみがな</label>
              <input
                type="text"
                value={formData.name_kana}
                onChange={(e) => setFormData({ ...formData, name_kana: e.target.value })}
                className="input"
                placeholder="例: げんきん"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ショートカット</label>
              <input
                type="text"
                value={formData.short_name}
                onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                className="input"
                placeholder="例: GENKIN"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                区分 <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                className="input"
              >
                <option value="">選択してください</option>
                {accountCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {CATEGORY_CODE_MAP[cat.code]?.label ?? cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">税区分</label>
              <select
                value={formData.tax_category_id}
                onChange={(e) => setFormData({ ...formData, tax_category_id: e.target.value })}
                className="input"
              >
                <option value="">対象外（非課税）</option>
                {taxCategories.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.display_name ?? tc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">サブカテゴリ</label>
              <input
                type="text"
                value={formData.sub_category}
                onChange={(e) => setFormData({ ...formData, sub_category: e.target.value })}
                className="input"
                placeholder="例: 流動資産"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input"
              rows={3}
              placeholder="勘定科目の説明（任意）"
            />
          </div>

          {/* 現在のタブ情報 */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            {activeTab === 'general'
              ? '一般用の勘定科目として登録されます'
              : '不動産賃貸業用の勘定科目として登録されます'}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => { setShowModal(false); setEditingItem(null); }}
              className="btn-secondary"
            >
              キャンセル
            </button>
            <button type="submit" className="btn-primary">
              {editingItem ? '更新する' : '登録する'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}