/**
 * @module 顧客ルール設定モーダル
 */
import Modal from '@/web/shared/components/ui/Modal';
import type { ClientWithIndustry } from '@/types';
import type { ClientRulesData } from '../hooks/useClientData';

interface ClientRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: ClientWithIndustry | null;
  rules: ClientRulesData;
  accountItems: Array<{ id: string; name: string; code: string }>;
  ratios: Array<{ account_item_id: string; business_ratio: number }>;
}

export default function ClientRulesModal({ isOpen, onClose, client, rules, accountItems, ratios }: ClientRulesModalProps) {
  const getAcctName = (id?: string | null) => accountItems.find(a => a.id === id)?.name || '-';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${client?.name || ''} のルール設定`} size="xl">
      <div className="space-y-5 max-h-[70vh] overflow-y-auto">
        {/* 顧客情報サマリー */}
        <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-4">
          <div>
            <span className="text-sm font-bold text-gray-900">{client?.name}</span>
            <span className="text-xs text-gray-500 ml-2">業種: {client?.industry?.name || '未設定'}</span>
          </div>
          <div className="flex gap-2 ml-auto">
            <span className="text-[10px] px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">顧客別 {rules.clientSpecific.length}件</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-100 text-cyan-700 font-medium">業種別 {rules.industryRules.length}件</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">汎用 {rules.sharedRules.length}件</span>
          </div>
        </div>

        <p className="text-[10px] text-gray-400">適用優先順位: 顧客専用（最優先）→ 業種別 → 汎用（最低優先）</p>

        {/* 顧客専用ルール */}
        <div>
          <h3 className="text-sm font-semibold text-violet-700 mb-2 flex items-center gap-2">
            顧客専用ルール
            <button type="button" onClick={() => window.location.href = '/master/rules'} className="text-[10px] text-blue-600 hover:underline font-normal">+ 追加</button>
          </h3>
          {rules.clientSpecific.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">顧客専用ルールはありません</p>
          ) : (
            <div className="space-y-1.5">
              {rules.clientSpecific.map(rule => {
                const ratio = rule.actions?.business_ratio ? Math.round(Number(rule.actions.business_ratio) * 100) : null;
                return (
                  <div key={rule.id} className="flex items-center justify-between bg-violet-50 rounded-lg p-2.5 border border-violet-100">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{rule.rule_name}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {rule.conditions?.supplier_pattern && `取引先: ${rule.conditions.supplier_pattern}`}
                        {rule.conditions?.item_pattern && ` 品目: ${rule.conditions.item_pattern}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-700">→ {getAcctName(rule.actions?.account_item_id)}</span>
                      {ratio != null && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ratio === 100 ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>{ratio}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 家事按分率 */}
        {ratios.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-orange-700 mb-2">家事按分設定</h3>
            <div className="grid grid-cols-2 gap-2">
              {ratios.map(r => {
                const pct = Math.round(Number(r.business_ratio) * 100);
                return (
                  <div key={r.account_item_id} className={`rounded-lg p-2 border text-sm ${pct === 100 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                    <span className="font-medium text-gray-900">{getAcctName(r.account_item_id)}</span>
                    <span className={`ml-2 font-bold ${pct === 100 ? 'text-blue-700' : 'text-orange-700'}`}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 業種別ルール */}
        <details open>
          <summary className="text-sm font-semibold text-cyan-700 cursor-pointer hover:underline">業種別ルール（{rules.industryRules.length}件）</summary>
          <div className="mt-2 space-y-1">
            {rules.industryRules.map(rule => (
              <div key={rule.id} className="flex items-center justify-between bg-cyan-50/50 rounded p-2 text-xs">
                <span className="text-gray-700">{rule.rule_name}</span>
                <span className="text-gray-500">→ {getAcctName(rule.actions?.account_item_id)}</span>
              </div>
            ))}
          </div>
        </details>

        {/* 汎用ルール */}
        <details>
          <summary className="text-sm font-semibold text-green-700 cursor-pointer hover:underline">汎用ルール（{rules.sharedRules.length}件）</summary>
          <div className="mt-2 space-y-1">
            {rules.sharedRules.map(rule => (
              <div key={rule.id} className="flex items-center justify-between bg-green-50/50 rounded p-2 text-xs">
                <span className="text-gray-700">{rule.rule_name}</span>
                <span className="text-gray-500">→ {getAcctName(rule.actions?.account_item_id)}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </Modal>
  );
}
