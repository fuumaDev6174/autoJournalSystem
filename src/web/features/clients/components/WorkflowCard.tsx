/**
 * @module アクティブワークフローカード
 */
import { RotateCcw, X } from 'lucide-react';
import type { ActiveWorkflow } from '../hooks/useClientData';

const STEP_NAMES = ['', 'アップロード', 'OCR', 'AIチェック', '仕訳確認', '仕訳出力', '集計', '対象外'];

function getStepLabel(step: number): string {
  return STEP_NAMES[step] || '';
}

interface WorkflowCardProps {
  workflows: ActiveWorkflow[];
  onResume: (workflowId: string) => void;
  onCancel: (workflow: ActiveWorkflow) => void;
}

export default function WorkflowCard({ workflows, onResume, onCancel }: WorkflowCardProps) {
  if (workflows.length === 0) return null;

  return (
    <div className="card bg-blue-50 border-blue-200">
      <h2 className="text-lg font-semibold text-blue-900 mb-4">
        進行中のワークフロー ({workflows.length}件)
      </h2>
      <div className="space-y-3">
        {workflows.map(wf => (
          <div key={wf.id} className="flex items-center justify-between p-4 bg-white rounded-lg border border-blue-200">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-1">{wf.clientName}</h3>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>
                  現在: <span className="font-medium text-gray-700">{getStepLabel(wf.current_step)}</span>（{wf.current_step}/4）
                </span>
                <span>最終更新: {new Date(wf.updated_at).toLocaleString('ja-JP')}</span>
              </div>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(wf.current_step / 4) * 100}%` }} />
              </div>
            </div>
            <div className="ml-4 flex items-center gap-2">
              <button type="button" onClick={() => onCancel(wf)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                title="ワークフローを中断">
                <X size={15} /><span>中断</span>
              </button>
              <button type="button" onClick={() => onResume(wf.id)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                <RotateCcw size={15} />続きから
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
