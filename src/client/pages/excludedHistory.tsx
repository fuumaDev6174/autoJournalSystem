import { useState, useEffect } from 'react';
import { FileX, AlertCircle, Loader, Search, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/client/lib/supabase';
import { useWorkflow } from '@/client/context/WorkflowContext';

// ============================================
// 型定義
// ============================================
interface ExcludedEntry {
  id: string;
  entry_date: string;
  description: string | null;
  excluded_reason: string | null;
  excluded_at: string | null;
  excluded_by: string | null;
  document: {
    id: string;
    file_name: string;
    original_file_name: string | null;
    supplier_name: string | null;
    amount: number | null;
    document_date: string | null;
  } | null;
  client: {
    id: string;
    name: string;
  } | null;
}

// ============================================
// メインコンポーネント
// ============================================
export default function ExcludedHistoryPage() {
  const navigate = useNavigate();
  const { currentWorkflow } = useWorkflow();
  const [entries, setEntries] = useState<ExcludedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { loadData(); }, [currentWorkflow]);

  const loadData = async () => {
    setLoading(true);

    let query = supabase
      .from('journal_entries')
      .select(`
        id, entry_date, description, excluded_reason, excluded_at, excluded_by,
        document:documents(id, file_name, original_file_name, supplier_name, amount, document_date),
        client:clients(id, name)
      `)
      .eq('is_excluded', true)
      .order('excluded_at', { ascending: false, nullsFirst: false });

    // ワークフローがある場合はそのクライアントに絞る
    if (currentWorkflow?.clientId) {
      query = query.eq('client_id', currentWorkflow.clientId);
    }

    const { data, error } = await query;
    if (error) console.error('対象外履歴取得エラー:', error);
    if (data) {
      setEntries(data.map((e: any) => ({
        ...e,
        document: Array.isArray(e.document) ? e.document[0] : e.document,
        client: Array.isArray(e.client) ? e.client[0] : e.client,
      })));
    }
    setLoading(false);
  };

  const filtered = entries.filter(e => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (e.description || '').toLowerCase().includes(q) ||
      (e.excluded_reason || '').toLowerCase().includes(q) ||
      (e.document?.supplier_name || '').toLowerCase().includes(q) ||
      (e.document?.original_file_name || '').toLowerCase().includes(q) ||
      (e.client?.name || '').toLowerCase().includes(q)
    );
  });

  const fmt = (n: number | null | undefined) => n != null ? `¥${Number(n).toLocaleString()}` : '-';
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('ja-JP') : '-';

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader size={32} className="animate-spin text-blue-500" />
      <span className="ml-3 text-gray-500">読み込み中...</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">対象外履歴</h1>
          <p className="text-sm text-gray-500 mt-1">
            {currentWorkflow ? '現在の顧客の対象外証憑一覧（読み取り専用）' : '全顧客の対象外証憑一覧（読み取り専用）'}
          </p>
        </div>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 rounded-lg border border-red-200 p-4">
          <div className="text-2xl font-bold text-red-600 mb-1">{entries.length}</div>
          <div className="text-sm text-gray-600">対象外証憑</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {fmt(entries.reduce((sum, e) => sum + (e.document?.amount || 0), 0))}
          </div>
          <div className="text-sm text-gray-600">対象外合計金額</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {new Set(entries.map(e => e.client?.name).filter(Boolean)).size}
          </div>
          <div className="text-sm text-gray-600">顧客数</div>
        </div>
      </div>

      {/* 検索 */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="取引先・ファイル名・理由で検索..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">取引日</th>
              {!currentWorkflow && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">顧客</th>}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">ファイル名</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">取引先</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">金額</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">対象外理由</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">除外日</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={currentWorkflow ? 6 : 7} className="px-4 py-12 text-center text-gray-400">
                  <FileX size={40} className="mx-auto mb-2 text-gray-300" />
                  対象外の証憑はありません
                </td>
              </tr>
            ) : filtered.map(entry => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{fmtDate(entry.entry_date)}</td>
                {!currentWorkflow && <td className="px-4 py-3 text-sm text-gray-600">{entry.client?.name || '-'}</td>}
                <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate">
                  {entry.document?.original_file_name || entry.document?.file_name || '-'}
                </td>
                <td className="px-4 py-3 text-sm">{entry.document?.supplier_name || entry.description || '-'}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums">{fmt(entry.document?.amount)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{entry.excluded_reason || '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{entry.excluded_at ? fmtDate(entry.excluded_at) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-gray-200 text-sm text-gray-500">
          {filtered.length} 件表示 / 全 {entries.length} 件
        </div>
      </div>

      {/* 注意 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-800">
            このページは読み取り専用です。対象外の解除は仕訳確認ページから行えます。
          </p>
        </div>
      </div>
    </div>
  );
}