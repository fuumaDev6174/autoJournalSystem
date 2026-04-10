import { useState, useEffect, useMemo } from 'react';
import {
  FileX, AlertCircle, Loader, RotateCcw, FileText, FileSpreadsheet, Package,
  ClipboardList, HelpCircle, Shield, Heart, Home, CreditCard, IdCard, Receipt
} from 'lucide-react';
import { useWorkflow } from '@/web/app/providers/WorkflowProvider';
import { excludedEntriesApi, documentsApi, journalEntriesApi } from '@/web/shared/lib/api/backend.api';

// ============================================
// 3大分類 + サブカテゴリ
// ============================================
type MainCategory = '全て' | '対象外証憑' | '確定申告資料' | 'その他書類';
type SubCategory =
  | '仕訳対象外'
  | '医療費' | '控除証明書' | '住宅ローン' | 'マイナンバー' | '免許証・保険証' | 'その他控除'
  | '契約書' | '見積書' | '発注書' | '納品書' | 'その他';

interface CategoryDef {
  main: MainCategory;
  sub: SubCategory;
  icon: React.ReactNode;
  color: string;
}

const CATEGORY_DEFS: Record<SubCategory, CategoryDef> = {
  '仕訳対象外':     { main: '対象外証憑', sub: '仕訳対象外', icon: <FileX size={16} />, color: 'bg-red-100 text-red-700' },
  '医療費':         { main: '確定申告資料', sub: '医療費', icon: <Heart size={16} />, color: 'bg-pink-100 text-pink-700' },
  '控除証明書':     { main: '確定申告資料', sub: '控除証明書', icon: <Shield size={16} />, color: 'bg-indigo-100 text-indigo-700' },
  '住宅ローン':     { main: '確定申告資料', sub: '住宅ローン', icon: <Home size={16} />, color: 'bg-teal-100 text-teal-700' },
  'マイナンバー':   { main: '確定申告資料', sub: 'マイナンバー', icon: <CreditCard size={16} />, color: 'bg-blue-100 text-blue-700' },
  '免許証・保険証': { main: '確定申告資料', sub: '免許証・保険証', icon: <IdCard size={16} />, color: 'bg-cyan-100 text-cyan-700' },
  'その他控除':     { main: '確定申告資料', sub: 'その他控除', icon: <Receipt size={16} />, color: 'bg-violet-100 text-violet-700' },
  '契約書':         { main: 'その他書類', sub: '契約書', icon: <FileText size={16} />, color: 'bg-purple-100 text-purple-700' },
  '見積書':         { main: 'その他書類', sub: '見積書', icon: <FileSpreadsheet size={16} />, color: 'bg-blue-100 text-blue-700' },
  '発注書':         { main: 'その他書類', sub: '発注書', icon: <ClipboardList size={16} />, color: 'bg-orange-100 text-orange-700' },
  '納品書':         { main: 'その他書類', sub: '納品書', icon: <Package size={16} />, color: 'bg-green-100 text-green-700' },
  'その他':         { main: 'その他書類', sub: 'その他', icon: <HelpCircle size={16} />, color: 'bg-gray-100 text-gray-700' },
};

const MAIN_CATEGORIES: MainCategory[] = ['全て', '対象外証憑', '確定申告資料', 'その他書類'];
const MAIN_ICONS: Record<MainCategory, React.ReactNode> = {
  '全て': <FileX size={18} />,
  '対象外証憑': <FileX size={18} />,
  '確定申告資料': <Shield size={18} />,
  'その他書類': <FileText size={18} />,
};

// document_type_code ベースのカテゴリ推定（フォールバック: テキストマッチ）
const DOC_TYPE_TO_SUBCATEGORY: Record<string, SubCategory> = {
  'medical': '医療費',
  'deduction_cert': '控除証明書',
  'housing_loan': '住宅ローン',
  'mynumber': 'マイナンバー',
  'id_card': '免許証・保険証',
  'other_deduction': 'その他控除',
  'contract': '契約書',
  'estimate': '見積書',
  'purchase_order': '発注書',
  'delivery_note': '納品書',
};

function guessSubCategory(reason: string | null, fileName: string, docTypeCode?: string | null): SubCategory {
  // document_type_code が存在すれば優先
  if (docTypeCode && DOC_TYPE_TO_SUBCATEGORY[docTypeCode]) {
    return DOC_TYPE_TO_SUBCATEGORY[docTypeCode];
  }
  // フォールバック: テキストマッチング
  const text = `${reason || ''} ${fileName}`.toLowerCase();
  if (text.includes('医療') || text.includes('病院') || text.includes('薬局') || text.includes('診療')) return '医療費';
  if (text.includes('控除') || text.includes('証明書') || text.includes('生命保険') || text.includes('地震保険') || text.includes('寄附') || text.includes('ふるさと')) return '控除証明書';
  if (text.includes('住宅ローン') || text.includes('借入金') || text.includes('住宅取得')) return '住宅ローン';
  if (text.includes('マイナンバー') || text.includes('個人番号') || text.includes('通知カード')) return 'マイナンバー';
  if (text.includes('免許') || text.includes('保険証') || text.includes('身分証') || text.includes('運転免許')) return '免許証・保険証';
  if (text.includes('契約') || text.includes('contract')) return '契約書';
  if (text.includes('見積') || text.includes('estimate') || text.includes('quotation')) return '見積書';
  if (text.includes('発注') || text.includes('order') || text.includes('注文')) return '発注書';
  if (text.includes('納品') || text.includes('delivery')) return '納品書';
  return '仕訳対象外';
}

// ============================================
// ExcludedDoc型
// ============================================
interface ExcludedDoc {
  id: string; docId: string; fileName: string;
  excludedReason: string | null; excludedAt: string | null;
  amount: number | null; supplierName: string | null;
  subCategory: SubCategory; mainCategory: MainCategory;
  entryId: string | null;
}

// ============================================
// メインコンポーネント
// ============================================
export default function ExcludedPage() {
  const { currentWorkflow } = useWorkflow();
  const [excludedDocs, setExcludedDocs] = useState<ExcludedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMain, setActiveMain] = useState<MainCategory>('全て');
  const [activeSub, setActiveSub] = useState<SubCategory | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => { if (currentWorkflow) loadExcludedDocs(); }, [currentWorkflow]);

  const loadExcludedDocs = async () => {
    if (!currentWorkflow) return;
    setLoading(true);
    const clientId = currentWorkflow.clientId;

    const { data: entries, error } = await excludedEntriesApi.getByClient(clientId);

    if (error) console.error('対象外証憑取得エラー:', error);

    const { data: excludedDocsDirect } = await documentsApi.getAll({ client_id: clientId, workflow_id: currentWorkflow.id, status: 'excluded' });

    const docs: ExcludedDoc[] = [];
    const seenDocIds = new Set<string>();

    if (entries) {
      entries.forEach((entry: any) => {
        const doc = entry.documents;
        const docId = entry.document_id || '';
        if (docId) seenDocIds.add(docId);
        const fileName = doc?.original_file_name || doc?.file_name || '不明';
        const sub = guessSubCategory(entry.excluded_reason, fileName, doc?.doc_classification);
        docs.push({
          id: entry.id, docId, fileName,
          excludedReason: entry.excluded_reason || entry.description || null,
          excludedAt: entry.excluded_at || null,
          amount: doc?.amount || null, supplierName: doc?.supplier_name || null,
          subCategory: sub, mainCategory: CATEGORY_DEFS[sub].main, entryId: entry.id,
        });
      });
    }

    if (excludedDocsDirect) {
      excludedDocsDirect.forEach((doc: any) => {
        if (seenDocIds.has(doc.id)) return;
        const fileName = doc.original_file_name || doc.file_name || '不明';
        const sub = guessSubCategory(null, fileName, doc.doc_classification);
        docs.push({
          id: `doc-${doc.id}`, docId: doc.id, fileName,
          excludedReason: null, excludedAt: null,
          amount: doc.amount || null, supplierName: doc.supplier_name || null,
          subCategory: sub, mainCategory: CATEGORY_DEFS[sub].main, entryId: null,
        });
      });
    }

    setExcludedDocs(docs);
    setLoading(false);
  };

  const handleRestore = async (doc: ExcludedDoc) => {
    setRestoringId(doc.id);
    try {
      if (doc.entryId) {
        await journalEntriesApi.update(doc.entryId, {
          is_excluded: false, excluded_reason: null, excluded_at: null, excluded_by: null, status: 'draft',
        });
      }
      if (doc.docId) {
        await documentsApi.update(doc.docId, { status: 'reviewed' });
      }
      setExcludedDocs(prev => prev.filter(d => d.id !== doc.id));
      setToastMessage(`「${doc.fileName}」を対象内に戻しました。`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      console.error('対象内復帰エラー:', err);
      alert('復帰に失敗しました');
    } finally {
      setRestoringId(null);
    }
  };

  // 集計
  const mainCounts = useMemo(() => ({
    '全て': excludedDocs.length,
    '対象外証憑': excludedDocs.filter(d => d.mainCategory === '対象外証憑').length,
    '確定申告資料': excludedDocs.filter(d => d.mainCategory === '確定申告資料').length,
    'その他書類': excludedDocs.filter(d => d.mainCategory === 'その他書類').length,
  }), [excludedDocs]);

  const subCounts = useMemo(() => {
    const c: Partial<Record<SubCategory, number>> = {};
    excludedDocs.forEach(d => { c[d.subCategory] = (c[d.subCategory] || 0) + 1; });
    return c;
  }, [excludedDocs]);

  const visibleSubs = useMemo(() => {
    if (activeMain === '全て') return null;
    return Object.values(CATEGORY_DEFS).filter(d => d.main === activeMain).map(d => d.sub);
  }, [activeMain]);

  const filteredDocs = useMemo(() => {
    if (activeSub) return excludedDocs.filter(d => d.subCategory === activeSub);
    if (activeMain === '全て') return excludedDocs;
    return excludedDocs.filter(d => d.mainCategory === activeMain);
  }, [excludedDocs, activeMain, activeSub]);

  if (!currentWorkflow) {
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
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">対象外証憑</h1>
            <p className="text-sm text-gray-500 mt-1">{currentWorkflow.clientName} — 仕訳対象外の証憑を確認・管理します</p>
          </div>

          {/* 大分類タブ */}
          <div className="flex gap-3">
            {MAIN_CATEGORIES.map(cat => (
              <button type="button" key={cat} onClick={() => { setActiveMain(cat); setActiveSub(null); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border-2 transition-all ${
                  activeMain === cat
                    ? cat === '対象外証憑' ? 'bg-red-50 border-red-400 text-red-800'
                    : cat === '確定申告資料' ? 'bg-indigo-50 border-indigo-400 text-indigo-800'
                    : cat === 'その他書類' ? 'bg-gray-50 border-gray-400 text-gray-800'
                    : 'bg-blue-50 border-blue-400 text-blue-800'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                }`}>
                {MAIN_ICONS[cat]}
                <span>{cat}</span>
                <span className={`text-xs ml-1 ${activeMain === cat ? 'opacity-70' : 'text-gray-400'}`}>({mainCounts[cat]})</span>
              </button>
            ))}
          </div>

          {/* サブカテゴリフィルタ */}
          {visibleSubs && visibleSubs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setActiveSub(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${!activeSub ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                全て ({mainCounts[activeMain]})
              </button>
              {visibleSubs.map(sub => {
                const def = CATEGORY_DEFS[sub];
                const count = subCounts[sub] || 0;
                if (count === 0) return null;
                return (
                  <button type="button" key={sub} onClick={() => setActiveSub(sub)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      activeSub === sub ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                    }`}>
                    {def.icon} {sub} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* リスト */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {activeSub || (activeMain === '全て' ? '全対象外証憑' : activeMain)}
              <span className="text-sm font-normal text-gray-500 ml-2">{filteredDocs.length} 件</span>
            </h2>

            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader size={32} className="animate-spin text-blue-500" /></div>
            ) : filteredDocs.length === 0 ? (
              <div className="text-center py-12"><FileX size={64} className="mx-auto text-gray-300 mb-4" /><p className="text-gray-500">該当する証憑はありません</p></div>
            ) : (
              <div className="space-y-3">
                {filteredDocs.map(doc => {
                  const def = CATEGORY_DEFS[doc.subCategory];
                  return (
                    <div key={doc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="text-gray-400">{def.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {doc.supplierName && <span className="text-xs text-gray-500">{doc.supplierName}</span>}
                            {doc.amount != null && <span className="text-xs text-gray-500">¥{doc.amount.toLocaleString()}</span>}
                            {doc.excludedReason && <span className="text-xs text-gray-400">理由: {doc.excludedReason}</span>}
                            {doc.excludedAt && <span className="text-xs text-gray-400">{new Date(doc.excludedAt).toLocaleDateString('ja-JP')}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${def.color}`}>{doc.subCategory}</span>
                        {doc.mainCategory === '対象外証憑' && (
                          <button type="button" onClick={() => handleRestore(doc)} disabled={restoringId === doc.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50">
                            {restoringId === doc.id ? <Loader size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                            対象内に戻す
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* サマリーカード */}
          {excludedDocs.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="card border-l-4 border-red-400 py-3">
                <div className="text-xs text-red-600 font-medium">対象外証憑</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{mainCounts['対象外証憑']}<span className="text-sm font-normal text-gray-400 ml-1">件</span></div>
                <p className="text-xs text-gray-400 mt-1">仕訳確認で対象外にした証憑</p>
              </div>
              <div className="card border-l-4 border-indigo-400 py-3">
                <div className="text-xs text-indigo-600 font-medium">確定申告資料</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{mainCounts['確定申告資料']}<span className="text-sm font-normal text-gray-400 ml-1">件</span></div>
                <p className="text-xs text-gray-400 mt-1">医療費・控除証明書・マイナンバー等</p>
              </div>
              <div className="card border-l-4 border-gray-400 py-3">
                <div className="text-xs text-gray-600 font-medium">その他書類</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{mainCounts['その他書類']}<span className="text-sm font-normal text-gray-400 ml-1">件</span></div>
                <p className="text-xs text-gray-400 mt-1">契約書・見積書・発注書・納品書等</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm"><RotateCcw size={16} />{toastMessage}</div>
        </div>
      )}
    </div>
  );
}