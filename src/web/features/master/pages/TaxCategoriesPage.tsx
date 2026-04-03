import { useState, useEffect } from 'react';
import { ChevronDown, Search, Plus, Edit, Trash2, Percent } from 'lucide-react';
import type { TaxCategory, Client } from '@/types';
import Modal from '@/web/shared/components/ui/Modal';
import { taxCategoriesApi, taxRatesApi, clientTaxSettingsApi, clientsApi } from '@/web/shared/lib/api/backend.api';
import { useAuth } from '@/web/app/providers/AuthProvider';


// ============================================
// 型定義
// ============================================
interface TaxRate {
  id: string;
  rate: number;
  name: string;
  is_current: boolean;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
}

interface ClientTaxSetting {
  tax_category_id: string;
  use_as_default: boolean;
  use_for_income: boolean;
  use_for_expense: boolean;
}

function Switch({ checked, onChange, disabled }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => onChange?.(!checked)} disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

// ============================================
// メインコンポーネント
// ============================================
export default function TaxCategoriesPage() {
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientSettings, setClientSettings] = useState<ClientTaxSetting[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense'>('all');
  const [activeSection, setActiveSection] = useState<'categories' | 'rates'>('categories');
  const [loading, setLoading] = useState(true);
  const { userProfile } = useAuth();

  const userRole = userProfile?.role || 'viewer';
  const canEditTaxCat = userRole === 'admin' || userRole === 'manager';
  const canEditSettings = userRole === 'admin' || userRole === 'manager';

  // 税区分詳細モーダル
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<TaxCategory | null>(null);
  const [editSettings, setEditSettings] = useState<ClientTaxSetting>({ tax_category_id: '', use_as_default: false, use_for_income: false, use_for_expense: false });

  // 税率モーダル
  const [showRateModal, setShowRateModal] = useState(false);
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [rateForm, setRateForm] = useState({ name: '', rate: '', is_current: true });

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (selectedClientId) loadClientSettings(selectedClientId); else setClientSettings([]); }, [selectedClientId]);

  const loadData = async () => {
    setLoading(true);
    const [taxRes, rateRes, clientRes] = await Promise.all([
      taxCategoriesApi.getAll(),
      taxRatesApi.getAll(),
      clientsApi.getAll({ status: 'active' }),
    ]);
    if (taxRes.data) setTaxCategories(taxRes.data as TaxCategory[]);
    if (rateRes.data) setTaxRates(rateRes.data as TaxRate[]);
    if (clientRes.data) setClients(clientRes.data as Client[]);
    setLoading(false);
  };

  const loadClientSettings = async (clientId: string) => {
    try {
      const { data } = await clientTaxSettingsApi.getByClient(clientId);
      if (data) setClientSettings(data as ClientTaxSetting[]);
    } catch { setClientSettings([]); }
  };

  const getClientSetting = (catId: string): ClientTaxSetting => {
    const found = clientSettings.find(s => s.tax_category_id === catId);
    if (found) return found;
    const cat = taxCategories.find(c => c.id === catId);
    if (!cat) return { tax_category_id: catId, use_as_default: false, use_for_income: false, use_for_expense: false };
    return { tax_category_id: catId, use_as_default: cat.is_default ?? false, use_for_income: isIncome(cat), use_for_expense: isExpense(cat) };
  };

  const isIncome = (cat: TaxCategory) => cat.direction === '売上' || cat.direction === 'その他';
  const isExpense = (cat: TaxCategory) => cat.direction === '仕入' || cat.direction === 'その他';

  // ============================================
  // 税区分詳細モーダル
  // ============================================
  const handleOpenDetail = (cat: TaxCategory) => {
    setSelectedCategory(cat);
    setEditSettings({ ...getClientSetting(cat.id) });
    setShowDetailModal(true);
  };

  const handleSaveSettings = async () => {
    if (!selectedClientId || !selectedCategory) { alert('顧客を選択してから設定を保存してください'); return; }
    try {
      await clientTaxSettingsApi.upsert({
        client_id: selectedClientId, tax_category_id: selectedCategory.id,
        use_as_default: editSettings.use_as_default, use_for_income: editSettings.use_for_income, use_for_expense: editSettings.use_for_expense,
      });
      await loadClientSettings(selectedClientId);
      setShowDetailModal(false);
    } catch { alert('保存に失敗しました'); }
  };

  // テーブル行から直接スイッチ切り替え（顧客選択時のみ）
  const handleQuickToggle = async (catId: string, field: 'use_as_default' | 'use_for_income' | 'use_for_expense', value: boolean) => {
    if (!selectedClientId) return;
    const current = getClientSetting(catId);
    const updated = { ...current, tax_category_id: catId, [field]: value };
    try {
      await clientTaxSettingsApi.upsert({
        client_id: selectedClientId, tax_category_id: catId,
        use_as_default: updated.use_as_default, use_for_income: updated.use_for_income, use_for_expense: updated.use_for_expense,
      });
      await loadClientSettings(selectedClientId);
    } catch { alert('設定の保存に失敗しました'); }
  };

  // ============================================
  // 税率 CRUD
  // ============================================
  const handleOpenNewRate = () => {
    setEditingRate(null);
    setRateForm({ name: '', rate: '', is_current: true });
    setShowRateModal(true);
  };

  const handleOpenEditRate = (rate: TaxRate) => {
    setEditingRate(rate);
    setRateForm({ name: rate.name, rate: (rate.rate * 100).toString(), is_current: rate.is_current });
    setShowRateModal(true);
  };

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: rateForm.name,
      rate: Number(rateForm.rate) / 100,
      is_current: rateForm.is_current,
    };

    if (editingRate) {
      const { error } = await taxRatesApi.update(editingRate.id, data);
      if (error) { alert('更新に失敗しました: ' + error); return; }
    } else {
      const { error } = await taxRatesApi.create(data);
      if (error) { alert('登録に失敗しました: ' + error); return; }
    }
    setShowRateModal(false);
    loadData();
  };

  const handleDeleteRate = async (rate: TaxRate) => {
    if (!window.confirm(`税率「${rate.name}」を削除しますか？\n\n関連する税区分の紐づけが外れます。`)) return;
    const { error } = await taxRatesApi.delete(rate.id);
    if (error) alert('削除に失敗しました: ' + error);
    else loadData();
  };

  const handleToggleRateCurrent = async (rate: TaxRate) => {
    const { error } = await taxRatesApi.update(rate.id, { is_current: !rate.is_current });
    if (error) { alert('税率の更新に失敗しました: ' + error); return; }
    loadData();
  };

  // ============================================
  // フィルタリング
  // ============================================
  const filteredCategories = taxCategories.filter(cat => {
    const matchesSearch = cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cat.display_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      cat.code.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeTab === 'income') return isIncome(cat);
    if (activeTab === 'expense') return isExpense(cat);
    return true;
  });

  // 税区分に紐づく税率名を取得
  const getRateName = (cat: TaxCategory) => {
    if (!cat.current_tax_rate_id) return '-';
    const rate = taxRates.find(r => r.id === cat.current_tax_rate_id);
    return rate ? `${rate.name} (${(rate.rate * 100).toFixed(0)}%)` : '-';
  };

  const getDirectionLabel = (cat: TaxCategory) => {
    if (cat.direction === 'その他') return '共通';
    if (cat.direction === '売上') return '収入';
    if (cat.direction === '仕入') return '支出';
    return cat.direction;
  };

  const incomeCount = taxCategories.filter(c => isIncome(c)).length;
  const expenseCount = taxCategories.filter(c => isExpense(c)).length;
  const selectedClientName = clients.find(c => c.id === selectedClientId)?.name ?? '';

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">税区分・適用税率管理</h1>
          <p className="text-sm text-gray-500 mt-1">税区分マスタ（47項目・変更不可）と、適用税率のサブマスタを管理します。</p>
        </div>
      </div>

      {/* セクション切り替え */}
      <div className="flex gap-2">
        <button onClick={() => setActiveSection('categories')}
          className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeSection === 'categories' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
          税区分一覧
        </button>
        <button onClick={() => setActiveSection('rates')}
          className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${activeSection === 'rates' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
          <Percent size={16} /> 適用税率マスタ
        </button>
      </div>

      {/* ===== 税区分一覧セクション ===== */}
      {activeSection === 'categories' && (
        <>
          {/* 顧客選択 */}
          <div className="card">
            <h2 className="text-sm font-medium text-gray-700 mb-2">顧客別設定を確認する（任意）</h2>
            <div className="relative max-w-sm">
              <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} className="input appearance-none pr-10">
                <option value="">全体のマスタ設定を表示</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
            </div>
            {selectedClientId && (
              <p className="text-xs text-blue-600 mt-2">{selectedClientName} の設定を表示中。</p>
            )}
          </div>

          {/* サマリー */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '税区分数', count: taxCategories.length, color: 'text-gray-900', bg: 'bg-gray-50' },
              { label: 'デフォルト', count: taxCategories.filter(c => c.is_default).length, color: 'text-green-600', bg: 'bg-green-50' },
              { label: '収入用', count: incomeCount, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: '支出用', count: expenseCount, color: 'text-red-600', bg: 'bg-red-50' },
            ].map(item => (
              <div key={item.label} className={`${item.bg} rounded-lg p-4 text-center`}>
                <div className={`text-2xl font-bold ${item.color} mb-1`}>{item.count}</div>
                <div className="text-xs text-gray-600">{item.label}</div>
              </div>
            ))}
          </div>

          {/* 税区分テーブル */}
          <div className="card">
            <div className="border-b border-gray-200 pb-4 mb-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">税区分一覧</h2>
              <div className="flex items-center gap-2 mb-4">
                {([
                  { key: 'all' as const, label: `すべて (${taxCategories.length})` },
                  { key: 'income' as const, label: `収入 (${incomeCount})` },
                  { key: 'expense' as const, label: `支出 (${expenseCount})` },
                ]).map(({ key, label }) => (
                  <button key={key} onClick={() => setActiveTab(key)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg ${activeTab === key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input type="text" placeholder="税区分名、コードで検索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="input pl-10" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">税区分</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">説明</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">デフォルト</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">収入</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">支出</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">詳細</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredCategories.map(cat => {
                    const setting = selectedClientId ? getClientSetting(cat.id) : null;
                    const isDefault = setting ? setting.use_as_default : cat.is_default;
                    const isIncomeCat = setting ? setting.use_for_income : isIncome(cat);
                    const isExpenseCat = setting ? setting.use_for_expense : isExpense(cat);
                    return (
                      <tr key={cat.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{cat.display_name ?? cat.name}</div>
                          <div className="text-xs text-gray-400 font-mono">{cat.code}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 max-w-[300px]">{cat.description || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <Switch checked={isDefault} disabled={!selectedClientId || !canEditSettings}
                            onChange={v => selectedClientId && handleQuickToggle(cat.id, 'use_as_default', v)} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch checked={isIncomeCat} disabled={!selectedClientId || !canEditSettings}
                            onChange={v => selectedClientId && handleQuickToggle(cat.id, 'use_for_income', v)} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch checked={isExpenseCat} disabled={!selectedClientId || !canEditSettings}
                            onChange={v => selectedClientId && handleQuickToggle(cat.id, 'use_for_expense', v)} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => handleOpenDetail(cat)} className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded text-xs">
                            詳細
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 text-sm text-gray-500">
              {filteredCategories.length} 件表示 / 全 {taxCategories.length} 件
            </div>
          </div>
        </>
      )}

      {/* ===== 適用税率マスタセクション ===== */}
      {activeSection === 'rates' && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">適用税率マスタ</h2>
              <p className="text-sm text-gray-500 mt-1">税区分に紐づく税率を管理します。仕訳確認画面の税率選択に反映されます。</p>
            </div>
            <button onClick={handleOpenNewRate} disabled={!canEditTaxCat}
              className={`flex items-center gap-2 btn-primary ${!canEditTaxCat ? 'opacity-40 cursor-not-allowed' : ''}`}>
              <Plus size={18} /> 税率を追加
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">税率名</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">税率</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">有効</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">紐づく税区分</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {taxRates.map(rate => {
                  const linkedCategories = taxCategories.filter(c => c.current_tax_rate_id === rate.id);
                  return (
                    <tr key={rate.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.name}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono font-semibold">{(rate.rate * 100).toFixed(0)}%</td>
                      <td className="px-4 py-3 text-center">
                        <Switch checked={rate.is_current} onChange={() => handleToggleRateCurrent(rate)} disabled={!canEditTaxCat} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {linkedCategories.length === 0 ? (
                            <span className="text-xs text-gray-400">紐づけなし</span>
                          ) : linkedCategories.slice(0, 5).map(c => (
                            <span key={c.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                              {c.display_name ?? c.name}
                            </span>
                          ))}
                          {linkedCategories.length > 5 && (
                            <span className="text-xs text-gray-400">+{linkedCategories.length - 5}件</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => canEditTaxCat && handleOpenEditRate(rate)} disabled={!canEditTaxCat}
                            className={`p-1.5 rounded ${canEditTaxCat ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-300 cursor-not-allowed'}`} title="編集">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => canEditTaxCat && handleDeleteRate(rate)} disabled={!canEditTaxCat}
                            className={`p-1.5 rounded ${canEditTaxCat ? 'text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`} title="削除">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {taxRates.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">税率が登録されていません</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 説明 */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2">適用税率について</h3>
            <p className="text-sm text-blue-800">
              税区分（例: 課対仕入10%）に対して、適用される税率（例: 標準税率10%）を紐づけます。
              税率のON/OFFを切り替えると、仕訳確認画面の税率選択から表示/非表示が切り替わります。
              税率改正時は新しい税率を追加し、旧税率のOFFにすることで対応できます。
            </p>
          </div>
        </div>
      )}

      {/* ===== 税区分詳細モーダル ===== */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)}
        title={`税区分設定：${selectedCategory?.display_name ?? selectedCategory?.name}`} size="md">
        {selectedCategory && (
          <div className="space-y-5">
            <div className="bg-gray-50 rounded-lg p-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">コード：</span><span className="font-mono">{selectedCategory.code}</span></div>
                <div><span className="text-gray-500">種類：</span>{selectedCategory.type}</div>
                <div><span className="text-gray-500">方向：</span>{getDirectionLabel(selectedCategory)}</div>
                <div><span className="text-gray-500">適用税率：</span>{getRateName(selectedCategory)}</div>
              </div>
            </div>

            {!selectedClientId && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                顧客を選択すると顧客別の設定を保存できます。
              </div>
            )}

            <div className="space-y-3">
              {([
                { key: 'use_as_default' as const, label: 'デフォルトとして使用', desc: '仕訳確認でデフォルト選択される税区分' },
                { key: 'use_for_income' as const, label: '収入に使用', desc: '売上方向の取引で使用可能にする' },
                { key: 'use_for_expense' as const, label: '支出に使用', desc: '仕入方向の取引で使用可能にする' },
              ]).map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  </div>
                  <Switch checked={editSettings[key]} onChange={v => setEditSettings({ ...editSettings, [key]: v })} disabled={!selectedClientId || !canEditSettings} />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => setShowDetailModal(false)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
              <button type="button" onClick={handleSaveSettings} disabled={!selectedClientId || !canEditSettings} className="btn-primary disabled:opacity-50">保存する</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===== 税率追加・編集モーダル ===== */}
      <Modal isOpen={showRateModal} onClose={() => setShowRateModal(false)}
        title={editingRate ? `税率の編集: ${editingRate.name}` : '新規税率追加'} size="sm">
        <form onSubmit={handleSaveRate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">税率名 <span className="text-red-500">*</span></label>
            <input type="text" required value={rateForm.name} onChange={e => setRateForm(p => ({ ...p, name: e.target.value }))}
              placeholder="例: 標準税率10%" className="input" disabled={!canEditTaxCat} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">税率（%） <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type="number" required step="0.01" min="0" max="100" value={rateForm.rate}
                onChange={e => setRateForm(p => ({ ...p, rate: e.target.value }))}
                placeholder="例: 10" className="input pr-8" disabled={!canEditTaxCat} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700">有効</p>
              <p className="text-xs text-gray-500">ONの税率のみ仕訳確認画面に表示されます</p>
            </div>
            <Switch checked={rateForm.is_current} onChange={v => setRateForm(p => ({ ...p, is_current: v }))} disabled={!canEditTaxCat} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowRateModal(false)}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
            <button type="submit" className="btn-primary" disabled={!canEditTaxCat}>{editingRate ? '更新' : '追加'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}