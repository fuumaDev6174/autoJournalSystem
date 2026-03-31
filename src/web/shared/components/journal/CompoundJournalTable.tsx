import { useState, useCallback } from 'react';
import { Plus, Trash2, AlertCircle, ArrowRight } from 'lucide-react';
import type { JournalEntryLine, AccountItem, TaxCategory } from '@/types';

// ============================================================
// 型定義
// ============================================================

/** フォーム上で扱う行データ（id は新規行では仮IDを使用） */
export interface JournalEntryLineInput {
  id: string;                          // 既存行は実ID、新規行は crypto.randomUUID()
  debit_credit: 'debit' | 'credit';
  account_item_id: string;
  tax_category_id: string | null;
  tax_rate: number | null;             // 0.10 など小数
  amount: number;
  tax_amount: number | null;           // null = 自動計算
  description: string | null;
  isNew?: boolean;                     // 新規追加行フラグ
}

interface CompoundJournalTableProps {
  /** 初期値（編集時は既存行、新規時は空配列） */
  lines: JournalEntryLineInput[];
  /** 行が変更されるたびに呼び出されるコールバック */
  onChange: (lines: JournalEntryLineInput[]) => void;
  /** 勘定科目の選択肢（外から渡す） */
  accountItems: AccountItem[];
  /** 税区分の選択肢（外から渡す） */
  taxCategories: TaxCategory[];
  /** 読み取り専用モード（確認画面等） */
  readOnly?: boolean;
}

// ============================================================
// 定数
// ============================================================

const TAX_RATES = [
  { label: '10%',        value: 0.10 },
  { label: '8%（軽減）', value: 0.08 },
  { label: '非課税',     value: 0    },
];

const EMPTY_LINE = (): JournalEntryLineInput => ({
  id: crypto.randomUUID(),
  debit_credit: 'debit',
  account_item_id: '',
  tax_category_id: null,
  tax_rate: 0.10,
  amount: 0,
  tax_amount: null,
  description: null,
  isNew: true,
});

// ============================================================
// ヘルパー
// ============================================================

function formatAmount(v: number): string {
  if (!v) return '';
  return v.toLocaleString('ja-JP');
}

function parseAmount(s: string): number {
  const n = Number(s.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/** 税込金額から消費税額を逆算 */
function calcTaxAmount(amount: number, rate: number | null): number {
  if (!rate || !amount) return 0;
  return Math.round(amount - amount / (1 + rate));
}

// ============================================================
// 貸借バランス計算
// ============================================================

interface Balance {
  debit: number;
  credit: number;
  diff: number;
  isBalanced: boolean;
}

function calcBalance(lines: JournalEntryLineInput[]): Balance {
  const debit  = lines.filter(l => l.debit_credit === 'debit') .reduce((s, l) => s + (l.amount || 0), 0);
  const credit = lines.filter(l => l.debit_credit === 'credit').reduce((s, l) => s + (l.amount || 0), 0);
  return { debit, credit, diff: debit - credit, isBalanced: debit === credit && debit > 0 };
}

// ============================================================
// サブコンポーネント: 1行
// ============================================================

interface LineRowProps {
  line: JournalEntryLineInput;
  index: number;
  totalLines: number;
  accountItems: AccountItem[];
  taxCategories: TaxCategory[];
  readOnly: boolean;
  onUpdate: (id: string, patch: Partial<JournalEntryLineInput>) => void;
  onRemove: (id: string) => void;
}

function LineRow({
  line, index, totalLines, accountItems, taxCategories,
  readOnly, onUpdate, onRemove,
}: LineRowProps) {
  const [amountDisplay, setAmountDisplay] = useState(
    line.amount ? formatAmount(line.amount) : ''
  );

  const handleAmountBlur = () => {
    const n = parseAmount(amountDisplay);
    setAmountDisplay(n ? formatAmount(n) : '');
    const taxAmt = line.tax_amount === null
      ? calcTaxAmount(n, line.tax_rate)
      : line.tax_amount;
    onUpdate(line.id, { amount: n, tax_amount: taxAmt });
  };

  const handleTaxRateChange = (rate: number) => {
    const taxAmt = calcTaxAmount(line.amount, rate);
    onUpdate(line.id, { tax_rate: rate, tax_amount: taxAmt });
  };

  const isDebit  = line.debit_credit === 'debit';
  const rowBg    = isDebit ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'bg-rose-50/40 hover:bg-rose-50/70';
  const badgeCls = isDebit
    ? 'bg-blue-100 text-blue-700 border-blue-200'
    : 'bg-rose-100 text-rose-700 border-rose-200';

  return (
    <tr className={`border-b border-gray-100 transition-colors ${rowBg}`}>
      {/* 行番号 */}
      <td className="px-3 py-2 text-xs text-gray-400 text-center w-8 select-none">
        {index + 1}
      </td>

      {/* 借方 / 貸方 */}
      <td className="px-2 py-2 w-24">
        {readOnly ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${badgeCls}`}>
            {isDebit ? '借方' : '貸方'}
          </span>
        ) : (
          <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => onUpdate(line.id, { debit_credit: 'debit' })}
              className={`flex-1 py-1.5 font-medium transition-colors ${
                isDebit ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              借方
            </button>
            <button
              type="button"
              onClick={() => onUpdate(line.id, { debit_credit: 'credit' })}
              className={`flex-1 py-1.5 font-medium transition-colors ${
                !isDebit ? 'bg-rose-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              貸方
            </button>
          </div>
        )}
      </td>

      {/* 勘定科目 */}
      <td className="px-2 py-2 min-w-[140px]">
        {readOnly ? (
          <span className="text-sm">
            {accountItems.find(a => a.id === line.account_item_id)?.name ?? '—'}
          </span>
        ) : (
          <select
            value={line.account_item_id}
            onChange={e => onUpdate(line.id, { account_item_id: e.target.value })}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">科目を選択</option>
            {accountItems.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
      </td>

      {/* 税区分 */}
      <td className="px-2 py-2 min-w-[120px]">
        {readOnly ? (
          <span className="text-sm">
            {taxCategories.find(t => t.id === line.tax_category_id)?.display_name
              ?? taxCategories.find(t => t.id === line.tax_category_id)?.name
              ?? '—'}
          </span>
        ) : (
          <select
            value={line.tax_category_id ?? ''}
            onChange={e => onUpdate(line.id, { tax_category_id: e.target.value || null })}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">— なし —</option>
            {taxCategories.map(t => (
              <option key={t.id} value={t.id}>{t.display_name ?? t.name}</option>
            ))}
          </select>
        )}
      </td>

      {/* 税率 */}
      <td className="px-2 py-2 w-28">
        {readOnly ? (
          <span className="text-sm">
            {line.tax_rate ? `${Math.round(line.tax_rate * 100)}%` : '—'}
          </span>
        ) : (
          <select
            value={String(line.tax_rate ?? '')}
            onChange={e => handleTaxRateChange(Number(e.target.value))}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {TAX_RATES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        )}
      </td>

      {/* 金額 */}
      <td className="px-2 py-2 w-32">
        {readOnly ? (
          <span className="text-sm font-mono text-right block">
            {formatAmount(line.amount)} 円
          </span>
        ) : (
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={amountDisplay}
              onChange={e => setAmountDisplay(e.target.value)}
              onBlur={handleAmountBlur}
              placeholder="0"
              className="w-full border border-gray-200 rounded px-2 py-1.5 pr-8 text-sm text-right font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <span className="absolute right-2 top-1.5 text-xs text-gray-400 pointer-events-none">円</span>
          </div>
        )}
      </td>

      {/* 消費税額（自動計算・表示のみ） */}
      <td className="px-2 py-2 w-28 text-right">
        <span className="text-sm font-mono text-gray-500">
          {line.tax_rate
            ? `${formatAmount(line.tax_amount ?? calcTaxAmount(line.amount, line.tax_rate))} 円`
            : '—'}
        </span>
      </td>

      {/* 摘要 */}
      <td className="px-2 py-2 min-w-[120px]">
        {readOnly ? (
          <span className="text-sm text-gray-600">{line.description ?? '—'}</span>
        ) : (
          <input
            type="text"
            value={line.description ?? ''}
            onChange={e => onUpdate(line.id, { description: e.target.value || null })}
            placeholder="摘要（任意）"
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        )}
      </td>

      {/* 削除ボタン */}
      {!readOnly && (
        <td className="px-2 py-2 w-10 text-center">
          <button
            type="button"
            onClick={() => onRemove(line.id)}
            disabled={totalLines <= 2}
            title={totalLines <= 2 ? '最低2行必要です' : '行を削除'}
            className="p-1 rounded text-gray-400 hover:text-rose-500 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </td>
      )}
    </tr>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================

export default function CompoundJournalTable({
  lines,
  onChange,
  accountItems,
  taxCategories,
  readOnly = false,
}: CompoundJournalTableProps) {

  const handleUpdate = useCallback((id: string, patch: Partial<JournalEntryLineInput>) => {
    onChange(lines.map(l => l.id === id ? { ...l, ...patch } : l));
  }, [lines, onChange]);

  const handleAdd = useCallback((side: 'debit' | 'credit') => {
    onChange([...lines, { ...EMPTY_LINE(), debit_credit: side }]);
  }, [lines, onChange]);

  const handleRemove = useCallback((id: string) => {
    if (lines.length <= 2) return;
    onChange(lines.filter(l => l.id !== id));
  }, [lines, onChange]);

  const balance = calcBalance(lines);

  return (
    <div className="flex flex-col gap-3">

      {/* テーブル本体 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-center w-8">#</th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-500 text-left w-24">借/貸</th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-500 text-left min-w-[140px]">勘定科目</th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-500 text-left min-w-[120px]">税区分</th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-500 text-left w-28">税率</th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-500 text-right w-32">金額</th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-500 text-right w-28">消費税額</th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-500 text-left min-w-[120px]">摘要</th>
              {!readOnly && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <LineRow
                key={line.id}
                line={line}
                index={i}
                totalLines={lines.length}
                accountItems={accountItems}
                taxCategories={taxCategories}
                readOnly={readOnly}
                onUpdate={handleUpdate}
                onRemove={handleRemove}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 行追加ボタン */}
      {!readOnly && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleAdd('debit')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <Plus size={12} /> 借方行を追加
          </button>
          <button
            type="button"
            onClick={() => handleAdd('credit')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors"
          >
            <Plus size={12} /> 貸方行を追加
          </button>
        </div>
      )}

      {/* 貸借バランスインジケーター */}
      <div className={`flex items-center justify-between rounded-lg px-4 py-3 border text-sm ${
        balance.isBalanced
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-0.5">借方合計</p>
          <p className="font-mono font-bold text-blue-700">
            {formatAmount(balance.debit)} 円
          </p>
        </div>

        <div className="flex flex-col items-center gap-1">
          <ArrowRight size={14} className="text-gray-400" />
          {balance.isBalanced ? (
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
              ✓ 貸借一致
            </span>
          ) : (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertCircle size={11} />
              差額 {formatAmount(Math.abs(balance.diff))} 円
            </span>
          )}
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500 mb-0.5">貸方合計</p>
          <p className="font-mono font-bold text-rose-600">
            {formatAmount(balance.credit)} 円
          </p>
        </div>
      </div>

      {/* バランス不一致の警告文 */}
      {!balance.isBalanced && balance.debit > 0 && (
        <p className="text-xs text-amber-700 flex items-center gap-1">
          <AlertCircle size={12} />
          借方と貸方の合計が一致していません。保存前にご確認ください。
        </p>
      )}
    </div>
  );
}

// ============================================================
// エクスポートユーティリティ
// ============================================================

/** 既存 JournalEntryLine[] → フォーム入力用に変換 */
export function linesToInput(lines: JournalEntryLine[]): JournalEntryLineInput[] {
  return lines
    .sort((a, b) => a.line_number - b.line_number)
    .map(l => ({
      id: l.id,
      debit_credit: l.debit_credit,
      account_item_id: l.account_item_id,
      tax_category_id: l.tax_category_id,
      tax_rate: l.tax_rate,
      amount: l.amount,
      tax_amount: l.tax_amount,
      description: l.description,
    }));
}

/** フォーム入力用 → DB保存用（line_number を付与） */
export function inputToLines(
  inputs: JournalEntryLineInput[],
  journalEntryId: string,
): Omit<JournalEntryLine, 'id'>[] {
  return inputs.map((l, i) => ({
    journal_entry_id: journalEntryId,
    line_number: i + 1,
    debit_credit: l.debit_credit,
    account_item_id: l.account_item_id,
    supplier_id: null,
    item_id: null,
    amount: l.amount,
    tax_category_id: l.tax_category_id,
    tax_rate: l.tax_rate,
    tax_amount: l.tax_amount ?? calcTaxAmount(l.amount, l.tax_rate),
    description: l.description,
  }));
}

/** 新規仕訳の初期行（借方1行 + 貸方1行） */
export function createDefaultLines(): JournalEntryLineInput[] {
  return [
    { ...EMPTY_LINE(), debit_credit: 'debit'  },
    { ...EMPTY_LINE(), debit_credit: 'credit' },
  ];
}