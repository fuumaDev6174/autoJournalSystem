/**
 * @module エクスポートページ
 */
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileText, AlertCircle, History, Calendar } from 'lucide-react';
import { useWorkflow } from '@/web/app/providers/WorkflowProvider';
import { useMasterData } from '@/web/app/providers/MasterDataProvider';
import { journalEntriesApi, exportsApi } from '@/web/shared/lib/api/backend.api';
import WorkflowHeader from '@/web/features/workflow/components/WorkflowHeader';
import { useConfirm } from '@/web/shared/hooks/useConfirm';

// ============================================
// 型定義
// ============================================
type PeriodFilter = '全期間' | '本日' | '今週' | '今月' | '先月' | 'カスタム';
type ExcludedFilter = '全て' | '対象外除く';
type ActiveTab = '出力' | '出力履歴';
type DateBasis = '取引日' | '処理日';

interface ExportLine {
  id: string;
  line_number: number;
  debit_credit: string;
  account_item_id: string | null;
  tax_category_id: string | null;
  amount: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  description: string | null;
}

interface EntryWithJoin {
  id: string;
  entry_date: string;
  created_at: string;
  description: string | null;
  status: string;
  is_excluded: boolean;
  supplier_id: string | null;
  lines: ExportLine[];
  // フロントマッピング用
  _debitAccountName?: string;
  _debitTaxCatName?: string;
}

interface ExportRecord {
  id: string;
  created_at: string;
  export_type: string;
  export_format: string | null;
  entry_count: number | null;
  file_name: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

// ============================================
// ユーティリティ
// ============================================
function getDateRange(filter: PeriodFilter, customStart?: string, customEnd?: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (filter) {
    case '本日': return { start: today, end: new Date(today.getTime() + 86400000 - 1) };
    case '今週': {
      const day = today.getDay();
      const mon = new Date(today); mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { start: mon, end: sun };
    }
    case '今月': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
    case '先月': return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0) };
    case 'カスタム': return { start: customStart ? new Date(customStart) : null, end: customEnd ? new Date(customEnd) : null };
    default: return { start: null, end: null };
  }
}

function formatDate(d: string | null) { return d ? new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'; }
function formatDateTime(d: string | null) { return d ? new Date(d).toLocaleString('ja-JP') : '-'; }
function formatCurrency(n: number) { return `¥${n.toLocaleString('ja-JP')}`; }

function getDebitLine(entry: EntryWithJoin) { return entry.lines?.find(l => l.debit_credit === 'debit'); }
function getCreditLine(entry: EntryWithJoin) { return entry.lines?.find(l => l.debit_credit === 'credit'); }
function getEntryAmount(entry: EntryWithJoin) { return entry.lines?.filter(l => l.debit_credit === 'debit').reduce((s, l) => s + (l.amount ?? 0), 0) ?? 0; }

// ============================================
// シンプルCSV生成（Tax Copilot独自形式）
// ============================================
function buildSimpleCsv(entries: EntryWithJoin[], acctMap: Map<string, string>, txCatMap: Map<string, string>): string {
  const headers = [
    '収支区分', '取引日', '取引先タグ', '勘定科目', '税区分', '金額', '品目タグ', '決済日', '決済口座', '決済金額'
  ];
  const rows: string[][] = [];
  entries.forEach(entry => {
    const debit = getDebitLine(entry);
    const credit = getCreditLine(entry);
    if (!debit) return;
    const accountName = debit.account_item_id ? acctMap.get(debit.account_item_id) || '' : '';
    const taxCatName = debit.tax_category_id ? txCatMap.get(debit.tax_category_id) || '' : '';
    const amount = debit.amount?.toString() || '0';
    const isIncome = accountName.includes('売上') || accountName.includes('収入');
    const creditAccountName = credit?.account_item_id ? acctMap.get(credit.account_item_id) || '' : '';

    rows.push([
      isIncome ? '収入' : '支出',
      entry.entry_date?.replace(/-/g, '/') || '',
      entry.description || '', // 取引先タグ（摘要で代用）
      accountName,
      taxCatName,
      amount,
      '', // 品目タグ
      credit ? entry.entry_date?.replace(/-/g, '/') || '' : '',
      creditAccountName || 'プライベート資金',
      credit ? (credit.amount?.toString() || '') : amount,
    ]);
  });
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  return '\uFEFF' + csv;
}

// ============================================
// freee取込CSV生成（freee公式インポート形式 21列）
// ============================================
function buildFreeeCsv(entries: EntryWithJoin[], acctMap: Map<string, string>, txCatMap: Map<string, string>): string {
  const headers = [
    '収支区分', '管理番号', '発生日', '決済期日', '取引先コード', '取引先',
    '勘定科目', '税区分', '金額', '税計算区分', '税額', '備考', '品目', '部門',
    'メモタグ（複数指定可、カンマ区切り）', 'セグメント1', 'セグメント2', 'セグメント3',
    '決済日', '決済口座', '決済金額'
  ];

  const rows: string[][] = [];
  entries.forEach(entry => {
    const debitLines = entry.lines?.filter(l => l.debit_credit === 'debit') || [];
    const credit = getCreditLine(entry);
    if (debitLines.length === 0) return;

    const firstDebitAccountName = debitLines[0]?.account_item_id ? acctMap.get(debitLines[0].account_item_id) || '' : '';
    const isIncome = firstDebitAccountName.includes('売上') || firstDebitAccountName.includes('収入');
    const entryDate = entry.entry_date?.replace(/-/g, '/') || '';

    // 複合仕訳対応: 借方が複数行の場合、1行目に決済情報、2行目以降は決済なし
    debitLines.forEach((debit, idx) => {
      const accountName = debit.account_item_id ? acctMap.get(debit.account_item_id) || '' : '';
      const taxCatName = debit.tax_category_id ? txCatMap.get(debit.tax_category_id) || '' : '';
      const amount = debit.amount?.toString() || '0';
      const taxAmount = debit.tax_amount?.toString() || '';

      // P0-2: 税計算区分を税額から判定（内税 or 税込）
      let taxCalcType = '内税';
      if (debit.tax_amount != null && debit.tax_rate != null && debit.amount != null) {
        const internalTax = Math.round(debit.amount * debit.tax_rate / (1 + debit.tax_rate));
        taxCalcType = debit.tax_amount === internalTax ? '内税' : '税込';
      }

      // P0-3: 決済口座を貸方勘定科目名から取得
      const settlementAccount = idx === 0 && credit?.account_item_id
        ? (acctMap.get(credit.account_item_id) || '')
        : '';

      rows.push([
        idx === 0 ? (isIncome ? '収入' : '支出') : '', // 収支区分（2行目以降は空）
        '', // 管理番号
        idx === 0 ? entryDate : '', // 発生日（2行目以降は空）
        '', // 決済期日
        '', // 取引先コード
        idx === 0 ? (entry.description || '') : '', // 取引先
        accountName,
        taxCatName,
        amount,
        taxCalcType, // P0-2: 動的判定
        taxAmount,
        entry.description || '', // 備考
        '', // 品目
        '', // 部門
        '', // メモタグ
        '', '', '', // セグメント1-3
        idx === 0 && credit ? entryDate : '', // 決済日
        settlementAccount, // P0-3: 貸方科目名
        idx === 0 && credit ? (credit.amount?.toString() || '') : '', // 決済金額
      ]);
    });
  });

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  return '\uFEFF' + csv;
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: '完了', cls: 'bg-green-100 text-green-800' },
    pending: { label: '処理中', cls: 'bg-yellow-100 text-yellow-800' },
    error: { label: 'エラー', cls: 'bg-red-100 text-red-800' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

// ============================================
// メインコンポーネント
// ============================================
export default function ExportPage() {
  const { currentWorkflow } = useWorkflow();
  const { accountMap, taxCatMap } = useMasterData();
  const { confirm, ConfirmDialogElement } = useConfirm();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get('client_id') ?? currentWorkflow?.clientId ?? '';

  const [activeTab, setActiveTab] = useState<ActiveTab>('出力');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('本日');
  const [dateBasis, setDateBasis] = useState<DateBasis>('取引日');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [excludedFilter, setExcludedFilter] = useState<ExcludedFilter>('対象外除く');

  const [entries, setEntries] = useState<EntryWithJoin[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [freeeExporting, setFreeeExporting] = useState(false);

  // freee API連携エクスポート (Task 5-3)
  const handleFreeeApiExport = async () => {
    if (filteredEntries.length === 0) return;
    // 接続状態チェック
    try {
      const statusRes = await fetch('/api/freee/connection-status');
      const statusData = await statusRes.json();
      if (!statusData.connected) {
        alert('freeeが未接続です。設定画面から連携してください。');
        return;
      }
    } catch {
      alert('freee接続状態の確認に失敗しました');
      return;
    }

    if (!await confirm(`${filteredEntries.length}件の仕訳をfreeeに送信しますか？`)) return;
    setFreeeExporting(true);
    try {
      const res = await fetch('/api/freee/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journal_entries: filteredEntries }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`freeeへのエクスポートが完了しました（${data.exported_count}件）`);
      } else {
        alert('freeeエクスポートエラー: ' + (data.error || data.message));
      }
    } catch (e: any) {
      alert('freeeエクスポートに失敗しました: ' + e.message);
    }
    setFreeeExporting(false);
  };

  // ============================================
  // データ取得
  // ============================================
  useEffect(() => { if (clientId) loadEntries(); }, [clientId]);

  const loadEntries = async () => {
    setLoading(true);

    // -------------------------------------------------------
    // 2段階クエリ: journal_entries → journal_entry_lines を別クエリ
    // PostgREST の ambiguous relationship エラーを完全回避
    // -------------------------------------------------------

    // backend API で journal_entries を取得（lines は join 済み）
    const { data: allEntries, error: entriesError } = await journalEntriesApi.getAll({ client_id: clientId });

    if (entriesError) {
      console.error('[仕訳出力] journal_entries取得エラー:', entriesError);
      setLoading(false);
      return;
    }

    if (!allEntries || allEntries.length === 0) {
      setEntries([]);
      setLoading(false);
      return;
    }

    // client-side filter: reviewed, approved, posted のみ出力対象
    const entriesData = allEntries.filter((e: any) => ['reviewed', 'approved', 'posted'].includes(e.status));

    // フロントマッピング（backend API は lines を含んで返す）
    const mapped: EntryWithJoin[] = entriesData.map((entry: any) => {
      const lines: ExportLine[] = entry.lines || [];
      const debit = lines.find(l => l.debit_credit === 'debit');
      return {
        ...entry,
        lines,
        _debitAccountName: debit?.account_item_id ? accountMap.get(debit.account_item_id) || '' : '',
        _debitTaxCatName: debit?.tax_category_id ? taxCatMap.get(debit.tax_category_id) || '' : '',
      };
    });

    setEntries(mapped);

    // 未承認件数を取得（警告表示用）— client-side filter from allEntries
    const draftPendingCount = allEntries.filter((e: any) => ['draft', 'pending'].includes(e.status)).length;
    setDraftCount(draftPendingCount);

    setLoading(false);
  };

  // 出力履歴
  useEffect(() => { if (activeTab === '出力履歴' && clientId) loadHistory(); }, [activeTab, clientId]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    const { data, error } = await exportsApi.getByClient(clientId);
    if (data) setExportHistory(data as unknown as ExportRecord[]);
    if (error) console.error('出力履歴取得エラー:', error);
    setHistoryLoading(false);
  };

  // -------------------------------------------------------
  // フィルタリング: 日付基準（取引日 or 処理日）で切り替え
  // -------------------------------------------------------
  const filteredByPeriod = useMemo(() => {
    const { start, end } = getDateRange(periodFilter, customStart, customEnd);
    return entries.filter(e => {
      if (!start && !end) return true;
      // 日付基準に応じてフィルタ対象を切り替え
      const dateStr = dateBasis === '取引日' ? e.entry_date : e.created_at;
      const d = new Date(dateStr);
      return (!start || d >= start) && (!end || d <= end);
    });
  }, [entries, periodFilter, customStart, customEnd, dateBasis]);

  const filteredEntries = useMemo(() => {
    return excludedFilter === '対象外除く' ? filteredByPeriod.filter(e => !e.is_excluded) : filteredByPeriod;
  }, [filteredByPeriod, excludedFilter]);

  const summary = useMemo(() => {
    const active = filteredByPeriod.filter(e => !e.is_excluded);
    const excluded = filteredByPeriod.filter(e => e.is_excluded);
    const total = filteredByPeriod.reduce((s, e) => s + getEntryAmount(e), 0);
    return { total: filteredByPeriod.length, active: active.length, excluded: excluded.length, totalAmount: total };
  }, [filteredByPeriod]);

  const handleSimpleCsvDownload = async () => {
    if (draftCount > 0) {
      const ok = await confirm(`未承認の仕訳が${draftCount}件あり、出力対象から除外されています。\nこのままCSVをダウンロードしますか？`);
      if (!ok) return;
    }
    const csv = buildSimpleCsv(filteredEntries, accountMap, taxCatMap);
    const name = currentWorkflow?.clientName ?? clientId;
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `仕訳データ_${name}_${dateStr}.csv`);
  };

  const handleFreeeCsvDownload = async () => {
    if (draftCount > 0) {
      const ok = await confirm(`未承認の仕訳が${draftCount}件あり、出力対象から除外されています。\nこのままCSVをダウンロードしますか？`);
      if (!ok) return;
    }
    const csv = buildFreeeCsv(filteredEntries, accountMap, taxCatMap);
    const name = currentWorkflow?.clientName ?? clientId;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadCsv(csv, `freee取込_${name}_${dateStr}.csv`);
  };

  // ショートカットキー
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1' && !e.ctrlKey && !e.altKey) { e.preventDefault(); handleSimpleCsvDownload(); }
      if (e.key === '2' && !e.ctrlKey && !e.altKey) { e.preventDefault(); handleFreeeCsvDownload(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filteredEntries, draftCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ワークフロー完了前の検証
  const handleBeforeNext = async (): Promise<boolean> => {
    if (draftCount > 0) {
      const ok = await confirm(
        `未承認の仕訳が${draftCount}件あり、CSV出力対象から除外されています。\n\nこのままワークフローを完了しますか？\n「キャンセル」で戻って仕訳確認ページで承認できます。`
      );
      if (!ok) return false;
    }
    return true;
  };

  if (!currentWorkflow && !clientId) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-center max-w-md">
          <AlertCircle size={64} className="text-yellow-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">ワークフローが開始されていません</h2>
          <a href="/clients" className="btn-primary">顧客一覧へ戻る</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {currentWorkflow && <WorkflowHeader onBeforeNext={handleBeforeNext} nextLabel="集計チェックへ（完了）" />}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">仕訳出力</h1>
            <p className="text-sm text-gray-500 mt-1">{currentWorkflow?.clientName ?? clientId} — 仕訳データCSVまたはfreee取込用CSVをダウンロードできます</p>
          </div>

          {/* タブ */}
          <div className="border-b border-gray-200">
            <nav className="flex gap-4">
              {(['出力', '出力履歴'] as ActiveTab[]).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {tab === '出力履歴' && <History size={14} className="inline mr-1 -mt-0.5" />}{tab}
                </button>
              ))}
            </nav>
          </div>

          {activeTab === '出力' && (
            <>
              {/* 未承認警告バナー */}
              {draftCount > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
                  <AlertCircle size={20} className="text-yellow-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-900">未承認の仕訳が {draftCount} 件あります</p>
                    <p className="text-xs text-yellow-700 mt-0.5">未承認の仕訳はCSV出力対象に含まれません。仕訳確認ページで承認してください。</p>
                  </div>
                </div>
              )}
              {/* 期間フィルター + 日付基準切り替え */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Calendar size={16} />対象期間</h2>
                  {/* 日付基準セレクター */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">基準:</span>
                    <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                      {(['取引日', '処理日'] as DateBasis[]).map(basis => (
                        <button key={basis} onClick={() => setDateBasis(basis)}
                          className={`px-3 py-1 text-xs font-medium transition-colors ${dateBasis === basis ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                          {basis}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['全期間', '本日', '今週', '今月', '先月', 'カスタム'] as PeriodFilter[]).map(p => (
                    <button key={p} onClick={() => setPeriodFilter(p)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${periodFilter === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                      {p}
                    </button>
                  ))}
                </div>
                {periodFilter === 'カスタム' && (
                  <div className="flex items-center gap-3 mt-4">
                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input w-auto text-sm" />
                    <span className="text-gray-400">〜</span>
                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input w-auto text-sm" />
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  {dateBasis === '取引日' ? '※ 証憑の取引日（entry_date）でフィルタしています' : '※ 仕訳の作成日（created_at）でフィルタしています'}
                </p>
              </div>

              {/* サマリー */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: '総仕訳数', value: `${summary.total} 件` },
                  { label: '出力対象', value: `${summary.active} 件` },
                  { label: '対象外', value: `${summary.excluded} 件` },
                  { label: '合計金額', value: formatCurrency(summary.totalAmount) },
                ].map(card => (
                  <div key={card.label} className="card">
                    <h3 className="text-xs font-medium text-gray-500 mb-2">{card.label}</h3>
                    <div className="text-2xl font-bold text-gray-900">{card.value}</div>
                  </div>
                ))}
              </div>

              {/* 仕訳一覧 + CSV */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-gray-900">仕訳一覧</h2>
                    <span className="text-sm text-gray-500">{filteredEntries.length} 件</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                      {(['全て', '対象外除く'] as ExcludedFilter[]).map(f => (
                        <button key={f} onClick={() => setExcludedFilter(f)}
                          className={`px-3 py-1.5 text-sm transition-colors ${excludedFilter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                    <button onClick={handleSimpleCsvDownload} disabled={filteredEntries.length === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                      <Download size={16} />CSV ダウンロード
                    </button>
                    <button onClick={handleFreeeCsvDownload} disabled={filteredEntries.length === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
                      <Download size={16} />freee取込CSV
                    </button>
                    <button onClick={handleFreeeApiExport} disabled={filteredEntries.length === 0 || freeeExporting}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed">
                      <FileText size={16} />{freeeExporting ? 'エクスポート中...' : 'freee API連携'}
                    </button>
                  </div>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredEntries.length === 0 ? (
                  <div className="text-center py-16">
                    <FileText size={48} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 text-sm">対象期間に仕訳データがありません</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {['取引日', '処理日', '勘定科目', '税区分', '金額', '摘要', '対象外'].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredEntries.map(entry => {
                          const amount = getEntryAmount(entry);
                          return (
                            <tr key={entry.id} className={`hover:bg-gray-50 ${entry.is_excluded ? 'opacity-50' : ''}`}>
                              <td className="px-4 py-3 text-gray-700">{formatDate(entry.entry_date)}</td>
                              <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(entry.created_at)}</td>
                              <td className="px-4 py-3 text-gray-900 font-medium">{entry._debitAccountName || '-'}</td>
                              <td className="px-4 py-3 text-gray-600">{entry._debitTaxCatName || '-'}</td>
                              <td className="px-4 py-3 text-right font-mono text-gray-900">{formatCurrency(amount)}</td>
                              <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{entry.description || '-'}</td>
                              <td className="px-4 py-3">{entry.is_excluded && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">対象外</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === '出力履歴' && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">出力履歴</h2>
              {historyLoading ? (
                <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
              ) : exportHistory.length === 0 ? (
                <div className="text-center py-16"><History size={48} className="mx-auto text-gray-300 mb-3" /><p className="text-gray-500 text-sm">出力履歴がありません</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>{['出力日時', '種別', '件数', 'ファイル名', '対象期間', 'ステータス'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {exportHistory.map(rec => (
                        <tr key={rec.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-700">{formatDateTime(rec.created_at)}</td>
                          <td className="px-4 py-3"><span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">CSV</span></td>
                          <td className="px-4 py-3 text-gray-900">{rec.entry_count ?? '-'} 件</td>
                          <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">{rec.file_name ?? '-'}</td>
                          <td className="px-4 py-3 text-gray-600">{rec.start_date && rec.end_date ? `${formatDate(rec.start_date)} 〜 ${formatDate(rec.end_date)}` : '-'}</td>
                          <td className="px-4 py-3"><StatusBadge status={rec.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {ConfirmDialogElement}
    </div>
  );
}