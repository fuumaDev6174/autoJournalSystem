import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Plus, Upload, FileOutput, FileX, ArrowLeft, Building2, Receipt, Calendar, CheckCircle, Clock, AlertCircle, Loader } from 'lucide-react';
import { supabase } from '@/client/lib/supabase';
import { useWorkflow } from '@/client/context/WorkflowContext';
import type { Client, Industry } from '@/types';


interface WorkflowLog {
  id: string;
  client_id: string;
  status: string;
  current_step: number;
  data: {
    uploaded_document_ids?: string[];
    ocr_completed_ids?: string[];
    aicheck_status?: boolean;
    review_completed_at?: string;
  };
  created_at: string;
  updated_at: string;
  // -------------------------------------------------------
  // 追加: ワークフローごとの仕訳集計を保持
  // -------------------------------------------------------
  entryStats?: {
    total: number;
    approved: number;
    excluded: number;
    draft: number;
    totalAmount: number;
  };
  // ドキュメントの日付範囲（取引日）
  dateRange?: {
    earliest: string | null;
    latest: string | null;
  };
}

interface ClientDetail extends Client {
  industry?: Industry;
}

function formatSales(amount: number | null): string {
  if (!amount) return '-';
  if (amount >= 1_0000_0000) return `${(amount / 1_0000_0000).toFixed(1)}億円`;
  if (amount >= 1_0000) return `${(amount / 1_0000).toFixed(0)}万円`;
  return `¥${amount.toLocaleString()}`;
}

function formatCurrency(amount: number | null | undefined): string {
  if (!amount && amount !== 0) return '-';
  return `¥${Number(amount).toLocaleString()}`;
}

export default function SummaryPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { startWorkflow } = useWorkflow();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (clientId) loadData(clientId);
  }, [clientId]);

  const loadData = async (cid: string) => {
    setLoading(true);
    const [clientRes, wfRes] = await Promise.all([
      supabase.from('clients').select('*, industry:industries(*)').eq('id', cid).single(),
      supabase.from('workflows').select('*').eq('client_id', cid).order('created_at', { ascending: false }),
    ]);

    if (clientRes.data) setClient(clientRes.data as ClientDetail);

    if (wfRes.data) {
      // 各ワークフローの仕訳集計を取得
      const wfList = wfRes.data as WorkflowLog[];
      const enriched = await Promise.all(
        wfList.map(async (wf) => {
          // ワークフローに紐づくドキュメントIDを取得
          const { data: docs } = await supabase
            .from('documents')
            .select('id, document_date')
            .eq('workflow_id', wf.id)
            .eq('client_id', cid);

          const docIds = docs?.map((d: any) => d.id) || [];

          // 取引日の日付範囲を計算
          const dates = docs
            ?.map((d: any) => d.document_date)
            .filter(Boolean)
            .sort() || [];

          const dateRange = {
            earliest: dates.length > 0 ? dates[0] : null,
            latest: dates.length > 0 ? dates[dates.length - 1] : null,
          };

          if (docIds.length === 0) {
            return { ...wf, entryStats: { total: 0, approved: 0, excluded: 0, draft: 0, totalAmount: 0 }, dateRange };
          }

          // 仕訳集計を取得
          const { data: entries } = await supabase
            .from('journal_entries')
            .select('id, status, is_excluded, journal_entry_lines(amount, debit_credit)')
            .eq('client_id', cid)
            .in('document_id', docIds);

          const total = entries?.length || 0;
          const approved = entries?.filter((e: any) => e.status === 'approved').length || 0;
          const excluded = entries?.filter((e: any) => e.is_excluded).length || 0;
          const draft = entries?.filter((e: any) => e.status === 'draft').length || 0;

          // 借方合計金額を計算
          const totalAmount = entries?.reduce((sum: number, e: any) => {
            const debitLine = e.journal_entry_lines?.find((l: any) => l.debit_credit === 'debit');
            return sum + (debitLine?.amount || 0);
          }, 0) || 0;

          return {
            ...wf,
            entryStats: { total, approved, excluded, draft, totalAmount },
            dateRange,
          };
        })
      );

      setWorkflows(enriched);
    }

    setLoading(false);
  };

  const getStepName = (step: number) => {
    const names = ['顧客選択', 'アップロード', 'OCR処理', 'AIチェック', '仕訳確認', '出力', '集計', '対象外'];
    return names[step - 1] || `ステップ${step}`;
  };

  const getStatusBadge = (wf: WorkflowLog) => {
    if (wf.status === 'completed') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle size={12} />完了</span>;
    if (wf.status === 'in_progress') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><Clock size={12} />進行中</span>;
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><AlertCircle size={12} />{wf.status}</span>;
  };

  const getDocumentCount = (wf: WorkflowLog) => wf.data?.uploaded_document_ids?.length ?? 0;

  // -------------------------------------------------------
  // 取引日範囲をフォーマット
  // -------------------------------------------------------
  const formatDateRange = (dateRange?: WorkflowLog['dateRange']) => {
    if (!dateRange?.earliest) return '-';
    const fmt = (d: string) => new Date(d).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
    if (dateRange.earliest === dateRange.latest || !dateRange.latest) {
      return fmt(dateRange.earliest);
    }
    return `${fmt(dateRange.earliest)} 〜 ${fmt(dateRange.latest)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <AlertCircle size={64} className="text-yellow-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">顧客が見つかりません</h2>
        <button onClick={() => navigate('/clients')} className="btn-primary mt-4">顧客一覧へ戻る</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/clients')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">顧客詳細・業務ログ</p>
        </div>
        <button
          onClick={async () => {
            if (!client || !clientId) return;
            setStarting(true);
            await startWorkflow(clientId, client.name);
            setStarting(false);
          }}
          disabled={starting}
          className="flex items-center gap-2 btn-primary disabled:opacity-60"
        >
          {starting ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />}
          新規ワークフロー開始
        </button>
      </div>

      {/* 顧客基本情報 */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">基本情報</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={16} className="text-gray-500" />
              <span className="text-xs font-medium text-gray-500">業種</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">{client.industry?.name || '-'}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt size={16} className="text-gray-500" />
              <span className="text-xs font-medium text-gray-500">年商</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">{formatSales(client.annual_sales)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-gray-500">課税方式</span>
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              client.tax_category === '原則課税' ? 'bg-blue-100 text-blue-800' :
              client.tax_category === '簡易課税' ? 'bg-green-100 text-green-800' :
              'bg-gray-100 text-gray-800'
            }`}>{client.tax_category}</span>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-gray-500">インボイス</span>
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${client.invoice_registered ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
              {client.invoice_registered ? '登録済み' : '未登録'}
            </span>
          </div>
        </div>
      </div>

      {/* クイックアクション */}
      <div className="grid grid-cols-3 gap-4">
        {/* アップロード = 新規ワークフロー開始 */}
        <button
          onClick={async () => {
            if (!client || !clientId) return;
            setStarting(true);
            await startWorkflow(clientId, client.name);
            setStarting(false);
          }}
          disabled={starting}
          className="flex items-center gap-3 p-4 rounded-lg border transition-colors text-left text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200 disabled:opacity-60"
        >
          {starting ? <Loader size={20} className="animate-spin" /> : <Upload size={20} />}
          <div>
            <p className="text-sm font-semibold">アップロード</p>
            <p className="text-xs opacity-75">新規ワークフロー開始</p>
          </div>
        </button>

        {/* エクスポート・対象外 = 既存ワークフローがある場合のみ */}
        {[
          { icon: <FileOutput size={20} />, label: 'エクスポート', desc: 'freeeに出力', slug: 'export', color: 'text-green-600 bg-green-50 hover:bg-green-100 border-green-200' },
          { icon: <FileX size={20} />, label: '対象外証憑', desc: '除外された証憑', slug: 'excluded', color: 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200' },
        ].map(item => {
          // 進行中のワークフローがあればリンク有効
          const activeWf = workflows.find(w => w.status === 'in_progress');
          const href = activeWf ? `/clients/${clientId}/${item.slug}` : '#';
          const disabled = !activeWf;
          return (
            <Link
              key={item.label}
              to={href}
              onClick={(e) => { if (disabled) e.preventDefault(); }}
              className={`flex items-center gap-3 p-4 rounded-lg border transition-colors ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200 text-gray-400' : item.color}`}
            >
              {item.icon}
              <div>
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="text-xs opacity-75">{disabled ? '進行中のワークフローなし' : item.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 業務ログ */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">業務ログ</h2>
          <span className="text-sm text-gray-500">{workflows.length}件</span>
        </div>

        {workflows.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Calendar size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm">まだ処理履歴がありません</p>
            <button
              onClick={async () => {
                if (!client || !clientId) return;
                setStarting(true);
                await startWorkflow(clientId, client.name);
                setStarting(false);
              }}
              disabled={starting}
              className="mt-4 btn-primary text-sm disabled:opacity-60"
            >
              最初のワークフローを開始する
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">取引日</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">処理日</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">完了日</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">証憑数</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">仕訳</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">金額合計</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">現在ステップ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ステータス</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {workflows.map((wf) => (
                  <tr key={wf.id} className="hover:bg-gray-50">
                    {/* 取引日（証憑の日付範囲） */}
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                      {formatDateRange(wf.dateRange)}
                    </td>
                    {/* 処理日（ワークフロー開始日） */}
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(wf.created_at).toLocaleDateString('ja-JP')}
                    </td>
                    {/* 完了日 */}
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {wf.status === 'completed' ? new Date(wf.updated_at).toLocaleDateString('ja-JP') : '-'}
                    </td>
                    {/* 証憑数 */}
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {getDocumentCount(wf)}件
                    </td>
                    {/* 仕訳数（承認済み / 全件） */}
                    <td className="px-4 py-3 text-sm">
                      {wf.entryStats ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-900">{wf.entryStats.approved}</span>
                          <span className="text-gray-400">/</span>
                          <span className="text-gray-500">{wf.entryStats.total}件</span>
                          {wf.entryStats.excluded > 0 && (
                            <span className="text-xs text-red-500 ml-1">除外{wf.entryStats.excluded}</span>
                          )}
                          {wf.entryStats.draft > 0 && (
                            <span className="text-xs text-yellow-600 ml-1">下書{wf.entryStats.draft}</span>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    {/* 金額合計 */}
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {wf.entryStats ? formatCurrency(wf.entryStats.totalAmount) : '-'}
                    </td>
                    {/* 現在ステップ */}
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {getStepName(wf.current_step)}
                    </td>
                    {/* ステータス */}
                    <td className="px-4 py-3">
                      {getStatusBadge(wf)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}