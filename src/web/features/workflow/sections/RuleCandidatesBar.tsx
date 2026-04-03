import { useReview } from '../context/ReviewContext';

export default function RuleCandidatesBar() {
  const { ci, setForm, handleAccountItemChange } = useReview();
  if (!ci?.ruleCandidates?.length) return null;
  return (
    <div className="px-3 py-1.5 bg-purple-50 border-b border-purple-100 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] text-purple-600 font-medium">他にマッチしたルール:</span>
      {ci.ruleCandidates.map((rc) => (
        <button key={rc.rule_id} type="button"
          onClick={() => { setForm(p => ({ ...p, accountItemId: rc.account_item_id })); handleAccountItemChange(rc.account_item_id); }}
          className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors cursor-pointer"
          title={`スコープ: ${rc.scope} / 優先度: ${rc.priority}`}>
          {rc.rule_name}
          <span className="ml-1 text-purple-400">({rc.scope === 'client' ? '顧客別' : rc.scope === 'industry' ? '業種別' : '汎用'})</span>
        </button>
      ))}
    </div>
  );
}
