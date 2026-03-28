import { useState, useEffect } from 'react';
import { Search, Plus, Edit, Trash2, RotateCcw, X, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkflow } from '@/client/context/WorkflowContext';
import type { Client, Industry } from '@/types';
import Modal from '@/client/components/ui/Modal';
import { supabase } from '@/client/lib/supabase';
import { workflowsApi } from '@/client/lib/workflowStorage';


// workflowsテーブルから取得するための型（最小限）
interface ActiveWorkflow {
  id: string;
  client_id: string;
  current_step: number;
  status: string;
  data: Record<string, unknown>;
  updated_at: string;
  clientName?: string;
}

interface ClientWithIndustry extends Client {
  industry?: Industry;
}

function formatSalesLabel(value: string): string {
  const n = Number(value);
  if (!value || isNaN(n) || n === 0) return '';
  if (n >= 100_000_000) return `約 ${(n / 100_000_000).toFixed(1).replace(/\.0$/, '')}億円`;
  if (n >= 10_000) return `約 ${Math.round(n / 10_000)}万円`;
  return `約 ${n.toLocaleString()}円`;
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

interface BulkRow {
  name: string;
  industry_id: string;
  annual_sales: string;
  tax_category: '原則課税' | '簡易課税' | '免税';
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const { resumeWorkflow, startWorkflow } = useWorkflow();

  const [clients, setClients] = useState<ClientWithIndustry[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [activeWorkflows, setActiveWorkflows] = useState<ActiveWorkflow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientWithIndustry | null>(null);
  const [modalTab, setModalTab] = useState<'single' | 'bulk'>('single');
  const [cancellingWorkflowId, setCancellingWorkflowId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    industry_id: '',
    annual_sales: '',
    is_taxable: true,
    tax_category: '原則課税' as '原則課税' | '簡易課税' | '免税',
    invoice_registered: false,
    invoice_number: '',
    use_custom_rules: false,
  });

  const [bulkRows, setBulkRows] = useState<BulkRow[]>([
    { name: '', industry_id: '', annual_sales: '', tax_category: '原則課税' },
  ]);

  useEffect(() => {
    loadClients();
    loadIndustries();
    loadActiveWorkflows();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*, industry:industries(*)')
      .order('name', { ascending: true });
    if (error) console.error('顧客取得エラー:', error.message);
    if (data) setClients(data as ClientWithIndustry[]);
    setLoading(false);
  };

  const loadIndustries = async () => {
    const { data } = await supabase
      .from('industries')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (data) setIndustries(data as Industry[]);
  };

  const loadActiveWorkflows = async () => {
    const { data } = await supabase
      .from('workflows')
      .select('id, client_id, current_step, status, data, updated_at, clients(name)')
      .eq('status', 'in_progress')
      .order('updated_at', { ascending: false });

    if (data) {
      setActiveWorkflows(
        data.map((w: any) => ({
          ...w,
          clientName: w.clients?.name ?? '不明',
        }))
      );
    }
  };

  const getWorkflowForClient = (clientId: string) =>
    activeWorkflows.find(w => w.client_id === clientId);

  // ============================================
  // ワークフロー中断（キャンセル）
  // ============================================
  const handleCancelWorkflow = async (wf: ActiveWorkflow) => {
    setCancellingWorkflowId(wf.id);
  };

  const confirmCancelWorkflow = async () => {
    if (!cancellingWorkflowId) return;
    const success = await workflowsApi.cancel(cancellingWorkflowId);
    if (success) {
      setCancellingWorkflowId(null);
      loadActiveWorkflows();
    } else {
      alert('ワークフローの中断に失敗しました');
    }
  };

  // ============================================
  // ワークフローやり直し（キャンセル → 新規開始）
  // ============================================
  const handleRestartWorkflow = async (client: ClientWithIndustry) => {
    const wf = getWorkflowForClient(client.id);
    if (wf) {
      const confirmed = window.confirm(
        `「${client.name}」の進行中ワークフローを破棄してやり直しますか？\n\n現在のステップ: ${wf.current_step}/4\n\n※ アップロード済みの証憑データは保持されますが、仕訳データはリセットされます。`
      );
      if (!confirmed) return;
      await workflowsApi.cancel(wf.id);
    }
    // 新規ワークフロー開始
    await startWorkflow(client.id, client.name);
  };

  // ============================================
  // モーダル操作
  // ============================================
  const handleOpenNewModal = () => {
    setEditingClient(null);
    setModalTab('single');
    setFormData({
      name: '', industry_id: '', annual_sales: '',
      is_taxable: true, tax_category: '原則課税',
      invoice_registered: false, invoice_number: '',
      use_custom_rules: false,
    });
    setBulkRows([{ name: '', industry_id: '', annual_sales: '', tax_category: '原則課税' }]);
    setShowModal(true);
  };

  const handleOpenEditModal = (client: ClientWithIndustry) => {
    setEditingClient(client);
    setModalTab('single');
    setFormData({
      name: client.name,
      industry_id: client.industry_id || '',
      annual_sales: client.annual_sales?.toString() || '',
      is_taxable: client.tax_category !== '免税',
      tax_category: client.tax_category === '免税' ? '原則課税' : client.tax_category,
      invoice_registered: client.invoice_registered,
      invoice_number: (client as any).invoice_number || '',
      use_custom_rules: client.use_custom_rules,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientData = {
      name: formData.name,
      industry_id: formData.industry_id || null,
      annual_sales: formData.annual_sales ? Number(formData.annual_sales) : null,
      tax_category: formData.is_taxable ? formData.tax_category : ('免税' as const),
      invoice_registered: formData.invoice_registered,
      invoice_number: formData.invoice_number || null,
      use_custom_rules: formData.use_custom_rules,
      status: 'active' as const,
    };

    if (editingClient) {
      const { error } = await supabase.from('clients').update(clientData).eq('id', editingClient.id);
      if (error) { alert('更新に失敗しました: ' + error.message); return; }
      alert('顧客情報を更新しました');
    } else {
      const { error } = await supabase.from('clients').insert([clientData]);
      if (error) { alert('登録に失敗しました: ' + error.message); return; }
      alert('顧客を登録しました');
    }
    setShowModal(false);
    setEditingClient(null);
    loadClients();
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = bulkRows.filter(r => r.name.trim());
    if (validRows.length === 0) { alert('顧客名を1件以上入力してください'); return; }

    const rows = validRows.map(r => ({
      name: r.name.trim(),
      industry_id: r.industry_id || null,
      annual_sales: r.annual_sales ? Number(r.annual_sales) : null,
      tax_category: r.tax_category,
      invoice_registered: false,
      use_custom_rules: false,
      status: 'active' as const,
    }));
    const { error } = await supabase.from('clients').insert(rows);
    if (error) { alert('一括登録に失敗しました: ' + error.message); return; }
    alert(`${rows.length}件の顧客を登録しました`);
    setShowModal(false);
    loadClients();
  };

  const handleDelete = async (client: ClientWithIndustry) => {
    if (!window.confirm(`「${client.name}」を削除しますか？\n\nこの操作は取り消せません。`)) return;
    const { error } = await supabase.from('clients').delete().eq('id', client.id);
    if (error) { alert('削除に失敗しました: ' + error.message); }
    else { alert('顧客を削除しました'); loadClients(); }
  };

  const handleStart = (client: ClientWithIndustry) => {
    navigate(`/clients/${client.id}/summary`);
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.industry?.name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '-';
    if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(1)}億`;
    if (amount >= 10_000) return `${Math.round(amount / 10_000)}万`;
    return `¥${amount.toLocaleString()}`;
  };

  // ステップ名のヘルパー
  const getStepLabel = (step: number): string => {
    const names = ['', 'アップロード', 'OCR', 'AIチェック', '仕訳確認', '仕訳出力', '集計', '対象外'];
    return names[step] || '';
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">顧客管理</h1>
          <p className="text-sm text-gray-500 mt-1">仕訳入力処理を行う顧客を選択または新規登録してください</p>
        </div>
        <button onClick={handleOpenNewModal} className="flex items-center gap-2 btn-primary">
          <Plus size={18} />新規顧客登録
        </button>
      </div>

      {/* 進行中ワークフロー */}
      {activeWorkflows.length > 0 && (
        <div className="card bg-blue-50 border-blue-200">
          <h2 className="text-lg font-semibold text-blue-900 mb-4">
            📌 進行中のワークフロー ({activeWorkflows.length}件)
          </h2>
          <div className="space-y-3">
            {activeWorkflows.map(wf => (
              <div key={wf.id} className="flex items-center justify-between p-4 bg-white rounded-lg border border-blue-200">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">{wf.clientName}</h3>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>
                      現在: <span className="font-medium text-gray-700">{getStepLabel(wf.current_step)}</span>（{wf.current_step}/4）
                    </span>
                    <span>最終更新: {new Date(wf.updated_at).toLocaleString('ja-JP')}</span>
                  </div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(wf.current_step / 4) * 100}%` }} />
                  </div>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  {/* 中断ボタン */}
                  <button
                    onClick={() => handleCancelWorkflow(wf)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    title="ワークフローを中断"
                  >
                    <X size={15} />
                    <span>中断</span>
                  </button>
                  {/* 続きからボタン */}
                  <button
                    onClick={() => resumeWorkflow(wf.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <RotateCcw size={15} />続きから
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 顧客一覧 */}
      <div className="card">
        <div className="border-b border-gray-200 pb-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">顧客一覧</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="顧客名または業種で検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">顧客名</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">業種</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">年商</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">課税区分</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">インボイス</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">編集/削除</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    {clients.length === 0
                      ? '顧客が登録されていません。「新規顧客登録」から追加してください。'
                      : '検索条件に一致する顧客が見つかりませんでした'}
                  </td>
                </tr>
              ) : (
                filteredClients.map(client => {
                  const wf = getWorkflowForClient(client.id);
                  const hasWf = !!wf;
                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleStart(client)}
                    >
                      <td className="px-4 py-4 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {hasWf ? (
                            <>
                              <button
                                onClick={() => resumeWorkflow(wf.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-500 text-white text-xs font-medium rounded hover:bg-orange-600"
                                title="続きから再開"
                              >
                                <RotateCcw size={13} />続き
                              </button>
                              <button
                                onClick={() => handleRestartWorkflow(client)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded border border-red-200 hover:bg-red-100"
                                title="やり直し（現在の進捗をリセット）"
                              >
                                <X size={13} />やり直し
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleStart(client)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
                            >
                              詳細へ
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-blue-600">
                          {client.name}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {client.industry?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(client.annual_sales)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          client.tax_category === '原則課税' ? 'bg-blue-100 text-blue-800' :
                          client.tax_category === '簡易課税' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {client.tax_category}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${client.invoice_registered ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {client.invoice_registered ? '取得済' : '未取得'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {hasWf ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            {getStepLabel(wf.current_step)} ({wf.current_step}/4)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            待機中
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditModal(client)}
                            className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="編集"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(client)}
                            className="p-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                            title="削除"
                          >
                            <Trash2 size={18} />
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

        {clients.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-200 text-sm text-gray-500">
            {filteredClients.length} 件表示 / 全 {clients.length} 件
          </div>
        )}
      </div>

      {/* ワークフロー中断確認モーダル */}
      <Modal
        isOpen={!!cancellingWorkflowId}
        onClose={() => setCancellingWorkflowId(null)}
        title="ワークフローを中断しますか？"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <p className="font-medium mb-1">この操作について：</p>
              <p>ワークフローを中断すると、進捗状況がリセットされます。</p>
              <p className="mt-1">アップロード済みの証憑やDBに保存された仕訳データは保持されますが、ワークフローの状態は「中断」に変わります。</p>
              <p className="mt-1">同じ顧客で新しいワークフローを開始できます。</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setCancellingWorkflowId(null)}
              className="btn-secondary"
            >
              キャンセル
            </button>
            <button
              onClick={confirmCancelWorkflow}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              <X size={15} />
              中断する
            </button>
          </div>
        </div>
      </Modal>

      {/* 登録モーダル */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingClient(null); }}
        title={editingClient ? '顧客情報編集' : '新規顧客登録'}
        size="lg"
      >
        {/* タブ（新規登録時のみ） */}
        {!editingClient && (
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6">
            {(['single', 'bulk'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setModalTab(tab)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${modalTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {tab === 'single' ? '1名登録' : '一括登録'}
              </button>
            ))}
          </div>
        )}

        {/* 1名登録フォーム */}
        {(editingClient || modalTab === 'single') && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">顧客名 <span className="text-red-500">*</span></label>
              <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input" placeholder="山田太郎" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">業種</label>
              <select value={formData.industry_id} onChange={e => setFormData({ ...formData, industry_id: e.target.value })} className="input">
                <option value="">選択してください（任意）</option>
                {industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">年商（円）</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={formData.annual_sales}
                  onChange={e => setFormData({ ...formData, annual_sales: e.target.value })}
                  className="input flex-1"
                  placeholder="5000000"
                  min="0"
                />
                {formData.annual_sales && (
                  <span className="text-sm text-blue-600 font-medium whitespace-nowrap">
                    {formatSalesLabel(formData.annual_sales)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <span className="text-sm font-medium text-gray-700">課税事業者</span>
                <p className="text-xs text-gray-500 mt-0.5">OFFにすると免税事業者として扱われます</p>
              </div>
              <Switch checked={formData.is_taxable} onChange={v => setFormData({ ...formData, is_taxable: v })} />
            </div>
            {formData.is_taxable && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">課税方式 <span className="text-red-500">*</span></label>
                <select value={formData.tax_category} onChange={e => setFormData({ ...formData, tax_category: e.target.value as '原則課税' | '簡易課税' })} className="input">
                  <option value="原則課税">原則課税</option>
                  <option value="簡易課税">簡易課税</option>
                </select>
              </div>
            )}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">インボイス登録済み</span>
              <Switch checked={formData.invoice_registered} onChange={v => setFormData({ ...formData, invoice_registered: v })} />
            </div>
            {formData.invoice_registered && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">インボイス番号</label>
                <input type="text" value={formData.invoice_number} onChange={e => setFormData({ ...formData, invoice_number: e.target.value })} className="input" placeholder="T1234567890123" />
              </div>
            )}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <span className="text-sm font-medium text-gray-700">ルール自動追加</span>
                <p className="text-xs text-gray-500 mt-0.5">AIが学習した仕訳ルールを自動で追加します</p>
              </div>
              <Switch checked={formData.use_custom_rules} onChange={v => setFormData({ ...formData, use_custom_rules: v })} />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => { setShowModal(false); setEditingClient(null); }} className="btn-secondary">キャンセル</button>
              <button type="submit" className="btn-primary">{editingClient ? '更新する' : '登録する'}</button>
            </div>
          </form>
        )}

        {/* 一括登録フォーム */}
        {!editingClient && modalTab === 'bulk' && (
          <form onSubmit={handleBulkSubmit} className="space-y-4">
            <p className="text-sm text-gray-500">複数の顧客をまとめて登録できます。顧客名は必須です。</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">顧客名 *</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">業種</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">年商（円）</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">課税方式</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bulkRows.map((row, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <input type="text" value={row.name} onChange={e => { const rows = [...bulkRows]; rows[i].name = e.target.value; setBulkRows(rows); }} className="input text-sm" placeholder="山田太郎" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={row.industry_id} onChange={e => { const rows = [...bulkRows]; rows[i].industry_id = e.target.value; setBulkRows(rows); }} className="input text-sm">
                          <option value="">-</option>
                          {industries.map(ind => <option key={ind.id} value={ind.id}>{ind.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={row.annual_sales} onChange={e => { const rows = [...bulkRows]; rows[i].annual_sales = e.target.value; setBulkRows(rows); }} className="input text-sm" placeholder="5000000" min="0" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={row.tax_category} onChange={e => { const rows = [...bulkRows]; rows[i].tax_category = e.target.value as BulkRow['tax_category']; setBulkRows(rows); }} className="input text-sm">
                          <option value="原則課税">原則課税</option>
                          <option value="簡易課税">簡易課税</option>
                          <option value="免税">免税</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <button type="button" onClick={() => setBulkRows(bulkRows.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-600" disabled={bulkRows.length === 1}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => setBulkRows([...bulkRows, { name: '', industry_id: '', annual_sales: '', tax_category: '原則課税' }])} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
              <Plus size={16} />行を追加
            </button>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">キャンセル</button>
              <button type="submit" className="btn-primary">一括登録する（{bulkRows.filter(r => r.name.trim()).length}件）</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}