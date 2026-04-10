/**
 * @module 一括顧客登録フォーム
 */
import { Plus, Trash2 } from 'lucide-react';
import type { Industry } from '@/types';

export interface BulkRow {
  name: string;
  industry_id: string;
  annual_sales: string;
  tax_category: '原則課税' | '簡易課税' | '免税';
}

interface BulkImportFormProps {
  rows: BulkRow[];
  setRows: (rows: BulkRow[]) => void;
  industries: Industry[];
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export default function BulkImportForm({ rows, setRows, industries, onSubmit, onCancel }: BulkImportFormProps) {
  const updateRow = (i: number, patch: Partial<BulkRow>) => {
    const updated = [...rows];
    updated[i] = { ...updated[i], ...patch };
    setRows(updated);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="px-2 py-1.5">
                  <input type="text" value={row.name} onChange={e => updateRow(i, { name: e.target.value })} className="input text-sm" placeholder="山田太郎" />
                </td>
                <td className="px-2 py-1.5">
                  <select value={row.industry_id} onChange={e => updateRow(i, { industry_id: e.target.value })} className="input text-sm">
                    <option value="">-</option>
                    {industries.map(ind => <option key={ind.id} value={ind.id}>{ind.name}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" value={row.annual_sales} onChange={e => updateRow(i, { annual_sales: e.target.value })} className="input text-sm" placeholder="5000000" min="0" />
                </td>
                <td className="px-2 py-1.5">
                  <select value={row.tax_category} onChange={e => updateRow(i, { tax_category: e.target.value as BulkRow['tax_category'] })} className="input text-sm">
                    <option value="原則課税">原則課税</option>
                    <option value="簡易課税">簡易課税</option>
                    <option value="免税">免税</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-600" disabled={rows.length === 1}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setRows([...rows, { name: '', industry_id: '', annual_sales: '', tax_category: '原則課税' }])} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
        <Plus size={16} />行を追加
      </button>
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button type="button" onClick={onCancel} className="btn-secondary">キャンセル</button>
        <button type="submit" className="btn-primary">一括登録する（{rows.filter(r => r.name.trim()).length}件）</button>
      </div>
    </form>
  );
}
