import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, AlertCircle, Filter, ChevronDown, Loader, Clock, Undo2 } from 'lucide-react';
import { supabase } from '@/web/shared/lib/supabase';
import { journalEntriesApi, clientsApi } from '@/web/shared/lib/api/backend.api';
import { useAuth } from '@/web/app/providers/AuthProvider';
import { useConfirm } from '@/web/shared/hooks/useConfirm';

// 仕訳承認の行データ
interface ApprovalEntry {
  id: string;
  client_id: string;
  client_name: string;
  document_id: string | null;
  entry_date: string;
  description: string | null;
  status: string;
  ai_generated: boolean;
  ai_confidence: number | null;
  requires_review: boolean;
  amount: number;
  account_item_name: string | null;
  tax_category_name: string | null;
  supplier_name: string | null;
}

type TabFilter = 'reviewed' | 'approved' | 'amended' | 'all';

export default function ApprovalsPage() {
  const { userProfile } = useAuth();
  const { confirm, ConfirmDialogElement } = useConfirm();
  const [entries, setEntries] = useState<ApprovalEntry[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>('reviewed');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  const userRole = userProfile?.role || 'viewer';
  const isManagerOrAdmin = userRole === 'admin' || userRole === 'manager';

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);

    // 顧客一覧 & 承認対象の仕訳を並列取得
    // journalEntriesApi.getAll returns entries with embedded journal_entry_lines (incl. account_items, tax_categories)
    const [{ data: clientsData }, { data: entriesData }] = await Promise.all([
      clientsApi.getAll(),
      journalEntriesApi.getAll({ status: 'reviewed,approved,amended' }),
    ]);

    if (clientsData) setClients(clientsData.map((c: any) => ({ id: c.id, name: c.name })));

    if (entriesData && entriesData.length > 0) {
      const clientMap = new Map((clientsData || []).map((c: any) => [c.id, c.name]));

      const mapped: ApprovalEntry[] = entriesData.map((e: any) => {
        const lines = e.journal_entry_lines || [];
        const firstLine = lines[0];
        return {
          id: e.id,
          client_id: e.client_id,
          client_name: clientMap.get(e.client_id) || '不明',
          document_id: e.document_id,
          entry_date: e.entry_date,
          description: e.description,
          status: e.status,
          ai_generated: e.ai_generated || false,
          ai_confidence: e.ai_confidence,
          requires_review: e.requires_review || false,
          amount: firstLine?.amount || 0,
          account_item_name: firstLine?.account_items?.name || null,
          tax_category_name: firstLine?.tax_categories?.name || null,
          supplier_name: null,
        };
      });
      setEntries(mapped);
    }

    setSelectedIds(new Set());
    setLoading(false);
  };

  // フィルタリング
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (activeTab !== 'all' && e.status !== activeTab) return false;
      if (clientFilter && e.client_id !== clientFilter) return false;
      return true;
    });
  }, [entries, activeTab, clientFilter]);

  // カウント
  const reviewedCount = entries.filter(e => e.status === 'reviewed').length;
  const approvedCount = entries.filter(e => e.status === 'approved').length;
  const amendedCount = entries.filter(e => e.status === 'amended').length;

  // 選択操作
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const reviewedIds = filteredEntries.filter(e => e.status === 'reviewed').map(e => e.id);
    if (reviewedIds.every(id => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reviewedIds));
    }
  };

  const selectedCount = selectedIds.size;

  // 一括承認
  const handleBulkApprove = async () => {
    if (selectedCount === 0) return;
    if (!await confirm(`${selectedCount}件の仕訳を一括承認しますか？`)) return;
    setProcessing(true);

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) { setProcessing(false); return; }

    const ids = Array.from(selectedIds);

    // Bulk update status and create approval records in parallel
    await Promise.all([
      journalEntriesApi.bulkUpdateStatus(ids, 'approved'),
      ...ids.map(id => journalEntriesApi.approve(id, {
        approver_id: currentUser.id,
        approval_status: 'approved',
        approval_level: 1,
        comments: '承認ダッシュボードから一括承認',
      })),
    ]);

    setProcessing(false);
    await loadData();
  };

  // 個別承認
  const handleApprove = async (entryId: string) => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;

    // approve endpoint updates both the approval record and entry status
    await journalEntriesApi.approve(entryId, {
      approver_id: currentUser.id,
      approval_status: 'approved',
      approval_level: 1,
      comments: '承認ダッシュボードから承認',
    });
    await loadData();
  };

  // 差し戻し
  const handleReject = async (entryId: string) => {
    if (!await confirm('この仕訳を差し戻しますか？', { variant: 'danger' })) return;
    await journalEntriesApi.updateStatus(entryId, 'draft');
    await loadData();
  };

  // 金額フォーマット
  const fmt = (n: number) => `¥${n.toLocaleString()}`;

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">読み込み中...</p>
      </div>
    </div>
  );

  if (!isManagerOrAdmin) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <AlertCircle size={48} className="mx-auto mb-4 text-gray-300" />
        <p className="text-gray-500 text-lg mb-2">承認権限がありません</p>
        <p className="text-gray-400 text-sm">この画面はマネージャーまたは管理者のみアクセスできます。</p>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">承認ダッシュボード</h1>
        <p className="text-sm text-gray-500 mt-1">確認済みの仕訳を承認・差し戻しできます。</p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-4 gap-3">
        {([
          { key: 'reviewed' as TabFilter, label: '承認待ち', count: reviewedCount, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
          { key: 'approved' as TabFilter, label: '承認済み', count: approvedCount, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
          { key: 'amended' as TabFilter, label: '要修正', count: amendedCount, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
          { key: 'all' as TabFilter, label: '全件', count: entries.length, color: 'text-gray-900', bg: 'bg-white', border: 'border-gray-200' },
        ]).map(({ key, label, count, color, bg, border }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`${bg} rounded-lg border p-4 text-left transition-all ${activeTab === key ? `${border} shadow-sm ring-1 ring-offset-0 ring-blue-300` : 'border-gray-200 hover:border-gray-300'}`}>
            <div className={`text-2xl font-bold ${color} mb-1`}>{count}</div>
            <div className="text-sm text-gray-600">{label}</div>
          </button>
        ))}
      </div>

      {/* ツールバー */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* 顧客フィルター */}
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
              className="pl-8 pr-8 py-2 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全顧客</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" />
          </div>

          {/* 一括承認ボタン */}
          {selectedCount > 0 && (
            <button onClick={handleBulkApprove} disabled={processing}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              {processing ? <Loader size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {selectedCount}件を一括承認
            </button>
          )}
        </div>

        <div className="text-sm text-gray-500">
          {filteredEntries.length}件表示
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 text-center w-10">
                  {activeTab === 'reviewed' && (
                    <input type="checkbox"
                      checked={filteredEntries.filter(e => e.status === 'reviewed').length > 0 &&
                        filteredEntries.filter(e => e.status === 'reviewed').every(e => selectedIds.has(e.id))}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300" />
                  )}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">顧客</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">取引日</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">摘要</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">勘定科目</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">金額</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">フラグ</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">状態</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-28">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                    {activeTab === 'reviewed' ? '承認待ちの仕訳はありません' : '該当する仕訳がありません'}
                  </td>
                </tr>
              ) : filteredEntries.map(entry => (
                <tr key={entry.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(entry.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-3 text-center">
                    {entry.status === 'reviewed' && (
                      <input type="checkbox"
                        checked={selectedIds.has(entry.id)}
                        onChange={() => toggleSelect(entry.id)}
                        className="rounded border-gray-300" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{entry.client_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{new Date(entry.entry_date).toLocaleDateString('ja-JP')}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-[200px] truncate">{entry.description || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{entry.account_item_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums">{fmt(entry.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {entry.requires_review && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-red-50 text-red-700">要確認</span>
                      )}
                      {entry.ai_generated && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700">AI</span>
                      )}
                      {entry.ai_confidence != null && entry.ai_confidence < 0.7 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-yellow-50 text-yellow-700">低信頼</span>
                      )}
                      {!entry.requires_review && !entry.ai_generated && (
                        <span className="text-gray-300">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {entry.status === 'reviewed' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                        <Clock size={10} />承認待ち
                      </span>
                    ) : entry.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle size={10} />承認済
                      </span>
                    ) : entry.status === 'amended' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        <AlertCircle size={10} />要修正
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {entry.status === 'reviewed' && (
                        <>
                          <button onClick={() => handleApprove(entry.id)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="承認">
                            <CheckCircle size={16} />
                          </button>
                          <button onClick={() => handleReject(entry.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="差し戻し">
                            <Undo2 size={16} />
                          </button>
                        </>
                      )}
                      {entry.status === 'approved' && (
                        <button onClick={() => handleReject(entry.id)}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="差し戻し">
                          <Undo2 size={16} />
                        </button>
                      )}
                      {entry.status === 'amended' && (
                        <button onClick={() => handleApprove(entry.id)}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="再承認">
                          <CheckCircle size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 text-sm text-gray-500">
          {filteredEntries.length}件表示 / 全{entries.length}件
        </div>
      </div>
      {ConfirmDialogElement}
    </div>
  );
}