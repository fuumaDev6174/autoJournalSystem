import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, ChevronRight } from 'lucide-react';
import { industriesApi, clientsApi, clientIndustriesApi, rulesApi } from '@/web/shared/lib/api/backend.api';

export default function ClientListPage() {
  const { industryId } = useParams<{ industryId: string }>();
  const navigate = useNavigate();

  const [industry, setIndustry] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (industryId) loadData(); }, [industryId]);

  const loadData = async () => {
    setLoading(true);

    // 業種情報
    const { data: allIndustries } = await industriesApi.getAll({ is_active: 'true' });
    const ind = allIndustries?.find((i: any) => i.id === industryId) || null;
    if (ind) setIndustry(ind);

    // この業種の顧客（clients.industry_id + client_industries の両方）
    const [directRes, indirectRes] = await Promise.all([
      clientsApi.getAll(),
      clientIndustriesApi.getAll({ industry_id: industryId }),
    ]);

    const directClients = (directRes.data || []).filter((c: any) => c.industry_id === industryId);
    const indirectClientIds = (indirectRes.data || []).map((ci: any) => ci.client_id);

    // 統合・重複除去
    const clientMap = new Map<string, any>();
    for (const c of directClients) clientMap.set(c.id, c);
    // indirect clients: find full client objects from the allClients list
    for (const cid of indirectClientIds) {
      if (!clientMap.has(cid)) {
        const c = (directRes.data || []).find((cl: any) => cl.id === cid);
        if (c) clientMap.set(c.id, c);
      }
    }

    const allClients = [...clientMap.values()];

    // 各顧客のルール件数を取得
    const enriched = await Promise.all(allClients.map(async (c) => {
      const { data: clientRulesData } = await rulesApi.getAll({ scope: 'client', client_id: c.id, is_active: 'true' });
      return { ...c, clientRuleCount: clientRulesData?.length || 0 };
    }));

    enriched.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setClients(enriched);
    setLoading(false);
  };

  const filtered = clients.filter(c => {
    if (!search.trim()) return true;
    return c.name?.includes(search);
  });

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* パンくず */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="cursor-pointer text-blue-600 font-medium" onClick={() => navigate('/master/rules?tab=industry')}>仕訳ルール管理</span>
        <ChevronRight size={12} className="text-gray-300" />
        <span className="cursor-pointer text-blue-600 font-medium" onClick={() => navigate(`/master/rules/industry/${industryId}`)}>{industry?.name || '...'}</span>
        <ChevronRight size={12} className="text-gray-300" />
        <span className="font-semibold text-gray-900">顧客一覧</span>
      </div>

      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">{industry?.name} — 顧客一覧</h1>
          <p className="text-xs text-gray-500 mt-0.5">{filtered.length}名の顧客が所属しています</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="顧客名で検索..."
            className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md w-52 outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">顧客名</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">課税区分</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">インボイス</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">年間売上</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">個別ルール</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id}
                onClick={() => navigate(`/master/rules/industry/${industryId}/client/${c.id}`)}
                className="border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 font-semibold text-gray-900">{c.name}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    c.tax_category === '原則課税' ? 'bg-blue-100 text-blue-700'
                    : c.tax_category === '簡易課税' ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-600'
                  }`}>
                    {c.tax_category || '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {c.invoice_registered
                    ? <span className="text-green-600 font-semibold text-xs">✓ 登録済</span>
                    : <span className="text-gray-400 text-xs">未登録</span>
                  }
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {c.annual_sales ? `¥${c.annual_sales.toLocaleString()}` : '—'}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {c.clientRuleCount > 0
                    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{c.clientRuleCount}件</span>
                    : <span className="text-[10px] text-gray-300">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            {search ? '検索結果なし' : 'この業種に所属する顧客がいません'}
          </div>
        )}
      </div>
    </div>
  );
}