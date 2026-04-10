/**
 * @module 顧客一覧ページ
 */
import { useState } from 'react';
import { Search, Plus, Edit, Trash2, RotateCcw, X, AlertTriangle, Briefcase } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkflow } from '@/web/app/providers/WorkflowProvider';
import type { ClientWithIndustry } from '@/types';
import Modal from '@/web/shared/components/ui/Modal';
import { clientsApi, workflowsApi as backendWorkflowsApi } from '@/web/shared/lib/api/backend.api';
import { useConfirm } from '@/web/shared/hooks/useConfirm';
import { useClientData, useClientRules } from '../hooks/useClientData';
import type { ActiveWorkflow } from '../hooks/useClientData';
import ClientForm, { type ClientFormData } from '../components/ClientForm';
import BulkImportForm, { type BulkRow } from '../components/BulkImportForm';
import WorkflowCard from '../components/WorkflowCard';
import ClientRulesModal from '../components/ClientRulesModal';

const STEP_NAMES = ['', 'アップロード', 'OCR', 'AIチェック', '仕訳確認', '仕訳出力', '集計', '対象外'];

export default function ClientsPage() {
  const navigate = useNavigate();
  const { resumeWorkflow, startWorkflow } = useWorkflow();
  const { clients, industries, activeWorkflows, loading, loadClients, loadActiveWorkflows, getWorkflowForClient } = useClientData();
  const { clientRules, clientAccountItems, clientRatios, loadRules } = useClientRules();
  const { confirm, ConfirmDialogElement } = useConfirm();

  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientWithIndustry | null>(null);
  const [modalTab, setModalTab] = useState<'single' | 'bulk'>('single');
  const [cancellingWorkflowId, setCancellingWorkflowId] = useState<string | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientWithIndustry | null>(null);

  const [formData, setFormData] = useState<ClientFormData>({
    name: '', industry_id: '', annual_sales: '', is_taxable: true,
    tax_category: '原則課税', invoice_registered: false, invoice_number: '', use_custom_rules: false,
  });
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([{ name: '', industry_id: '', annual_sales: '', tax_category: '原則課税' }]);

  // ─── ワークフロー操作 ───
  const handleCancelWorkflow = (wf: ActiveWorkflow) => setCancellingWorkflowId(wf.id);
  const confirmCancelWorkflow = async () => {
    if (!cancellingWorkflowId) return;
    const { error } = await backendWorkflowsApi.cancel(cancellingWorkflowId);
    if (!error) { setCancellingWorkflowId(null); loadActiveWorkflows(); }
    else alert('ワークフローの中断に失敗しました');
  };

  const handleRestartWorkflow = async (client: ClientWithIndustry) => {
    const wf = getWorkflowForClient(client.id);
    if (wf) {
      const ok = await confirm(`「${client.name}」の進行中ワークフローを破棄してやり直しますか？\n\n現在のステップ: ${wf.current_step}/4\n\n※ アップロード済みの証憑データは保持されますが、仕訳データはリセットされます。`, { variant: 'danger' });
      if (!ok) return;
      await backendWorkflowsApi.cancel(wf.id);
    }
    await startWorkflow(client.id, client.name);
  };

  // ─── モーダル操作 ───
  const handleOpenNewModal = () => {
    setEditingClient(null); setModalTab('single');
    setFormData({ name: '', industry_id: '', annual_sales: '', is_taxable: true, tax_category: '原則課税', invoice_registered: false, invoice_number: '', use_custom_rules: false });
    setBulkRows([{ name: '', industry_id: '', annual_sales: '', tax_category: '原則課税' }]);
    setShowModal(true);
  };

  const handleOpenEditModal = (client: ClientWithIndustry) => {
    setEditingClient(client); setModalTab('single');
    setFormData({
      name: client.name, industry_id: client.industry_id || '', annual_sales: client.annual_sales?.toString() || '',
      is_taxable: client.tax_category !== '免税', tax_category: client.tax_category === '免税' ? '原則課税' : client.tax_category,
      invoice_registered: client.invoice_registered, invoice_number: client.invoice_number || '', use_custom_rules: client.use_custom_rules,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: formData.name, industry_id: formData.industry_id || null,
      annual_sales: formData.annual_sales ? Number(formData.annual_sales) : null,
      tax_category: formData.is_taxable ? formData.tax_category : ('免税' as const),
      invoice_registered: formData.invoice_registered, invoice_number: formData.invoice_number || null,
      use_custom_rules: formData.use_custom_rules, status: 'active' as const,
    };
    if (editingClient) {
      const { error } = await clientsApi.update(editingClient.id, data);
      if (error) { alert('更新に失敗しました: ' + error); return; }
    } else {
      const { error } = await clientsApi.create(data);
      if (error) { alert('登録に失敗しました: ' + error); return; }
    }
    setShowModal(false); setEditingClient(null); loadClients();
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = bulkRows.filter(r => r.name.trim());
    if (validRows.length === 0) { alert('顧客名を1件以上入力してください'); return; }
    const rows = validRows.map(r => ({ name: r.name.trim(), industry_id: r.industry_id || null, annual_sales: r.annual_sales ? Number(r.annual_sales) : null, tax_category: r.tax_category, invoice_registered: false, use_custom_rules: false, status: 'active' as const }));
    const results = await Promise.all(rows.map(r => clientsApi.create(r)));
    if (results.find(r => r.error)) { alert('一括登録に失敗しました'); return; }
    alert(`${rows.length}件の顧客を登録しました`);
    setShowModal(false); loadClients();
  };

  const handleDelete = async (client: ClientWithIndustry) => {
    if (!await confirm(`「${client.name}」を削除しますか？\n\nこの操作は取り消せません。`, { variant: 'danger' })) return;
    const { error } = await clientsApi.delete(client.id);
    if (!error) loadClients();
    else alert('削除に失敗しました: ' + error);
  };

  const openClientRules = async (client: ClientWithIndustry) => {
    setSelectedClient(client);
    await loadRules(client);
    setShowRulesModal(true);
  };

  // ─── フィルタリング ───
  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.industry?.name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '-';
    if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(1)}億`;
    if (amount >= 10_000) return `${Math.round(amount / 10_000)}万`;
    return `¥${amount.toLocaleString()}`;
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
        <button type="button" onClick={handleOpenNewModal} className="flex items-center gap-2 btn-primary"><Plus size={18} />新規顧客登録</button>
      </div>

      {/* 進行中ワークフロー */}
      <WorkflowCard workflows={activeWorkflows} onResume={resumeWorkflow} onCancel={handleCancelWorkflow} />

      {/* 顧客一覧テーブル */}
      <div className="card">
        <div className="border-b border-gray-200 pb-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">顧客一覧</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" placeholder="顧客名または業種で検索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="input pl-10" />
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
                <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">{clients.length === 0 ? '顧客が登録されていません。「新規顧客登録」から追加してください。' : '検索条件に一致する顧客が見つかりませんでした'}</td></tr>
              ) : filteredClients.map(client => {
                const wf = getWorkflowForClient(client.id);
                return (
                  <tr key={client.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/clients/${client.id}/summary`)}>
                    <td className="px-4 py-4 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {wf ? (<>
                          <button type="button" onClick={() => resumeWorkflow(wf.id)} className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-500 text-white text-xs font-medium rounded hover:bg-orange-600" title="続きから再開"><RotateCcw size={13} />続き</button>
                          <button type="button" onClick={() => handleRestartWorkflow(client)} className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded border border-red-200 hover:bg-red-100" title="やり直し"><X size={13} />やり直し</button>
                        </>) : (
                          <button type="button" onClick={() => navigate(`/clients/${client.id}/summary`)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700">詳細へ</button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap"><span className="text-sm font-medium text-blue-600">{client.name}</span></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{client.industry?.name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(client.annual_sales)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${client.tax_category === '原則課税' ? 'bg-blue-100 text-blue-800' : client.tax_category === '簡易課税' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{client.tax_category}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${client.invoice_registered ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{client.invoice_registered ? '取得済' : '未取得'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {wf ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">{STEP_NAMES[wf.current_step]} ({wf.current_step}/4)</span>
                        : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">待機中</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => openClientRules(client)} className="p-1.5 text-cyan-600 hover:bg-cyan-50 rounded" title="ルール設定"><Briefcase size={16} /></button>
                        <button type="button" onClick={() => handleOpenEditModal(client)} className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded" title="編集"><Edit size={18} /></button>
                        <button type="button" onClick={() => handleDelete(client)} className="p-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded" title="削除"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {clients.length > 0 && <div className="px-6 py-3 border-t border-gray-200 text-sm text-gray-500">{filteredClients.length} 件表示 / 全 {clients.length} 件</div>}
      </div>

      {/* ワークフロー中断確認モーダル */}
      <Modal isOpen={!!cancellingWorkflowId} onClose={() => setCancellingWorkflowId(null)} title="ワークフローを中断しますか？" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <p className="font-medium mb-1">この操作について：</p>
              <p>ワークフローを中断すると、進捗状況がリセットされます。</p>
              <p className="mt-1">アップロード済みの証憑やDBに保存された仕訳データは保持されます。</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setCancellingWorkflowId(null)} className="btn-secondary">キャンセル</button>
            <button type="button" onClick={confirmCancelWorkflow} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"><X size={15} />中断する</button>
          </div>
        </div>
      </Modal>

      {/* 登録モーダル */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingClient(null); }} title={editingClient ? '顧客情報編集' : '新規顧客登録'} size="lg">
        {!editingClient && (
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6">
            {(['single', 'bulk'] as const).map(tab => (
              <button key={tab} type="button" onClick={() => setModalTab(tab)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${modalTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                {tab === 'single' ? '1名登録' : '一括登録'}
              </button>
            ))}
          </div>
        )}
        {(editingClient || modalTab === 'single') && (
          <ClientForm formData={formData} setFormData={setFormData} industries={industries} editingClient={editingClient} onSubmit={handleSubmit} onCancel={() => { setShowModal(false); setEditingClient(null); }} />
        )}
        {!editingClient && modalTab === 'bulk' && (
          <BulkImportForm rows={bulkRows} setRows={setBulkRows} industries={industries} onSubmit={handleBulkSubmit} onCancel={() => setShowModal(false)} />
        )}
      </Modal>

      {/* ルール設定モーダル */}
      <ClientRulesModal isOpen={showRulesModal} onClose={() => setShowRulesModal(false)} client={selectedClient} rules={clientRules} accountItems={clientAccountItems} ratios={clientRatios} />
      {ConfirmDialogElement}
    </div>
  );
}
