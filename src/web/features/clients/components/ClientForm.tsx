/**
 * @module 顧客登録/編集フォーム
 */
import type { Industry, ClientWithIndustry } from '@/types';

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} role="switch" aria-checked={checked}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function formatSalesLabel(value: string): string {
  const n = Number(value);
  if (!value || isNaN(n) || n === 0) return '';
  if (n >= 100_000_000) return `約 ${(n / 100_000_000).toFixed(1).replace(/\.0$/, '')}億円`;
  if (n >= 10_000) return `約 ${Math.round(n / 10_000)}万円`;
  return `約 ${n.toLocaleString()}円`;
}

export interface ClientFormData {
  name: string;
  industry_id: string;
  annual_sales: string;
  is_taxable: boolean;
  tax_category: '原則課税' | '簡易課税' | '免税';
  invoice_registered: boolean;
  invoice_number: string;
  use_custom_rules: boolean;
}

interface ClientFormProps {
  formData: ClientFormData;
  setFormData: (data: ClientFormData) => void;
  industries: Industry[];
  editingClient: ClientWithIndustry | null;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export default function ClientForm({ formData, setFormData, industries, editingClient, onSubmit, onCancel }: ClientFormProps) {
  const update = (patch: Partial<ClientFormData>) => setFormData({ ...formData, ...patch });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">顧客名 <span className="text-red-500">*</span></label>
        <input type="text" required value={formData.name} onChange={e => update({ name: e.target.value })} className="input" placeholder="山田太郎" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">業種</label>
        <select value={formData.industry_id} onChange={e => update({ industry_id: e.target.value })} className="input">
          <option value="">選択してください（任意）</option>
          {industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">年商（円）</label>
        <div className="flex items-center gap-3">
          <input type="number" value={formData.annual_sales} onChange={e => update({ annual_sales: e.target.value })} className="input flex-1" placeholder="5000000" min="0" />
          {formData.annual_sales && (
            <span className="text-sm text-blue-600 font-medium whitespace-nowrap">{formatSalesLabel(formData.annual_sales)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div>
          <span className="text-sm font-medium text-gray-700">課税事業者</span>
          <p className="text-xs text-gray-500 mt-0.5">OFFにすると免税事業者として扱われます</p>
        </div>
        <Switch checked={formData.is_taxable} onChange={v => update({ is_taxable: v })} />
      </div>
      {formData.is_taxable && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">課税方式 <span className="text-red-500">*</span></label>
          <select value={formData.tax_category} onChange={e => update({ tax_category: e.target.value as '原則課税' | '簡易課税' })} className="input">
            <option value="原則課税">原則課税</option>
            <option value="簡易課税">簡易課税</option>
          </select>
        </div>
      )}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <span className="text-sm font-medium text-gray-700">インボイス登録済み</span>
        <Switch checked={formData.invoice_registered} onChange={v => update({ invoice_registered: v })} />
      </div>
      {formData.invoice_registered && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">インボイス番号</label>
          <input type="text" value={formData.invoice_number} onChange={e => update({ invoice_number: e.target.value })} className="input" placeholder="T1234567890123" />
        </div>
      )}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div>
          <span className="text-sm font-medium text-gray-700">ルール自動追加</span>
          <p className="text-xs text-gray-500 mt-0.5">AIが学習した仕訳ルールを自動で追加します</p>
        </div>
        <Switch checked={formData.use_custom_rules} onChange={v => update({ use_custom_rules: v })} />
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button type="button" onClick={onCancel} className="btn-secondary">キャンセル</button>
        <button type="submit" className="btn-primary">{editingClient ? '更新する' : '登録する'}</button>
      </div>
    </form>
  );
}
