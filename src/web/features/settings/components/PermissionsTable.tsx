/**
 * @module 権限説明テーブル
 */

const SIMPLE_ROLES = [
  { role: '管理者', color: 'text-red-700', desc: 'すべての機能にアクセス可能。ユーザー管理・組織設定の権限を持つ唯一のロール。' },
  { role: 'マネージャー', color: 'text-blue-700', desc: 'ルール承認・仕訳承認・エクスポート。顧客管理+全マスタ編集。' },
  { role: '担当者', color: 'text-cyan-700', desc: '仕訳の確認・修正、ルール提案。承認・エクスポートは不可。' },
  { role: '閲覧者', color: 'text-gray-600', desc: '証憑アップロードと閲覧のみ。編集・承認は一切不可。' },
];

const DETAIL_ROWS = [
  { fn: 'ユーザーの追加・削除', a: '○', m: '—', s: '—', st: '—' },
  { fn: '顧客の追加・編集', a: '○', m: '○', s: '—', st: '—' },
  { fn: '顧客の削除', a: '○', m: '—', s: '—', st: '—' },
  { fn: '証憑アップロード', a: '○', m: '○', s: '○', st: '○' },
  { fn: 'OCR処理の実行', a: '○', m: '○', s: '○', st: '○' },
  { fn: '仕訳確認（draft→approved）', a: '○', m: '○', s: '○', st: '○' },
  { fn: '仕訳確定（approved→posted）', a: '○', m: '○', s: '○', st: '○' },
  { fn: '仕訳差し戻し', a: '○', m: '○', s: '○', st: '○' },
  { fn: '仕訳出力（CSV/freee）', a: '○', m: '○', s: '○', st: '○' },
  { fn: 'ワークフロー完了', a: '○', m: '○', s: '○', st: '○' },
  { fn: '集計・レポート', a: '○', m: '○', s: '○', st: '○' },
  { fn: '--- マスタ管理 ---', a: '', m: '', s: '', st: '' },
  { fn: '勘定科目マスタ', a: '○', m: '○', s: '—', st: '—' },
  { fn: '税区分マスタ', a: '○', m: '○', s: '—', st: '—' },
  { fn: '業種マスタ', a: '○', m: '○', s: '○', st: '—' },
  { fn: '仕訳ルール管理', a: '○', m: '○', s: '○', st: '—' },
  { fn: '取引先マスタ', a: '○', m: '○', s: '○', st: '—' },
  { fn: '品目マスタ', a: '○', m: '○', s: '○', st: '—' },
  { fn: 'タグ管理', a: '○', m: '○', s: '○', st: '—' },
  { fn: '--- 申請制（将来実装）---', a: '', m: '', s: '', st: '' },
  { fn: 'ルール追加（仕訳確認画面から）', a: '○', m: '○', s: '申請', st: '申請' },
  { fn: '家事按分の変更', a: '○', m: '○', s: '申請', st: '申請' },
];

interface PermissionsTableProps {
  showDetail: boolean;
  onToggle: () => void;
}

export default function PermissionsTable({ showDetail, onToggle }: PermissionsTableProps) {
  return (
    <div className="card bg-blue-50 border-blue-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-blue-900">権限の説明</h3>
        <button type="button" onClick={onToggle} className="text-xs text-blue-600 hover:underline">
          {showDetail ? '簡易表示に戻す' : '詳しく見る'}
        </button>
      </div>

      {!showDetail ? (
        <div className="space-y-2 text-sm">
          {SIMPLE_ROLES.map(item => (
            <div key={item.role} className="flex items-start gap-2">
              <span className={`font-semibold whitespace-nowrap ${item.color}`}>{item.role}</span>
              <span className="text-gray-600">{item.desc}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-blue-200">
                <th className="text-left py-2 pr-3 font-semibold text-blue-800">機能</th>
                <th className="text-center py-2 px-2 font-semibold text-red-700">管理者</th>
                <th className="text-center py-2 px-2 font-semibold text-blue-700">税理士(M)</th>
                <th className="text-center py-2 px-2 font-semibold text-cyan-700">税理士(S)</th>
                <th className="text-center py-2 px-2 font-semibold text-gray-600">担当者</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-100">
              {DETAIL_ROWS.map(row => (
                <tr key={row.fn} className={row.fn.startsWith('---') ? 'bg-blue-100/50' : ''}>
                  <td className={`py-1.5 pr-3 ${row.fn.startsWith('---') ? 'font-semibold text-blue-700 text-[10px]' : 'text-gray-700'}`}>{row.fn.replace(/---/g, '').trim()}</td>
                  {[row.a, row.m, row.s, row.st].map((v, i) => (
                    <td key={i} className={`py-1.5 px-2 text-center ${v === '○' ? 'text-green-600 font-medium' : v === '申請' ? 'text-yellow-600' : 'text-gray-300'}`}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
