import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ZoomOut, ZoomIn, RotateCcw, ChevronLeft, ChevronRight,
  ChevronDown, Ban, AlertCircle, Loader, CheckCircle, Eye, Search, Undo2, Clock, StickyNote
} from 'lucide-react';
import { useWorkflow } from '@/client/context/WorkflowContext';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/client/lib/supabase';
import { accountItemsApi, taxCategoriesApi } from '@/client/lib/api';
import WorkflowHeader from '@/client/components/workflow/WorkflowHeader';
import type { AccountItem, TaxCategory, Supplier } from '@/types';

// ============================================
// 取引先名の正規化（改善5）
// ============================================
function normalizeJapanese(text: string): string {
  let result = text;
  result = result.replace(/[\uFF66-\uFF9F]/g, (s) => {
    const kanaMap: Record<string, string> = {
      'ｦ':'ヲ','ｧ':'ァ','ｨ':'ィ','ｩ':'ゥ','ｪ':'ェ','ｫ':'ォ','ｬ':'ャ','ｭ':'ュ','ｮ':'ョ','ｯ':'ッ',
      'ｰ':'ー','ｱ':'ア','ｲ':'イ','ｳ':'ウ','ｴ':'エ','ｵ':'オ','ｶ':'カ','ｷ':'キ','ｸ':'ク','ｹ':'ケ','ｺ':'コ',
      'ｻ':'サ','ｼ':'シ','ｽ':'ス','ｾ':'セ','ｿ':'ソ','ﾀ':'タ','ﾁ':'チ','ﾂ':'ツ','ﾃ':'テ','ﾄ':'ト',
      'ﾅ':'ナ','ﾆ':'ニ','ﾇ':'ヌ','ﾈ':'ネ','ﾉ':'ノ','ﾊ':'ハ','ﾋ':'ヒ','ﾌ':'フ','ﾍ':'ヘ','ﾎ':'ホ',
      'ﾏ':'マ','ﾐ':'ミ','ﾑ':'ム','ﾒ':'メ','ﾓ':'モ','ﾔ':'ヤ','ﾕ':'ユ','ﾖ':'ヨ',
      'ﾗ':'ラ','ﾘ':'リ','ﾙ':'ル','ﾚ':'レ','ﾛ':'ロ','ﾜ':'ワ','ﾝ':'ン','ﾞ':'゛','ﾟ':'゜',
    };
    return kanaMap[s] || s;
  });
  result = result.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
  );
  result = result
    .replace(/株式会社|㈱|\(株\)|（株）/g, '')
    .replace(/有限会社|㈲|\(有\)|（有）/g, '')
    .replace(/合同会社|合名会社|合資会社/g, '');
  result = result.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
  return result;
}

// ============================================
// ComboBox（テキスト入力+キーワード検索+プルダウン選択+新規追加）
// ============================================
interface ComboBoxProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string; code?: string; short_name?: string | null; name_kana?: string | null }>;
  placeholder?: string;
  /** テキスト入力値（マスタにないテキスト表示用） */
  textValue?: string;
  /** マスタにない値をテキスト入力した時のコールバック */
  onNewText?: (text: string) => void;
  /** 「マスタに追加」ボタンを表示するか */
  allowCreate?: boolean;
  /** 新規追加時のコールバック */
  onCreateNew?: (name: string) => void;
}

function ComboBox({ value, onChange, options, placeholder = '-- 選択 --', textValue, onNewText, allowCreate, onCreateNew }: ComboBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedOption = options.find(o => o.id === value);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase().trim();
    return options.filter(o => {
      const name = o.name.toLowerCase();
      const shortName = (o.short_name || '').toLowerCase();
      const nameKana = (o.name_kana || '').toLowerCase();
      const code = (o.code || '').toLowerCase();
      return name.includes(q) || shortName.includes(q) || nameKana.includes(q) || code.includes(q) || code.startsWith(q);
    });
  }, [query, options]);

  const handleSelect = (id: string) => { onChange(id); setIsOpen(false); setQuery(''); };
  const displayText = selectedOption
    ? `${selectedOption.code ? selectedOption.code + ' ' : ''}${selectedOption.name}`
    : (textValue || '');

  return (
    <div ref={ref} className="relative">
      <button type="button"
        onClick={() => { setIsOpen(!isOpen); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="w-full border border-gray-300 rounded-lg p-2.5 pr-8 text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
        {displayText ? (
          <span className={selectedOption ? '' : 'text-orange-600'}>{displayText}{!selectedOption && textValue ? ' (未登録)' : ''}</span>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <ChevronDown size={14} className="absolute right-2.5 top-3.5 text-gray-400 pointer-events-none" />
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="名前・ローマ字・番号で検索"
                className="w-full pl-8 pr-2 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (filtered.length === 1) handleSelect(filtered[0].id);
                    else if (filtered.length === 0 && query.trim() && onNewText) {
                      onNewText(query.trim()); setIsOpen(false); setQuery('');
                    }
                  } else if (e.key === 'Escape') setIsOpen(false);
                }} />
            </div>
          </div>
          <div className="overflow-y-auto max-h-48">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">
                該当なし
                {query.trim() && onNewText && (
                  <button type="button" onClick={() => { onNewText(query.trim()); setIsOpen(false); setQuery(''); }}
                    className="ml-2 text-blue-600 hover:underline">「{query}」をテキスト入力</button>
                )}
                {query.trim() && allowCreate && onCreateNew && (
                  <button type="button" onClick={() => { onCreateNew(query.trim()); setIsOpen(false); setQuery(''); }}
                    className="ml-2 text-green-600 hover:underline">マスタに追加</button>
                )}
              </div>
            ) : (
              <>
                {filtered.map(o => (
                  <button key={o.id} type="button" onClick={() => handleSelect(o.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${o.id === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}>
                    {o.code && <span className="text-gray-400 mr-1.5">{o.code}</span>}
                    {o.name}
                    {o.short_name && <span className="text-gray-400 ml-1.5 text-xs">({o.short_name})</span>}
                  </button>
                ))}
                {query.trim() && allowCreate && onCreateNew && !filtered.find(f => f.name === query.trim()) && (
                  <button type="button" onClick={() => { onCreateNew(query.trim()); setIsOpen(false); setQuery(''); }}
                    className="w-full text-left px-3 py-2 text-sm text-green-600 hover:bg-green-50 border-t border-gray-100">
                    + 「{query}」をマスタに追加
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 後方互換: SearchableSelectはComboBoxのエイリアス
const SearchableSelect = ComboBox;

// ============================================
// 型定義
// ============================================
interface EntryRow {
  id: string;
  client_id: string;
  document_id?: string;
  entry_date: string;
  description?: string;
  status: string;
  notes?: string;
  ai_confidence?: number;
  ai_generated?: boolean;
  requires_review?: boolean;
  is_excluded?: boolean;
  lines: LineRow[];
  accountItemName?: string;
  taxCategoryName?: string;
  amount?: number;
}
interface LineRow {
  id: string;
  line_number: number;
  debit_credit: string;
  account_item_id?: string;
  tax_category_id?: string;
  amount?: number;
  description?: string;
  account_item?: { id: string; name: string };
  tax_category?: { id: string; name: string };
}
interface DocumentWithEntry {
  docId: string;
  fileName: string;
  storagePath: string;
  imageUrl: string | null;
  supplierName: string | null;
  documentDate: string | null;
  amount: number | null;
  taxAmount: number | null;
  entryId: string | null;
  entryDate: string;
  description: string;
  status: string;
  isExcluded: boolean;
  isBusiness: boolean;
  aiConfidence: number | null;
  lineId: string | null;
  accountItemId: string;
  taxCategoryId: string;
  lineAmount: number;
  taxRate: number | null;
  supplierId: string | null;
  itemId: string | null;
  notes: string | null;
  docClassification: {
    tategaki?: string | null;
    withholding_tax_amount?: number | null;
    invoice_qualification?: string | null;
    transaction_type?: string | null;
  } | null;
  unmatchedSupplierName: string | null;
  unmatchedItemName: string | null;
  matchedRuleBusinessRatio: number | null;
  ruleCandidates: Array<{ rule_id: string; rule_name: string; scope: string; priority: number; account_item_id: string }>;
}
interface TaxRateOption { id: string; rate: number; name: string; is_current: boolean; }

// multi_entry: 1ドキュメント→N仕訳のグループ表示用
interface MultiEntryGroup {
  documentId: string;
  fileName: string;
  storagePath: string;
  entries: EntryRow[];
  totalAmount: number;
  uncheckedCount: number;
  isExpanded: boolean;
}

type ViewMode = 'list' | 'detail';
type TabFilter = 'all' | 'unchecked' | 'reviewed' | 'excluded';

// ============================================
// メインコンポーネント
// ============================================
export default function ReviewPage() {
  const { currentWorkflow, updateWorkflowData } = useWorkflow();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'excluded' ? 'excluded' : 'all';

  // 共通 state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeTab, setActiveTab] = useState<TabFilter>(initialTab);
  const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [industries, setIndustries] = useState<Array<{ id: string; name: string }>>([]);
  const [itemsMaster, setItemsMaster] = useState<Array<{ id: string; name: string; code: string | null; default_account_item_id: string | null; default_tax_category_id: string | null }>>([]);
  const [businessRatio, setBusinessRatio] = useState(100); // W2: デフォルト100%（家事按分なし）
  const [userRole, setUserRole] = useState<string>('viewer');
  const isManagerOrAdmin = userRole === 'admin' || userRole === 'manager';
  const [clientRatios, setClientRatios] = useState<Array<{ account_item_id: string; business_ratio: number }>>([]);
  const [loading, setLoading] = useState(true);

  // 一覧 state
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [multiEntryGroups, setMultiEntryGroups] = useState<MultiEntryGroup[]>([]);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  // 個別チェック state
  const [items, setItems] = useState<DocumentWithEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [form, setForm] = useState<Partial<DocumentWithEntry>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [addRule, setAddRule] = useState(false);
  const [ruleScope, setRuleScope] = useState<'shared' | 'industry' | 'client'>('shared'); // W3
  const [ruleIndustryId, setRuleIndustryId] = useState('');
  const [ruleSuggestion, setRuleSuggestion] = useState(''); // R11: ルール追加理由のプレビュー
  const [supplierText, setSupplierText] = useState(''); // R2: マスタにない取引先テキスト
  const [itemText, setItemText] = useState('');          // R3: マスタにない品目テキスト
  const selectedRowRef = useRef<HTMLTableRowElement>(null); // 個別チェック時コンパクト一覧の自動スクロール用

  // ============================================
  // データ読み込み
  // ============================================
  useEffect(() => { if (currentWorkflow) loadAllData(); }, [currentWorkflow]);

  const loadAllData = async () => {
    if (!currentWorkflow) return;
    setLoading(true);
    const clientId = currentWorkflow.clientId;
    // ユーザーロール取得
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: userRow } = await supabase.from('users').select('role').eq('id', authUser.id).single();
      if (userRow) setUserRole(userRow.role);
    }

    const { data: docs } = await supabase
      .from('documents')
      .select('id, file_name, original_file_name, storage_path, file_path, supplier_name, document_date, amount, tax_amount, doc_classification')
      .eq('workflow_id', currentWorkflow.id).eq('client_id', clientId).order('created_at');

    if (!docs || docs.length === 0) { setEntries([]); setItems([]); setLoading(false); return; }
    const docIds = docs.map((d: any) => d.id);

    // 一覧用
    const { data: entriesData } = await supabase
      .from('journal_entries')
      .select(`id, client_id, document_id, entry_date, description, status, notes, ai_confidence, ai_generated, requires_review, is_excluded,
        journal_entry_lines ( id, line_number, debit_credit, account_item_id, tax_category_id, amount, description,
          account_item:account_items(id, name), tax_category:tax_categories(id, name) )`)
      .eq('client_id', clientId).in('document_id', docIds)
      .in('status', ['draft', 'reviewed', 'approved', 'posted', 'amended']);

    // documentsの順序（アップロード順）に合わせてソート — 1ドキュメント→N仕訳に対応
    const mappedEntries: EntryRow[] = docIds.flatMap(docId => {
      const docEntries = (entriesData || []).filter((e: any) => e.document_id === docId);
      if (docEntries.length === 0) return [];
      return docEntries.map((entry: any) => {
        const dl = entry.journal_entry_lines?.find((l: any) => l.debit_credit === 'debit') || entry.journal_entry_lines?.[0];
        return { ...entry, lines: entry.journal_entry_lines || [],
          accountItemName: (() => { const ai = dl?.account_item as any; return Array.isArray(ai) ? ai[0]?.name : ai?.name; })(),
          taxCategoryName: (() => { const tc = dl?.tax_category as any; return Array.isArray(tc) ? tc[0]?.name : tc?.name; })(),
          amount: dl?.amount };
      });
    }) as unknown as EntryRow[];
    // ソート統一（取引日→摘要）
    mappedEntries.sort((a, b) => (a.entry_date || '').localeCompare(b.entry_date || '') || (a.description || '').localeCompare(b.description || ''));
    setEntries(mappedEntries);

    // multi_entry: 1ドキュメントに複数仕訳があるグループを検出
    const docEntryMap = new Map<string, EntryRow[]>();
    for (const entry of mappedEntries) {
      if (!entry.document_id) continue;
      const existing = docEntryMap.get(entry.document_id) || [];
      existing.push(entry);
      docEntryMap.set(entry.document_id, existing);
    }
    const groups: MultiEntryGroup[] = [];
    for (const [docId, docEntries] of docEntryMap) {
      if (docEntries.length <= 1) continue;
      const doc = docs.find((d: any) => d.id === docId);
      groups.push({
        documentId: docId,
        fileName: doc?.original_file_name || doc?.file_name || '',
        storagePath: doc?.storage_path || doc?.file_path || '',
        entries: docEntries,
        totalAmount: docEntries.reduce((sum, e) => sum + (e.amount || 0), 0),
        uncheckedCount: docEntries.filter(e => e.status === 'draft').length,
        isExpanded: false,
      });
    }
    setMultiEntryGroups(groups);

    // 個別用
    const { data: entriesForDetail } = await supabase
      .from('journal_entries')
      .select(`id, entry_date, description, status, is_excluded, ai_confidence, document_id, notes,
        journal_entry_lines ( id, debit_credit, account_item_id, tax_category_id, amount, tax_rate, description, supplier_id, item_id )`)
      .eq('client_id', clientId).in('document_id', docIds).in('status', ['draft', 'approved', 'posted']);

    const merged: DocumentWithEntry[] = await Promise.all(docs.map(async (doc: any) => {
      const path = doc.storage_path || doc.file_path || '';
      let imageUrl: string | null = null;
      if (path) { const { data: u } = await supabase.storage.from('documents').createSignedUrl(path, 3600); imageUrl = u?.signedUrl || null; }
      const entry = entriesForDetail?.find((e: any) => e.document_id === doc.id);
      const dl = entry?.journal_entry_lines?.find((l: any) => l.debit_credit === 'debit') || entry?.journal_entry_lines?.[0];
      return {
        docId: doc.id, fileName: doc.original_file_name || doc.file_name, storagePath: path, imageUrl,
        supplierName: doc.supplier_name, documentDate: doc.document_date, amount: doc.amount, taxAmount: doc.tax_amount,
        entryId: entry?.id || null, entryDate: entry?.entry_date || doc.document_date || new Date().toISOString().split('T')[0],
        description: entry?.description || doc.supplier_name || '', status: entry?.status || 'draft',
        isExcluded: entry?.is_excluded || false, isBusiness: !entry?.is_excluded,
        aiConfidence: entry?.ai_confidence || null, lineId: dl?.id || null,
        accountItemId: dl?.account_item_id || '', taxCategoryId: dl?.tax_category_id || '',
        lineAmount: dl?.amount || doc.amount || 0, taxRate: dl?.tax_rate || null,
        supplierId: dl?.supplier_id || null, itemId: dl?.item_id || null,
        notes: entry?.notes || null,
        docClassification: doc.doc_classification || null,
        unmatchedSupplierName: null,
        unmatchedItemName: null,
        matchedRuleBusinessRatio: null,
        ruleCandidates: [],
      } as DocumentWithEntry;
    }));
    // R1: 自動マッチはマスタ取得後に実行（下記参照）
    const merged_temp = merged;

    // マスタ
    const [aRes, tRes] = await Promise.all([accountItemsApi.getAll(), taxCategoriesApi.getAll()]);
    if (aRes.data) setAccountItems(aRes.data);
    if (tRes.data) setTaxCategories(tRes.data);
    const { data: rates } = await supabase.from('tax_rates').select('id, rate, name, is_current').order('rate', { ascending: false });
    if (rates) setTaxRates(rates.map((r: any) => ({ id: r.id, rate: Number(r.rate), name: r.name, is_current: r.is_current })));
    const { data: sData } = await supabase.from('suppliers').select('*').eq('is_active', true).order('name');
    if (sData) setSuppliers(sData);
    const { data: inds } = await supabase.from('industries').select('id, name').eq('is_active', true).order('sort_order');
    if (inds) setIndustries(inds);

    // C6: 品目マスタ取得
    const { data: itemsData } = await supabase.from('items').select('id, name, code, default_account_item_id, default_tax_category_id').eq('is_active', true).order('name');
    if (itemsData) setItemsMaster(itemsData);

    // C1: 家事按分率取得（現在の顧客の按分設定）
    if (currentWorkflow?.clientId) {
      const { data: ratios } = await supabase
        .from('client_account_ratios')
        .select('account_item_id, business_ratio')
        .eq('client_id', currentWorkflow.clientId)
        .is('valid_until', null);
      if (ratios) setClientRatios(ratios);
    }

    // タスク8: 業種デフォルト科目の取得
    const { data: clientIndustryData } = await supabase
      .from('client_industries')
      .select('industry_id')
      .eq('client_id', clientId);
    const { data: clientRow } = await supabase
      .from('clients')
      .select('industry_id')
      .eq('id', clientId)
      .single();
    const clientIndustryIds = [
      ...(clientIndustryData?.map((ci: any) => ci.industry_id) || []),
      ...(clientRow?.industry_id ? [clientRow.industry_id] : []),
    ].filter((id, idx, arr) => arr.indexOf(id) === idx);

    let industryAccountItems: any[] = [];
    if (clientIndustryIds.length > 0) {
      const { data: indAccounts } = await supabase
        .from('account_items')
        .select('id, name, industry_id, tax_category_id')
        .in('industry_id', clientIndustryIds)
        .eq('is_active', true);
      if (indAccounts) industryAccountItems = indAccounts;
    }

    // R1: AI読み取り結果から取引先・品目を自動セット
    // supplier_aliases も検索して取引先を解決
    const { data: aliasData } = await supabase.from('supplier_aliases').select('supplier_id, alias');
    const aliases = aliasData || [];

    const allAccountItems = aRes.data || [];
    const allItemsData = itemsData || [];

    const autoMatched = merged_temp.map(item => {
      const updated = { ...item };

      // ============================================
      // 取引先の自動マッチ
      // ============================================
      if (!updated.supplierId && updated.supplierName && sData) {
        const sName = normalizeJapanese(updated.supplierName).toLowerCase();
        const exactMatch = sData.find((s: any) => normalizeJapanese(s.name).toLowerCase() === sName);
        const partialMatch = !exactMatch ? sData.find((s: any) => {
          const norm = normalizeJapanese(s.name).toLowerCase();
          return sName.includes(norm) || norm.includes(sName);
        }) : null;
        const aliasMatch = !exactMatch && !partialMatch ? aliases.find(a => {
          const normAlias = normalizeJapanese(a.alias).toLowerCase();
          return sName.includes(normAlias) || normAlias.includes(sName);
        }) : null;

        let matchedSupplier: any = null;
        if (exactMatch) {
          updated.supplierId = exactMatch.id;
          matchedSupplier = exactMatch;
        } else if (partialMatch) {
          updated.supplierId = partialMatch.id;
          matchedSupplier = partialMatch;
        } else if (aliasMatch) {
          updated.supplierId = aliasMatch.supplier_id;
          matchedSupplier = sData.find((s: any) => s.id === aliasMatch.supplier_id);
        }

        // 取引先のデフォルト勘定科目・税区分を自動セット（AI未設定の場合のみ）
        if (matchedSupplier) {
          if (!updated.accountItemId && matchedSupplier.default_account_item_id) {
            updated.accountItemId = matchedSupplier.default_account_item_id;
            const acct = allAccountItems.find((a: any) => a.id === matchedSupplier.default_account_item_id);
            if (acct?.tax_category_id && !updated.taxCategoryId) {
              updated.taxCategoryId = acct.tax_category_id;
            }
          }
          if (!updated.taxCategoryId && matchedSupplier.default_tax_category_id) {
            updated.taxCategoryId = matchedSupplier.default_tax_category_id;
          }
        }

        // 取引先が未マッチの場合、OCR名を保持
        if (!matchedSupplier && updated.supplierName) {
          updated.unmatchedSupplierName = updated.supplierName;
        } else {
          updated.unmatchedSupplierName = null;
        }
      }

      // ============================================
      // 品目の自動マッチ（タスク2）
      // ============================================
      if (!updated.itemId && allItemsData) {
        const desc = (updated.description || '').toLowerCase();
        const itemMatch = allItemsData.find((it: any) =>
          it.name && (desc.includes(it.name.toLowerCase()) || it.name.toLowerCase().includes(desc))
        );
        if (itemMatch) {
          updated.itemId = itemMatch.id;
          if (!updated.accountItemId && itemMatch.default_account_item_id) {
            updated.accountItemId = itemMatch.default_account_item_id;
            const acct = allAccountItems.find((a: any) => a.id === itemMatch.default_account_item_id);
            if (acct?.tax_category_id && !updated.taxCategoryId) {
              updated.taxCategoryId = acct.tax_category_id;
            }
          }
          if (!updated.taxCategoryId && itemMatch.default_tax_category_id) {
            updated.taxCategoryId = itemMatch.default_tax_category_id;
          }
        }

        // 品目が未マッチの場合、摘要を保持
        if (!itemMatch && updated.description) {
          updated.unmatchedItemName = updated.description;
        } else {
          updated.unmatchedItemName = null;
        }
      }

      // ============================================
      // 業種デフォルト科目のフォールバック（タスク8）
      // ============================================
      if (!updated.accountItemId && industryAccountItems.length > 0) {
        const industryDefault = industryAccountItems[0];
        if (industryDefault) {
          updated.accountItemId = industryDefault.id;
          if (industryDefault.tax_category_id && !updated.taxCategoryId) {
            updated.taxCategoryId = industryDefault.tax_category_id;
          }
        }
      }

      return updated;
    });

    // ソート: 一覧（entries）と同じ順序に統一（取引日→摘要）
    autoMatched.sort((a, b) =>
      (a.entryDate || '').localeCompare(b.entryDate || '') ||
      (a.description || '').localeCompare(b.description || '')
    );
    setItems(autoMatched);
    if (autoMatched.length > 0) { setCurrentIndex(0); setForm({ ...autoMatched[0] }); }

    setLoading(false);
  };

  // ============================================
  // 勘定科目→税区分自動割当
  // ============================================
  const handleAccountItemChange = (accountItemId: string) => {
    const ai = accountItems.find(a => a.id === accountItemId);
    const updates: Partial<DocumentWithEntry> = { accountItemId };
    if (ai?.tax_category_id) {
      updates.taxCategoryId = ai.tax_category_id;
      const tc = taxCategories.find(t => t.id === ai.tax_category_id);
      if (tc?.current_tax_rate_id) {
        const rate = taxRates.find(r => r.id === tc.current_tax_rate_id);
        if (rate) updates.taxRate = rate.rate;
      } else if (tc) {
        const mr = taxRates.find(r => tc.name.includes(`${Math.round(r.rate * 100)}%`));
        if (mr) updates.taxRate = mr.rate;
        else updates.taxRate = null;
      }
    }
    // C1: 按分率の自動セット（client_account_ratiosから）
    const ratio = clientRatios.find(r => r.account_item_id === accountItemId);
    if (ratio) {
      setBusinessRatio(Math.round(Number(ratio.business_ratio) * 100));
    }
    // R5: AI元の勘定科目と違う場合、ルール追加を推奨
    const currentItem = items[currentIndex];
    if (currentItem && currentItem.accountItemId && currentItem.accountItemId !== accountItemId) {
      setAddRule(true);
      setRuleSuggestion(`勘定科目変更: ${accountItems.find(a => a.id === currentItem.accountItemId)?.name || '?'} → ${ai?.name || '?'}`);
    }
    setForm(p => ({ ...p, ...updates }));
  };

  // ============================================
  // 取引先→デフォルト勘定科目/税区分（タスク4）
  // ============================================
  const handleSupplierChange = (supplierId: string) => {
    const s = suppliers.find(x => x.id === supplierId);
    const updates: Partial<DocumentWithEntry> = { supplierId: supplierId || null };

    if (s) {
      if (s.default_account_item_id) {
        updates.accountItemId = s.default_account_item_id;
        const acct = accountItems.find(a => a.id === s.default_account_item_id);
        if (acct?.tax_category_id) {
          updates.taxCategoryId = acct.tax_category_id;
          const tc = taxCategories.find(t => t.id === acct.tax_category_id);
          if (tc?.current_tax_rate_id) {
            const rate = taxRates.find(r => r.id === tc.current_tax_rate_id);
            if (rate) updates.taxRate = rate.rate;
          }
        }
      }
      if (!updates.taxCategoryId && s.default_tax_category_id) {
        updates.taxCategoryId = s.default_tax_category_id;
        const tc = taxCategories.find(t => t.id === s.default_tax_category_id);
        if (tc?.current_tax_rate_id) {
          const rate = taxRates.find(r => r.id === tc.current_tax_rate_id);
          if (rate) updates.taxRate = rate.rate;
        }
      }
    }

    setForm(p => ({ ...p, ...updates }));
  };

  // ============================================
  // 品目→デフォルト勘定科目/税区分（タスク3）
  // ============================================
  const handleItemChange = (itemId: string) => {
    const item = itemsMaster.find(x => x.id === itemId);
    const updates: Partial<DocumentWithEntry> = { itemId: itemId || null };

    if (item) {
      if (item.default_account_item_id) {
        updates.accountItemId = item.default_account_item_id;
        const acct = accountItems.find(a => a.id === item.default_account_item_id);
        if (acct?.tax_category_id) {
          updates.taxCategoryId = acct.tax_category_id;
          const tc = taxCategories.find(t => t.id === acct.tax_category_id);
          if (tc?.current_tax_rate_id) {
            const rate = taxRates.find(r => r.id === tc.current_tax_rate_id);
            if (rate) updates.taxRate = rate.rate;
          }
        }
      }
      if (!updates.taxCategoryId && item.default_tax_category_id) {
        updates.taxCategoryId = item.default_tax_category_id;
        const tc = taxCategories.find(t => t.id === item.default_tax_category_id);
        if (tc?.current_tax_rate_id) {
          const rate = taxRates.find(r => r.id === tc.current_tax_rate_id);
          if (rate) updates.taxRate = rate.rate;
        }
      }
    }

    setForm(p => ({ ...p, ...updates }));
    setItemText('');
  };

  // ============================================
  // 一覧→個別チェック遷移
  // ============================================
  const openDetail = (entryId: string) => {
    const entry = entries.find(e => e.id === entryId);
    const docItem = items.find(i => i.docId === entry?.document_id || i.entryId === entryId);
    if (docItem) {
      setCurrentIndex(items.indexOf(docItem));
      setForm({ ...docItem });
      setAiOriginalForm({ ...docItem });
      setSupplierText(docItem.unmatchedSupplierName || '');
      setItemText(docItem.unmatchedItemName || '');
    }
    setSavedAt(null); setAddRule(false); setRuleIndustryId(''); setRotation(0);
    setViewMode('detail');
  };

  const openDetailFromTop = () => {
    if (items.length === 0) return;
    setCurrentIndex(0); setForm({ ...items[0] });
    setAiOriginalForm({ ...items[0] });
    setSupplierText(items[0].unmatchedSupplierName || '');
    setItemText(items[0].unmatchedItemName || '');
    setSavedAt(null); setAddRule(false); setRuleIndustryId(''); setRotation(0);
    setViewMode('detail');
  };

  // ============================================
  // 個別: 保存 + 次へ（次へ押したら approved に）
  // ============================================
  const saveCurrentItem = async (markApproved = false) => {
    const item = items[currentIndex];
    if (!item) return;
    setSaving(true);
    let entryId = form.entryId;
    // ステータス遷移ロジック
    let targetStatus: string;
    if (form.isExcluded) {
      targetStatus = 'draft';
    } else if (!markApproved) {
      // スキップ（保存のみ）: ステータスを変えない
      targetStatus = item.status === 'posted' ? 'posted' : item.status;
    } else if (isManagerOrAdmin) {
      // manager/admin: 確認・承認 → approved に直接遷移
      targetStatus = 'approved';
    } else {
      // operator: 確認OK → reviewed に遷移
      targetStatus = 'reviewed';
    }

    if (!entryId) {
      const { data: cd } = await supabase.from('clients').select('organization_id').eq('id', currentWorkflow!.clientId).single();
      if (!cd?.organization_id) { setSaving(false); return; }
      const { data: ne, error } = await supabase.from('journal_entries').insert({
        organization_id: cd.organization_id, client_id: currentWorkflow!.clientId, document_id: item.docId,
        entry_date: form.entryDate || new Date().toISOString().split('T')[0], entry_type: 'normal',
        description: form.description || '', notes: form.notes || null, status: targetStatus, is_excluded: form.isExcluded || false, ai_generated: false,
      }).select().single();
      if (error || !ne) { console.error('仕訳作成エラー:', error); setSaving(false); return; }
      entryId = ne.id;
      const { data: nl } = await supabase.from('journal_entry_lines').insert({
        journal_entry_id: entryId, line_number: 1, debit_credit: 'debit',
        account_item_id: form.accountItemId || null, tax_category_id: form.taxCategoryId || null,
        tax_rate: form.taxRate || null, amount: form.lineAmount || 0,
        supplier_id: form.supplierId || null, item_id: form.itemId || null,
      }).select().single();
      setForm(p => ({ ...p, entryId, lineId: nl?.id || null }));
    } else {
      await supabase.from('journal_entries').update({
        entry_date: form.entryDate, description: form.description, notes: form.notes || null,
        is_excluded: form.isExcluded, status: targetStatus,
      }).eq('id', entryId);
      if (form.lineId) {
        await supabase.from('journal_entry_lines').update({
          account_item_id: form.accountItemId || null, tax_category_id: form.taxCategoryId || null,
          tax_rate: form.taxRate || null, amount: form.lineAmount,
          supplier_id: form.supplierId || null, item_id: form.itemId || null,
        }).eq('id', form.lineId);
      }
      // 承認履歴の記録（journal_entry_approvals）
    if (markApproved && entryId && !form.isExcluded) {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        if (isManagerOrAdmin) {
          // manager/admin の自己承認: approved レコードを作成
          await supabase.from('journal_entry_approvals').insert([{
            journal_entry_id: entryId,
            approver_id: currentUser.id,
            approval_status: 'approved',
            approval_level: 1,
            approved_at: new Date().toISOString(),
            comments: '自己確認・承認',
          }]);
        } else {
          // operator: reviewed（確認OK）の記録
          await supabase.from('journal_entry_approvals').insert([{
            journal_entry_id: entryId,
            approver_id: currentUser.id,
            approval_status: 'pending',
            approval_level: 1,
            comments: '確認OK',
          }]);
        }
      }
    }
    }
    // ルール追加
    if (addRule && form.accountItemId) {
      await supabase.from('processing_rules').insert([{
        rule_name: `${form.description || item.supplierName || '不明'} → 自動仕訳`, priority: 100,
        rule_type: '支出', scope: ruleScope, industry_id: ruleScope === 'industry' ? (ruleIndustryId || null) : null,
        client_id: ruleScope === 'client' ? currentWorkflow?.clientId || null : null,
        conditions: { supplier_pattern: item.supplierName || null },
        actions: { account_item_id: form.accountItemId, tax_category_id: form.taxCategoryId || null, description_template: form.description || null },
        auto_apply: true, require_confirmation: false, is_active: true,
      }]);
    }

    // 改善5-D: alias自動追加（取引先マッチ済みでOCR名と異なる場合）
    if (form.supplierId && item.supplierName) {
      const matchedSupplier = suppliers.find(s => s.id === form.supplierId);
      if (matchedSupplier && normalizeJapanese(matchedSupplier.name) !== normalizeJapanese(item.supplierName)) {
        // 既存aliasと重複チェック
        const { data: existingAlias } = await supabase
          .from('supplier_aliases')
          .select('id')
          .eq('supplier_id', form.supplierId)
          .eq('alias_name', item.supplierName)
          .limit(1);
        if (!existingAlias || existingAlias.length === 0) {
          await supabase.from('supplier_aliases').insert({
            supplier_id: form.supplierId,
            alias_name: item.supplierName,
            source: 'ai_suggested',
          });
        }
      }
    }

    // C1: 家事按分率の保存（按分率が100%未満の場合）
    if (!form.isExcluded && form.accountItemId && businessRatio < 100 && currentWorkflow?.clientId) {
      const { data: clientData } = await supabase.from('clients').select('organization_id').eq('id', currentWorkflow.clientId).single();
      if (clientData?.organization_id) {
        // upsert: 同一クライアント・勘定科目の既存レコードを更新
        await supabase.from('client_account_ratios').upsert({
          organization_id: clientData.organization_id,
          client_id: currentWorkflow.clientId,
          account_item_id: form.accountItemId,
          business_ratio: businessRatio / 100,
          valid_from: new Date().toISOString().split('T')[0],
          notes: `仕訳確認画面から設定（${form.description || ''})`,
        }, { onConflict: 'client_id,account_item_id,valid_from' });
      }
    }

    // 改善3: 修正履歴の記録（AI初期値と比較して変更があった場合）
    if (entryId && !form.isExcluded && currentWorkflow?.clientId) {
      const corrections: Array<{ field_name: string; original_value: string | null; corrected_value: string | null; original_name: string | null; corrected_name: string | null }> = [];
      if (aiOriginalForm.accountItemId && form.accountItemId && aiOriginalForm.accountItemId !== form.accountItemId) {
        corrections.push({
          field_name: 'account_item_id',
          original_value: aiOriginalForm.accountItemId,
          corrected_value: form.accountItemId,
          original_name: accountItems.find(a => a.id === aiOriginalForm.accountItemId)?.name || null,
          corrected_name: accountItems.find(a => a.id === form.accountItemId)?.name || null,
        });
      }
      if (aiOriginalForm.taxCategoryId && form.taxCategoryId && aiOriginalForm.taxCategoryId !== form.taxCategoryId) {
        corrections.push({
          field_name: 'tax_category_id',
          original_value: aiOriginalForm.taxCategoryId,
          corrected_value: form.taxCategoryId,
          original_name: taxCategories.find(t => t.id === aiOriginalForm.taxCategoryId)?.name || null,
          corrected_name: taxCategories.find(t => t.id === form.taxCategoryId)?.name || null,
        });
      }
      if (corrections.length > 0) {
        const { data: cd } = await supabase.from('clients').select('organization_id').eq('id', currentWorkflow.clientId).single();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (cd?.organization_id && authUser) {
          for (const c of corrections) {
            await supabase.from('journal_entry_corrections').insert({
              organization_id: cd.organization_id,
              journal_entry_id: entryId,
              client_id: currentWorkflow.clientId,
              field_name: c.field_name,
              original_value: c.original_value,
              corrected_value: c.corrected_value,
              original_name: c.original_name,
              corrected_name: c.corrected_name,
              supplier_name: item.supplierName || null,
              corrected_by: authUser.id,
            });
          }
          // 改善3-C: 同一パターン3回以上でルール提案
          if (corrections.find(c => c.field_name === 'account_item_id')) {
            const { data: samePattern, count } = await supabase
              .from('journal_entry_corrections')
              .select('id', { count: 'exact' })
              .eq('client_id', currentWorkflow.clientId)
              .eq('field_name', 'account_item_id')
              .eq('corrected_value', form.accountItemId!)
              .eq('supplier_name', item.supplierName || '')
              .eq('rule_suggested', false);
            if ((count || 0) >= 3) {
              setAddRule(true);
              setRuleSuggestion(`同じ修正が${count}回検出されました。ルール追加を推奨します。`);
              // rule_suggestedフラグを更新
              if (samePattern) {
                await supabase.from('journal_entry_corrections')
                  .update({ rule_suggested: true })
                  .eq('client_id', currentWorkflow.clientId)
                  .eq('field_name', 'account_item_id')
                  .eq('corrected_value', form.accountItemId!)
                  .eq('supplier_name', item.supplierName || '');
              }
            }
          }
        }
      }
    }

    setItems(prev => prev.map((it, i) => i === currentIndex ? { ...it, ...form, entryId, status: targetStatus } as DocumentWithEntry : it));

    // W6: 一覧テーブルもリアルタイム更新（ページリロード不要）
    setEntries(prev => prev.map(e => {
      if (e.id === entryId || e.document_id === item.docId) {
        return {
          ...e,
          status: targetStatus,
          is_excluded: form.isExcluded || false,
          description: form.description || e.description,
          accountItemName: accountItems.find(a => a.id === form.accountItemId)?.name || e.accountItemName,
          taxCategoryName: taxCategories.find(t => t.id === form.taxCategoryId)?.name || e.taxCategoryName,
          amount: form.lineAmount || e.amount,
        };
      }
      return e;
    }));

    setSaving(false); setSavedAt(new Date().toLocaleTimeString('ja-JP'));
  };

  // 次へ（保存+approved+次の証憑に移動）
  const goNext = async () => {
    await saveCurrentItem(true);
    if (currentIndex < items.length - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next); setForm({ ...items[next] }); setSavedAt(null); setAddRule(false); setRuleIndustryId(''); setRotation(0);
      setBusinessRatio(100); setAiOriginalForm({ ...items[next] });
      setSupplierText(items[next].unmatchedSupplierName || '');
      setItemText(items[next].unmatchedItemName || '');
      setRuleSuggestion('');
    }
  };
  const goPrev = async () => {
    await saveCurrentItem(false);
    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      setCurrentIndex(prev); setForm({ ...items[prev] }); setSavedAt(null); setAddRule(false); setRuleIndustryId(''); setRotation(0);
      setBusinessRatio(100); setAiOriginalForm({ ...items[prev] });
      setSupplierText(items[prev].unmatchedSupplierName || '');
      setItemText(items[prev].unmatchedItemName || '');
      setRuleSuggestion('');
    }
  };


  // 事業用/プライベート/対象外
  // AI初期値を保持（事業用↔プライベート切替で復元用）
  const [aiOriginalForm, setAiOriginalForm] = useState<Partial<DocumentWithEntry>>({});

  const setBusiness = (isBusiness: boolean) => {
    if (!isBusiness) {
      // 事業用→プライベートに切替: 現在のフォーム値をAI初期値として保存
      setAiOriginalForm({ accountItemId: form.accountItemId, taxCategoryId: form.taxCategoryId, taxRate: form.taxRate });
      const jk = accountItems.find(a => a.name === '事業主貸');
      const taigaisotsu = taxCategories.find(t => t.code === 'NON_TAXABLE');
      setForm(p => ({
        ...p,
        isBusiness: false,
        isExcluded: false,
        accountItemId: jk?.id || p.accountItemId,
        taxCategoryId: taigaisotsu?.id || p.taxCategoryId,
        taxRate: null,
      }));
    } else {
      // プライベート→事業用に切替: AI初期値を復元
      setForm(p => ({
        ...p,
        isBusiness: true,
        isExcluded: false,
        accountItemId: aiOriginalForm.accountItemId || p.accountItemId,
        taxCategoryId: aiOriginalForm.taxCategoryId || p.taxCategoryId,
        taxRate: aiOriginalForm.taxRate ?? p.taxRate,
      }));
    }
  };
  const toggleExclude = () => setForm(p => ({ ...p, isExcluded: !p.isExcluded, isBusiness: p.isExcluded }));

  // ============================================
  // C2: 差し戻し機能
  // approved → draft（税理士が戻す）
  // posted → approved（確定解除）
  // ============================================
  const handleRevert = async (entryId: string, currentStatus: string) => {
    if (currentStatus === 'reviewed' && isManagerOrAdmin) {
      // reviewed → draft（マネージャーが差し戻し）
      await supabase.from('journal_entries').update({ status: 'draft' }).eq('id', entryId);
    } else if (currentStatus === 'approved') {
      if (!isManagerOrAdmin) return;
      await supabase.from('journal_entries').update({ status: 'draft' }).eq('id', entryId);
    } else if (currentStatus === 'posted') {
      if (!isManagerOrAdmin) return;
      if (!window.confirm('エクスポート済みの仕訳を修正対象にしますか？')) return;
      await supabase.from('journal_entries').update({ status: 'amended' }).eq('id', entryId);
    }
    await loadAllData();
  };

  // 一覧からの個別承認（manager/admin用）
  const handleApproveFromList = async (entryId: string) => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser || !isManagerOrAdmin) return;
    
    await supabase.from('journal_entries').update({ status: 'approved' }).eq('id', entryId);
    await supabase.from('journal_entry_approvals').insert([{
      journal_entry_id: entryId,
      approver_id: currentUser.id,
      approval_status: 'approved',
      approval_level: 1,
      approved_at: new Date().toISOString(),
      comments: '一覧画面から承認',
    }]);
    
    await loadAllData();
  };

  // ============================================
  // multi_entry: グループ展開/折りたたみ
  // ============================================
  const toggleMultiEntryGroup = (docId: string) => {
    setExpandedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId); else next.add(docId);
      return next;
    });
  };

  const handleBulkReviewGroup = async (docId: string) => {
    const group = multiEntryGroups.find(g => g.documentId === docId);
    if (!group) return;
    const draftIds = group.entries.filter(e => e.status === 'draft').map(e => e.id);
    if (draftIds.length === 0) return;
    const targetStatus = isManagerOrAdmin ? 'approved' : 'reviewed';
    await supabase.from('journal_entries').update({ status: targetStatus }).in('id', draftIds);
    await loadAllData();
  };

  // ============================================
  // C5: ショートカットキー（全面拡張）
  // ============================================
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // --- 個別チェックモード ---
    if (viewMode === 'detail') {
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); setBusiness(!form.isBusiness); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setAddRule(prev => !prev); }
      else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); toggleExclude(); }
      else if ((e.key === 'n' || e.key === 'N') && !e.shiftKey) { e.preventDefault(); goNext(); }
      else if ((e.key === 'n' || e.key === 'N') && e.shiftKey) { e.preventDefault(); goPrev(); }
      else if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowRight' && !e.altKey && currentIndex < items.length - 1) { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft' && !e.altKey && currentIndex > 0) { e.preventDefault(); goPrev(); }
      else if (e.key === 'Escape') { e.preventDefault(); saveCurrentItem(false); setViewMode('list'); loadAllData(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(z => Math.min(300, z + 25)); }
      else if (e.key === '-') { e.preventDefault(); setZoom(z => Math.max(25, z - 25)); }
      else if (e.key === '0') { e.preventDefault(); setZoom(100); }
      else if (e.key === 's' && e.ctrlKey) { e.preventDefault(); saveCurrentItem(false); }
    }

    // --- 一覧モード ---
    if (viewMode === 'list') {
      if (e.key === 'i' || e.key === 'I') { e.preventDefault(); openDetailFromTop(); }
    }
  }, [viewMode, form.isBusiness, currentIndex, items.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // 個別チェック時: 選択行への自動スクロール
  useEffect(() => {
    if (viewMode === 'detail' && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentIndex, viewMode]);

  // ワークフロー次へ（仕訳出力に進む前に全件確定）
  const handleBeforeNext = async (): Promise<boolean> => {
    if (viewMode === 'detail') await saveCurrentItem(true);
    const drafts = entries.filter(e => e.status === 'draft');
    if (drafts.length > 0) {
      const ok = window.confirm(`未確認の仕訳が${drafts.length}件あります。\n\n仕訳を確定して出力に進みますか？`);
      if (!ok) return false;
      const bulkStatus = isManagerOrAdmin ? 'approved' : 'reviewed';
      await supabase.from('journal_entries').update({ status: bulkStatus }).in('id', drafts.map(e => e.id));
    }
    // 全件をpostedに
    const allIds = entries.map(e => e.id);
    if (allIds.length > 0) {
      await supabase.from('journal_entries').update({ status: 'posted' }).in('id', allIds);
    }
    updateWorkflowData({ reviewCompleted: true });
    return true;
  };

  const fmt = (n: number | undefined) => n == null ? '-' : `¥${Number(n).toLocaleString()}`;

  // ============================================
  // タブフィルター
  // ============================================
  const filteredEntries = useMemo(() => {
    if (activeTab === 'unchecked') return entries.filter(e => e.status === 'draft');
    if (activeTab === 'excluded') return entries.filter(e => e.is_excluded);
    
    return entries;
  }, [entries, activeTab]);

  const allCount = entries.length;
  const uncheckedCount = entries.filter(e => e.status === 'draft').length;
  const reviewedCount = entries.filter(e => e.status === 'reviewed').length;
  const approvedCount = entries.filter(e => e.status === 'approved' || e.status === 'posted').length;
  //const amendedCount = entries.filter(e => e.status === 'amended').length;
  const excludedCount = entries.filter(e => e.is_excluded).length;
  const reviewCount = entries.filter(e => e.requires_review || (e.ai_confidence != null && e.ai_confidence < 0.7)).length;

  // ============================================
  // ガード
  // ============================================
  if (!currentWorkflow) return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="text-center max-w-md">
        <AlertCircle size={64} className="text-yellow-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">ワークフローが開始されていません</h2>
        <p className="text-gray-600 mb-6">顧客一覧からワークフローを開始してください。</p>
        <a href="/clients" className="btn-primary">顧客一覧へ戻る</a>
      </div>
    </div>
  );
  if (loading) return (
    <div className="flex flex-col">
      <WorkflowHeader onBeforeNext={handleBeforeNext} nextLabel="仕訳出力へ" />
      <div className="flex-1 flex items-center justify-center p-6">
        <Loader size={32} className="animate-spin text-blue-500" /><span className="ml-3 text-gray-500">読み込み中...</span>
      </div>
    </div>
  );

  // ============================================
  // レンダリング
  // ============================================
  return (
    <div className="flex flex-col bg-gray-50">
      <WorkflowHeader onBeforeNext={handleBeforeNext} nextLabel="仕訳出力へ" />

      {/* タブ */}
      <div className="bg-white px-6 border-b border-gray-200 flex gap-0 flex-shrink-0">
        {([
          { key: 'all' as TabFilter, label: 'すべて', count: allCount },
          { key: 'unchecked' as TabFilter, label: '未確認', count: uncheckedCount },
          { key: 'reviewed' as TabFilter, label: '承認待ち', count: reviewedCount },
          { key: 'excluded' as TabFilter, label: '対象外', count: excludedCount },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? 'text-blue-600 border-blue-600 font-semibold' : 'text-gray-500 border-transparent hover:text-gray-700'
              
            }`}>
            {tab.label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-7xl mx-auto space-y-5">

          {/* サマリーカード */}
          {viewMode === 'list' && (
            <div className="grid grid-cols-4 gap-3">
              {([
                { label: '全件', count: allCount, color: 'text-gray-900', bg: 'bg-white' },
                { label: '確認済み', count: approvedCount, color: 'text-green-600', bg: 'bg-green-50' },
                { label: '未確認', count: uncheckedCount, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: '要確認', count: reviewCount, color: 'text-orange-600', bg: 'bg-orange-50' },
              ]).map(c => (
                <div key={c.label} className={`${c.bg} rounded-lg border border-gray-200 p-4`}>
                  <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                  <div className={`text-3xl font-bold ${c.color}`}>{c.count}</div>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'list' && isManagerOrAdmin && reviewedCount > 0 && (
            <button
              onClick={async () => {
                if (!window.confirm(`確認済みの${reviewedCount}件を一括承認しますか？`)) return;
                const reviewedEntries = entries.filter(e => e.status === 'reviewed');
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) return;
                await supabase.from('journal_entries')
                  .update({ status: 'approved' })
                  .in('id', reviewedEntries.map(e => e.id));
                const approvals = reviewedEntries.map(e => ({
                  journal_entry_id: e.id,
                  approver_id: currentUser.id,
                  approval_status: 'approved' as const,
                  approval_level: 1,
                  approved_at: new Date().toISOString(),
                  comments: '一括承認',
                }));
                await supabase.from('journal_entry_approvals').insert(approvals);
                await loadAllData();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <CheckCircle size={16} /> 確認済み{reviewedCount}件を一括承認
            </button>
          )}

          {/* テーブル */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {viewMode === 'list' && (
              <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-900">仕訳一覧</h2>
                <button onClick={openDetailFromTop}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ background: '#dc4a3a' }}>
                  <Eye size={16} /> 個別チェックに切り替え
                </button>
              </div>
            )}

<div>
              {viewMode === 'detail' ? (
                /* 個別チェック時のコンパクト一覧 */
                <div className="flex">
                  <div className="flex-1 max-h-[90px] overflow-y-auto">
                    <table className="w-full">
                      <tbody className="divide-y divide-gray-100">
                        {filteredEntries.map((entry, idx) => {
                          const isSelected = items[currentIndex]?.entryId === entry.id;
                          const statusLabel = entry.is_excluded ? '外' : entry.status === 'approved' ? '承認' : entry.status === 'posted' ? '済' : entry.status === 'reviewed' ? '確認' : entry.status === 'amended' ? '修正' : '未';
                          return (
                            <tr key={entry.id} ref={isSelected ? selectedRowRef : undefined}
                              onClick={() => openDetail(entry.id)}
                              className={`cursor-pointer text-xs transition-colors ${isSelected ? 'bg-blue-100 font-semibold' : 'hover:bg-gray-50'}`}>
                              <td className="pl-3 pr-1 py-1 text-gray-400 w-6">{idx + 1}</td>
                              <td className="px-1 py-1 text-gray-700 truncate max-w-[120px]">{entry.description || '-'}</td>
                              <td className="px-1 py-1 text-gray-500 truncate max-w-[80px]">{entry.accountItemName || '-'}</td>
                              <td className="px-1 py-1 text-right tabular-nums">{fmt(entry.amount)}</td>
                              <td className="px-1 py-1 text-center">
                                <span className={`text-[9px] px-1 py-0.5 rounded ${
                                  entry.status === 'approved' ? 'bg-green-100 text-green-700' :
                                  entry.status === 'posted' ? 'bg-purple-100 text-purple-700' :
                                  entry.status === 'reviewed' ? 'bg-yellow-100 text-yellow-700' :
                                  entry.status === 'amended' ? 'bg-orange-100 text-orange-700' :
                                  entry.is_excluded ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                                }`}>{statusLabel}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={() => { saveCurrentItem(false); setViewMode('list'); loadAllData(); }}
                    className="w-7 flex-shrink-0 bg-gray-100 hover:bg-gray-200 border-l border-gray-200 flex items-center justify-center transition-colors"
                    title="一覧に戻る">
                    <span className="text-[10px] font-medium text-gray-500" style={{ writingMode: 'vertical-rl' }}>一覧へ</span>
                  </button>
                </div>
              ) : (
                /* 一覧モードのフルテーブル */
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase w-10">#</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">取引日</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">摘要</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">勘定科目</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">税区分</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">金額</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">状態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredEntries.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">データがありません</td></tr>
                    ) : (() => {
                      const renderedDocIds = new Set<string>();
                      const rows: React.ReactNode[] = [];
                      let rowNum = 0;

                      filteredEntries.forEach((entry) => {
                        const docId = entry.document_id || '';
                        const group = multiEntryGroups.find(g => g.documentId === docId);
                        const isMulti = group && group.entries.length > 1;

                        // multi_entry: 親行（折りたたみ）を先に表示
                        if (isMulti && !renderedDocIds.has(docId)) {
                          renderedDocIds.add(docId);
                          rowNum++;
                          const isExpanded = expandedDocs.has(docId);
                          rows.push(
                            <tr key={`group-${docId}`}
                              onClick={() => toggleMultiEntryGroup(docId)}
                              className="cursor-pointer bg-indigo-50/50 hover:bg-indigo-50 transition-colors border-l-4 border-indigo-400">
                              <td className="px-3 py-3 text-xs text-gray-400">{rowNum}</td>
                              <td className="px-4 py-3 text-sm" colSpan={2}>
                                <div className="flex items-center gap-2">
                                  <ChevronDown size={14} className={`text-indigo-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                                  <span className="font-medium text-indigo-700">{group.fileName}</span>
                                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-medium">{group.entries.length}件</span>
                                  {group.uncheckedCount > 0 && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">未確認{group.uncheckedCount}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">明細</td>
                              <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums">{fmt(group.totalAmount)}</td>
                              <td className="px-4 py-3 text-center">
                                {group.uncheckedCount > 0 && (
                                  <button onClick={(e) => { e.stopPropagation(); handleBulkReviewGroup(docId); }}
                                    className="px-2 py-1 bg-blue-500 text-white rounded text-[10px] hover:bg-blue-600 font-medium">
                                    全て確認済みに
                                  </button>
                                )}
                              </td>
                            </tr>
                          );

                          // multi_entry子行: 展開時のみ表示
                          if (isExpanded) {
                            group.entries.forEach((childEntry) => {
                              const needsReview = childEntry.requires_review || (childEntry.ai_confidence != null && childEntry.ai_confidence < 0.7);
                              rows.push(
                                <tr key={childEntry.id} onClick={() => openDetail(childEntry.id)}
                                  className={`cursor-pointer transition-colors hover:bg-gray-50 bg-white border-l-4 border-indigo-200 ${needsReview ? 'bg-yellow-50' : ''}`}>
                                  <td className="px-3 py-2 text-xs text-gray-300 pl-6">-</td>
                                  <td className="px-4 py-2 text-sm text-gray-600">{new Date(childEntry.entry_date).toLocaleDateString('ja-JP')}</td>
                                  <td className="px-4 py-2 text-sm max-w-[200px] truncate">
                                    {childEntry.description || '-'}
                                    {childEntry.notes && <StickyNote size={12} className="text-amber-400 inline ml-1" title={childEntry.notes} />}
                                  </td>
                                  <td className="px-4 py-2 text-sm">{childEntry.accountItemName || '-'}</td>
                                  <td className="px-4 py-2 text-sm">{childEntry.taxCategoryName || '-'}</td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums">{fmt(childEntry.amount)}</td>
                                  <td className="px-4 py-2 text-center">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                      childEntry.status === 'approved' ? 'bg-green-100 text-green-800' :
                                      childEntry.status === 'posted' ? 'bg-purple-100 text-purple-800' :
                                      childEntry.status === 'reviewed' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>{
                                      childEntry.status === 'approved' ? '承認済' :
                                      childEntry.status === 'posted' ? '確定' :
                                      childEntry.status === 'reviewed' ? '確認済み' : '未確認'
                                    }</span>
                                  </td>
                                </tr>
                              );
                            });
                          }
                          return;
                        }

                        // multi_entry子行は親行で処理済みならスキップ
                        if (isMulti && renderedDocIds.has(docId)) return;

                        // 通常行（1ドキュメント=1仕訳）
                        rowNum++;
                        const needsReview = entry.requires_review || (entry.ai_confidence != null && entry.ai_confidence < 0.7);
                        const isSelected = items[currentIndex]?.entryId === entry.id;
                        rows.push(
                          <tr key={entry.id} onClick={() => openDetail(entry.id)}
                            className={`cursor-pointer transition-colors hover:bg-gray-50 ${needsReview ? 'bg-yellow-50' : ''} ${isSelected ? 'bg-blue-50' : ''} ${entry.status === 'approved' ? 'bg-green-50/30' : ''}`}>
                            <td className="px-3 py-3 text-xs text-gray-400">{rowNum}</td>
                            <td className="px-4 py-3 text-sm">{new Date(entry.entry_date).toLocaleDateString('ja-JP')}</td>
                            <td className="px-4 py-3 text-sm max-w-[200px] truncate">
                              {entry.description || '-'}
                              {entry.notes && <StickyNote size={12} className="text-amber-400 inline ml-1" title={entry.notes} />}
                            </td>
                            <td className="px-4 py-3 text-sm">{entry.accountItemName || '-'}</td>
                            <td className="px-4 py-3 text-sm">{entry.taxCategoryName || '-'}</td>
                            <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums">{fmt(entry.amount)}</td>
                            <td className="px-4 py-3 text-center">
                              {entry.is_excluded ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><Ban size={10} />対象外</span>
                              ) : entry.status === 'posted' ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"><CheckCircle size={10} />確定</span>
                                  <button onClick={(e) => { e.stopPropagation(); handleRevert(entry.id, 'posted'); }}
                                    className="p-0.5 text-purple-500 hover:bg-purple-50 rounded" title="確定解除"><Undo2 size={12} /></button>
                                </div>
                              ) : entry.status === 'reviewed' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                  <Clock size={10} />確認済み
                                  {isManagerOrAdmin && (
                                    <button onClick={(e) => { e.stopPropagation(); handleApproveFromList(entry.id); }}
                                      className="ml-1 px-1.5 py-0.5 bg-green-500 text-white rounded text-[10px] hover:bg-green-600">
                                      承認
                                    </button>
                                  )}
                                </span>
                              ) : entry.status === 'approved' ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle size={10} />承認済</span>
                                  <button onClick={(e) => { e.stopPropagation(); handleRevert(entry.id, 'approved'); }}
                                    className="p-0.5 text-green-500 hover:bg-green-50 rounded" title="差し戻し"><Undo2 size={12} /></button>
                                </div>
                              ) : needsReview ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><AlertCircle size={10} />要確認</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">未確認</span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                      return rows;
                    })()}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ===== 個別チェック詳細 ===== */}
          {viewMode === 'detail' && items.length > 0 && (() => {
            const ci = items[currentIndex];
            // 改善6: multi_entry検出（同一ドキュメントに複数仕訳がある場合）
            const multiGroup = multiEntryGroups.find(g => g.documentId === ci.docId);
            const isMultiEntry = multiGroup && multiGroup.entries.length > 1;
            const siblingItems = isMultiEntry
              ? items.filter(it => it.docId === ci.docId)
              : [];
            return (
              <div className="grid grid-cols-2 gap-4" style={{ animation: 'fadeSlideUp .3s ease' }}>
                {/* 左: 証憑画像 */}
                <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden" style={{ minHeight: 480 }}>
                  <div className="p-3 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
                    <div>
                      <div className="font-semibold text-sm">証憑画像</div>
                      <div className="text-xs text-gray-400 truncate max-w-[200px]">{ci.fileName}</div>
                    </div>
                    <div className="flex items-center gap-0.5 border border-gray-200 rounded-md p-0.5">
                      <button onClick={() => setZoom(z => Math.max(25, z - 25))} className="p-1.5 hover:bg-gray-100 rounded text-gray-600"><ZoomOut size={14} /></button>
                      <button onClick={() => setZoom(100)} className="px-1.5 py-1 hover:bg-gray-100 rounded text-xs text-gray-500 font-mono" title="フィット">{zoom}%</button>
                      <button onClick={() => setZoom(z => Math.min(300, z + 25))} className="p-1.5 hover:bg-gray-100 rounded text-gray-600"><ZoomIn size={14} /></button>
                      <div className="w-px h-3.5 bg-gray-200 mx-0.5" />
                      <button onClick={() => setRotation(r => (r + 90) % 360)} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="90度回転"><RotateCcw size={14} /></button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center p-2" style={{ minHeight: 500 }}>
                    {ci.imageUrl ? (
                      ci.fileName?.toLowerCase().endsWith('.pdf') ? (
                        <iframe src={`${ci.imageUrl}#toolbar=0&view=FitH`}
                          className="border-0 rounded shadow-sm"
                          style={{
                            width: `${Math.max(zoom, 100)}%`,
                            height: 'calc(100vh - 260px)',
                            minHeight: 600,
                            transform: `rotate(${rotation}deg)`,
                            transition: 'transform .3s',
                            transformOrigin: 'center center',
                          }} title={ci.fileName} />
                      ) : (
                        <img src={ci.imageUrl} alt={ci.fileName}
                          style={{ width: `${zoom}%`, maxWidth: 'none', transform: `rotate(${rotation}deg)`, transition: 'transform .3s', transformOrigin: 'center center' }}
                          className="rounded shadow-sm border border-gray-200 object-contain" />
                      )
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2"><AlertCircle size={40} /><span className="text-sm">読み込めませんでした</span></div>
                    )}
                  </div>
                </div>

                {/* 右: 仕訳データ（HTMLモック準拠）*/}
                <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden" style={{ minHeight: 480 }}>
                  {/* 改善6: multi_entryの場合、グループ内仕訳切替タブ */}
                  {isMultiEntry && siblingItems.length > 1 && (
                    <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-indigo-600 font-medium">同一証憑の仕訳:</span>
                      {siblingItems.map((sib, idx) => {
                        const isCurrent = sib.entryId === ci.entryId;
                        return (
                          <button key={sib.entryId || idx} type="button"
                            onClick={() => { if (!isCurrent) { const i = items.indexOf(sib); setCurrentIndex(i); setForm({ ...sib }); setAiOriginalForm({ ...sib }); setSupplierText(sib.unmatchedSupplierName || ''); setItemText(sib.unmatchedItemName || ''); } }}
                            className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                              isCurrent ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                            }`}>
                            {idx + 1}. {sib.description?.slice(0, 15) || '明細'} {fmt(sib.lineAmount)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="p-3 border-b border-gray-100 flex items-center gap-2 flex-wrap flex-shrink-0">
                    <span className="font-bold text-sm">仕訳データ</span>
                    {ci.supplierName && <span className="text-xs px-2.5 py-0.5 rounded bg-blue-50 text-blue-600">OCR: {ci.supplierName}</span>}
                    {/* OCR拡張データバッジ */}
                    {ci.docClassification?.tategaki && (
                      <span className="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-700">但: {ci.docClassification.tategaki}</span>
                    )}
                    {ci.docClassification?.withholding_tax_amount != null && (
                      <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700">源泉: ¥{ci.docClassification.withholding_tax_amount.toLocaleString()}</span>
                    )}
                    {ci.docClassification?.invoice_qualification && (
                      <span className={`text-xs px-2 py-0.5 rounded ${ci.docClassification.invoice_qualification === 'qualified' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                        {ci.docClassification.invoice_qualification === 'qualified' ? '適格' : '非適格'}
                      </span>
                    )}
                    {ci.docClassification?.transaction_type && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                        {({purchase:'仕入',expense:'経費',asset:'資産',sales:'売上',fee:'報酬'} as Record<string,string>)[ci.docClassification.transaction_type] || ci.docClassification.transaction_type}
                      </span>
                    )}
                    {ci.aiConfidence != null && (
                      <span className={`text-xs px-2.5 py-0.5 rounded font-semibold ml-auto ${ci.aiConfidence >= 0.8 ? 'bg-green-50 text-green-700' : ci.aiConfidence >= 0.5 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
                        AI信頼度 {Math.round(ci.aiConfidence * 100)}%
                      </span>
                    )}
                  </div>
                  {/* 候補ルールバッジ（改善1） */}
                  {ci.ruleCandidates && ci.ruleCandidates.length > 0 && (
                    <div className="px-3 py-1.5 bg-purple-50 border-b border-purple-100 flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-purple-600 font-medium">他にマッチしたルール:</span>
                      {ci.ruleCandidates.map((rc) => (
                        <button key={rc.rule_id} type="button"
                          onClick={() => {
                            setForm(p => ({ ...p, accountItemId: rc.account_item_id }));
                            handleAccountItemChange(rc.account_item_id);
                          }}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors cursor-pointer"
                          title={`スコープ: ${rc.scope} / 優先度: ${rc.priority}`}>
                          {rc.rule_name}
                          <span className="ml-1 text-purple-400">({rc.scope === 'client' ? '顧客' : rc.scope === 'industry' ? '業種' : '共通'})</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex-1 p-4 flex flex-col gap-3.5 overflow-y-auto">
                    {/* OCR読取 */}
                    {(ci.supplierName || ci.amount || ci.documentDate) && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div className="text-xs font-medium text-gray-500 mb-1.5">OCR読取結果（参考）</div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          {ci.supplierName && <div><span className="text-gray-400">取引先:</span> <span className="font-medium">{ci.supplierName}</span></div>}
                          {ci.amount != null && <div><span className="text-gray-400">金額:</span> <span className="font-medium">{fmt(ci.amount)}</span></div>}
                          {ci.documentDate && <div><span className="text-gray-400">日付:</span> <span className="font-medium">{new Date(ci.documentDate).toLocaleDateString('ja-JP')}</span></div>}
                          {ci.taxAmount != null && <div><span className="text-gray-400">税額:</span> <span className="font-medium">{fmt(ci.taxAmount)}</span></div>}
                        </div>
                      </div>
                    )}

                    {/* 対象外バナー */}
                    {form.isExcluded && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2"><Ban size={16} />対象外に設定されています</div>
                    )}

                    {/* 取引先（赤ハイライト）*/}
                    <div className="bg-red-50 border-[1.5px] border-red-200 rounded-lg p-3">
                      <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />取引先</label>
                      <ComboBox value={form.supplierId || ''} onChange={handleSupplierChange}
                        options={suppliers.map(s => ({ id: s.id, name: s.name, code: s.code || undefined, short_name: s.name_kana }))}
                        placeholder="取引先を検索"
                        textValue={supplierText}
                        onNewText={(text) => { setSupplierText(text); setForm(p => ({ ...p, supplierId: null })); setAddRule(true); setRuleSuggestion(`未登録取引先「${text}」→ ルール追加推奨`); }}
                        allowCreate
                        onCreateNew={async (name) => {
                          const { data: cd } = await supabase.from('clients').select('organization_id').eq('id', currentWorkflow!.clientId).single();
                          if (!cd?.organization_id) return;
                          const { data: newSupplier } = await supabase.from('suppliers').insert({ organization_id: cd.organization_id, name, is_active: true }).select().single();
                          if (newSupplier) { setSuppliers(prev => [...prev, newSupplier]); handleSupplierChange(newSupplier.id); setSupplierText(''); }
                        }} />
                      {supplierText && !form.supplierId && (
                        <div className="mt-1.5 bg-orange-50 border border-orange-200 rounded-lg p-2">
                          <p className="text-[10px] text-orange-700 mb-1.5">
                            「{supplierText}」は取引先マスタに未登録です。
                          </p>
                          <button type="button" onClick={async () => {
                            const { data: cd } = await supabase.from('clients').select('organization_id').eq('id', currentWorkflow!.clientId).single();
                            if (!cd?.organization_id) return;
                            const { data: newSupplier } = await supabase.from('suppliers')
                              .insert({ organization_id: cd.organization_id, name: supplierText, is_active: true })
                              .select().single();
                            if (newSupplier) {
                              setSuppliers(prev => [...prev, newSupplier]);
                              handleSupplierChange(newSupplier.id);
                              setSupplierText('');
                            }
                          }}
                            className="w-full text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded py-1.5 transition-colors">
                            「{supplierText}」をマスタに追加して選択
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 取引日（青）/ 金額（緑）*/}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 border-[1.5px] border-blue-200 rounded-lg p-3">
                        <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />取引日</label>
                        <input type="date" value={form.entryDate || ''} onChange={e => setForm(p => ({ ...p, entryDate: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="bg-green-50 border-[1.5px] border-green-200 rounded-lg p-3">
                        <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5"><span className="w-2 h-2 rounded-full bg-green-500" />金額（円）</label>
                        <input type="number" value={form.lineAmount || ''} onChange={e => setForm(p => ({ ...p, lineAmount: Number(e.target.value) }))}
                          className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>

                    {/* 勘定科目 / 税区分 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold mb-1.5 flex items-center gap-1">勘定科目 <span className="text-[10px] text-gray-400 font-normal">ローマ字・番号可</span></label>
                        <SearchableSelect value={form.accountItemId || ''} onChange={handleAccountItemChange}
                          options={accountItems.map(a => ({ id: a.id, name: a.name, code: a.code, short_name: a.short_name, name_kana: a.name_kana }))}
                          placeholder="勘定科目を検索" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block">税区分</label>
                        <ComboBox value={form.taxCategoryId || ''}
                          onChange={tcId => {
                            const tc = taxCategories.find(t => t.id === tcId);
                            let newRate = form.taxRate;
                            if (tc?.current_tax_rate_id) {
                              const rate = taxRates.find(r => r.id === tc.current_tax_rate_id);
                              newRate = rate?.rate ?? null;
                            } else {
                              newRate = null;
                            }
                            setForm(p => ({ ...p, taxCategoryId: tcId, taxRate: newRate }));
                          }}
                          options={taxCategories.map(t => ({ id: t.id, name: t.display_name || t.name, code: undefined, short_name: t.code, name_kana: null }))}
                          placeholder="税区分を検索" />
                      </div>
                    </div>

                    {/* 税率（黄ハイライト）*/}
                    <div className="w-1/2 pr-1.5">
                      <div className="bg-yellow-50 border-[1.5px] border-yellow-200 rounded-lg p-3">
                        <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" />税率</label>
                        <select value={form.taxRate?.toString() || ''} onChange={e => setForm(p => ({ ...p, taxRate: e.target.value ? Number(e.target.value) : null }))}
                          className="border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ minWidth: 130 }}>
                          <option value="">--</option>
                          {taxRates.map(r => {
                            const pct = Math.round(r.rate * 100);
                            const label = r.is_current
                              ? (r.name.includes('軽減') ? `${pct}%（軽）` : `${pct}%`)
                              : `${pct}%（旧）`;
                            return <option key={r.id} value={r.rate}>{label}</option>;
                          })}
                        </select>
                      </div>
                    </div>

                    {/* 品目（採用/不採用トグル付き）*/}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold">品目</label>
                        {(form.itemId || itemText) && (
                          <button type="button" onClick={() => { setForm(p => ({ ...p, itemId: null })); setItemText(''); }}
                            className="text-[10px] text-red-500 hover:underline">品目をクリア</button>
                        )}
                      </div>
                      <ComboBox value={form.itemId || ''} onChange={handleItemChange}
                        options={itemsMaster.map(it => ({ id: it.id, name: it.name, code: it.code || undefined, short_name: null }))}
                        placeholder="品目を検索"
                        textValue={itemText}
                        onNewText={(text) => { setItemText(text); setForm(p => ({ ...p, itemId: null })); }}
                        allowCreate
                        onCreateNew={async (name) => {
                          const { data: newItem } = await supabase.from('items').insert({ name, code: null, is_active: true }).select().single();
                          if (newItem) { setItemsMaster(prev => [...prev, newItem]); setForm(p => ({ ...p, itemId: newItem.id })); setItemText(''); }
                        }} />
                      {itemText && !form.itemId && (
                        <div className="mt-1.5 bg-orange-50 border border-orange-200 rounded-lg p-2">
                          <p className="text-[10px] text-orange-700 mb-1.5">
                            「{itemText}」は品目マスタに未登録です。
                          </p>
                          <button type="button" onClick={async () => {
                            const { data: newItem } = await supabase.from('items')
                              .insert({ name: itemText, code: null, is_active: true })
                              .select('id, name, code, default_account_item_id, default_tax_category_id').single();
                            if (newItem) {
                              setItemsMaster(prev => [...prev, newItem]);
                              handleItemChange(newItem.id);
                              setItemText('');
                            }
                          }}
                            className="w-full text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded py-1.5 transition-colors">
                            「{itemText}」をマスタに追加して選択
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 摘要 */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block">摘要</label>
                      <input type="text" value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                        placeholder="摘要を入力" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>

                    {/* メモ */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block flex items-center gap-1">
                        <StickyNote size={12} className="text-amber-500" />メモ
                      </label>
                      <textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="内部メモ（任意）" rows={2}
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
                    </div>

                    {/* C1: 家事按分 */}
                    {!form.isExcluded && (
                      <div className={`border rounded-lg p-3 space-y-2 ${businessRatio === 100 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                        <div className="flex items-center justify-between">
                          <label className={`text-xs font-semibold ${businessRatio === 100 ? 'text-blue-800' : 'text-orange-800'}`}>
                            家事按分（事業用割合）
                            {ci.matchedRuleBusinessRatio != null ? (
                              <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">ルール按分</span>
                            ) : clientRatios.find(r => r.account_item_id === form.accountItemId) ? (
                              <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">顧客設定</span>
                            ) : businessRatio < 100 ? (
                              <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">手動設定</span>
                            ) : null}
                          </label>
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => setBusinessRatio(Math.max(0, businessRatio - 1))}
                              className="w-5 h-5 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-500 text-xs hover:bg-gray-50">−</button>
                            <input type="number" min={0} max={100} value={businessRatio}
                              onChange={e => setBusinessRatio(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                              className="w-12 text-center text-xs font-bold border border-gray-300 rounded p-0.5" />
                            <span className="text-xs text-gray-500">%</span>
                            <button type="button" onClick={() => setBusinessRatio(Math.min(100, businessRatio + 1))}
                              className="w-5 h-5 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-500 text-xs hover:bg-gray-50">+</button>
                          </div>
                        </div>
                        <input type="range" min={0} max={100} step={1} value={businessRatio}
                          onChange={e => setBusinessRatio(Number(e.target.value))}
                          className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${businessRatio === 100 ? 'bg-blue-200 accent-blue-500' : 'bg-orange-200 accent-orange-500'}`} />
                        {businessRatio < 100 && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-white rounded p-2 border border-orange-200">
                              <span className="text-orange-700 font-medium">事業用: </span>
                              <span className="font-bold">¥{Math.round((form.lineAmount || 0) * businessRatio / 100).toLocaleString()}</span>
                            </div>
                            <div className="bg-white rounded p-2 border border-orange-200">
                              <span className="text-gray-500 font-medium">私用: </span>
                              <span className="font-bold">¥{Math.round((form.lineAmount || 0) * (100 - businessRatio) / 100).toLocaleString()}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 事業用/プライベート + ルール追加 */}
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                          <button onClick={() => setBusiness(true)}
                            className={`px-4 py-1.5 text-xs font-medium transition-colors ${form.isBusiness && !form.isExcluded ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>事業用</button>
                          <button onClick={() => setBusiness(false)}
                            className={`px-4 py-1.5 text-xs font-medium transition-colors ${!form.isBusiness && !form.isExcluded ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>プライベート</button>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-gray-50 font-mono text-gray-500">P</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={addRule} onChange={e => { setAddRule(e.target.checked); if (!e.target.checked) setRuleSuggestion(''); }} className="w-4 h-4 text-blue-600 rounded" />
                          <span className="text-xs font-medium">ルール追加</span>
                        </label>
                        <span className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-gray-50 font-mono text-gray-500">R</span>
                        {addRule && (
                          <div className="flex items-center gap-1.5">
                            <select value={ruleScope} onChange={e => setRuleScope(e.target.value as any)}
                              className="border border-gray-300 rounded-md p-1.5 text-xs bg-white">
                              <option value="shared">共通</option>
                              <option value="industry">業種</option>
                              <option value="client">この顧客</option>
                            </select>
                            {ruleScope === 'industry' && (
                              <ComboBox value={ruleIndustryId} onChange={setRuleIndustryId}
                                options={industries.map(ind => ({ id: ind.id, name: ind.name }))}
                                placeholder="業種を選択" />
                            )}
                          </div>
                        )}
                      </div>
                      {/* R11: ルール追加プレビュー */}
                      {addRule && (
                        <div className="w-full bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-[10px] text-blue-800 space-y-0.5">
                          {ruleSuggestion && <div className="font-medium text-blue-600">{ruleSuggestion}</div>}
                          <div>パターン: {supplierText || form.description || items[currentIndex]?.supplierName || '取引先'}</div>
                          <div>→ 勘定科目: {accountItems.find(a => a.id === form.accountItemId)?.name || '未設定'}
                            {form.taxCategoryId && ` / 税区分: ${taxCategories.find(t => t.id === form.taxCategoryId)?.name || ''}`}
                            {businessRatio < 100 && ` / 按分: ${businessRatio}%`}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ナビゲーション */}
                    <div className="flex gap-3 pt-3 border-t border-gray-200">
                      <button onClick={goPrev} disabled={currentIndex === 0}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                        <ChevronLeft size={16} /> 前へ
                      </button>
                      {currentIndex >= items.length - 1 ? (
                        <button onClick={async () => { await saveCurrentItem(true); setViewMode('list'); loadAllData(); }}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white ${isManagerOrAdmin ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                          <CheckCircle size={16} /> {isManagerOrAdmin ? '確認・承認して完了' : '確認OK・完了'}
                        </button>
                      ) : (
                        <button onClick={goNext}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white ${isManagerOrAdmin ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                          {isManagerOrAdmin ? '承認して次へ' : '確認OK・次へ'} <ChevronRight size={16} />
                        </button>
                      )}
                    </div>

                    {/* 対象外 */}
                    <button onClick={toggleExclude}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
                        form.isExcluded ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-300 text-gray-500 bg-white hover:bg-gray-50'
                      }`}>
                      <Ban size={14} />{form.isExcluded ? '対象外を解除' : '対象外にする'}
                      <span className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-white font-mono text-gray-400 ml-1">E</span>
                    </button>

                    {/* 保存状態 */}
                    <div className="flex items-center justify-between">
                      {ci.entryId && <span className="text-[10px] text-gray-400">仕訳ID: {ci.entryId.slice(0, 8)}...</span>}
                      <div className="flex items-center gap-2 ml-auto">
                        {saving && <Loader size={12} className="animate-spin text-blue-500" />}
                        {savedAt && <span className="text-xs text-green-600">✓ {savedAt} 保存済み</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      </div>

      <style>{`
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}