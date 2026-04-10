import { useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Save, CheckCircle } from 'lucide-react';
import { useWorkflow } from '@/web/app/providers/WorkflowProvider';
import { getStepName } from '@/web/features/workflow/lib/workflowStorage';

export interface WorkflowHeaderProps {
  onBeforeNext?: () => Promise<boolean> | boolean;
  nextLabel?: string;
  showComplete?: boolean;
}

const TOTAL_STEPS = 4;
const STEPS = [1, 2, 3, 4] as const;
const STEP_SHORT: Record<number, string> = { 1: 'アップロード', 2: 'OCR', 3: '仕訳確認', 4: '出力' };

export default function WorkflowHeader({ onBeforeNext, nextLabel = '次へ', showComplete = false }: WorkflowHeaderProps) {
  const { currentWorkflow, goToNextStep, goToPreviousStep, goToStep, saveAndExit, completeWorkflow, canGoToNextStep, canGoToPreviousStep, isStepComplete } = useWorkflow();

  const handleNext = useCallback(async () => {
    if (onBeforeNext) { const ok = await onBeforeNext(); if (!ok) return; }
    goToNextStep();
  }, [onBeforeNext, goToNextStep]);

  const handlePrev = useCallback(() => { goToPreviousStep(); }, [goToPreviousStep]);
  const handleSaveAndExit = useCallback(() => { saveAndExit(); }, [saveAndExit]);
  const handleComplete = useCallback(async () => {
    if (onBeforeNext) { const ok = await onBeforeNext(); if (!ok) return; }
    completeWorkflow();
  }, [onBeforeNext, completeWorkflow]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); handleNext(); }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); handlePrev(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNext, handlePrev]);

  if (!currentWorkflow) return null;
  const currentStep = currentWorkflow.currentStep;
  const completedCount = currentWorkflow.completedSteps.length;
  const progressPercent = Math.round((completedCount / TOTAL_STEPS) * 100);

  return (
    <div className="bg-white border-b border-gray-200 flex-shrink-0 sticky top-0 left-0 right-0 z-30">
      <div className="flex items-center px-3 py-1.5 gap-2">
        {/* 左: 前へ */}
        <button type="button" onClick={handlePrev} disabled={!canGoToPreviousStep()}
          className={`flex items-center gap-1 px-2 py-1 text-xs border rounded-md transition-all flex-shrink-0 ${canGoToPreviousStep() ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-gray-200 text-gray-300 cursor-not-allowed'}`}>
          <ArrowLeft size={13} /><span>前へ</span>
        </button>

        {/* 中央: ステッパー */}
        <div className="flex-1 flex items-center justify-center gap-0 min-w-0">
          {STEPS.map((step, index) => {
            const isComplete = isStepComplete(step);
            const isCurrent = step === currentStep;
            const isPast = step < currentStep;
            const isClickable = isPast || isComplete;
            return (
              <div key={step} className="flex items-center flex-1 min-w-0">
                <button type="button" onClick={() => isClickable && goToStep(step)} disabled={!isClickable && !isCurrent}
                  className="flex items-center gap-1 flex-shrink-0" title={getStepName(step)}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all
                    ${isCurrent ? 'bg-blue-600 text-white ring-2 ring-blue-200' : isComplete ? 'bg-green-500 text-white' : isPast ? 'bg-gray-300 text-white' : 'bg-gray-100 text-gray-400 border border-gray-200'}
                    ${isClickable && !isCurrent ? 'cursor-pointer hover:scale-110' : ''}`}>
                    {isComplete ? <CheckCircle size={11} /> : step}
                  </div>
                  <span className={`text-[10px] whitespace-nowrap hidden sm:inline ${isCurrent ? 'text-blue-600 font-semibold' : isComplete ? 'text-green-600' : 'text-gray-400'}`}>
                    {STEP_SHORT[step]}
                  </span>
                </button>
                {index < STEPS.length - 1 && (
                  <div className="flex-1 mx-1 min-w-[16px]">
                    <div className={`h-0.5 rounded-full transition-all ${isComplete || step < currentStep ? 'bg-green-400' : isCurrent ? 'bg-blue-200' : 'bg-gray-200'}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 右: 中断 + 次へ/完了 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button type="button" onClick={handleSaveAndExit}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors" title="保存して中断">
            <Save size={12} /><span>中断</span>
          </button>
          {showComplete ? (
            <button type="button" onClick={handleComplete}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 text-white rounded-md font-medium hover:bg-green-700 transition-colors">
              <CheckCircle size={13} /><span>完了</span>
            </button>
          ) : (
            <button type="button" onClick={handleNext} disabled={!canGoToNextStep()}
              className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md font-medium transition-all ${canGoToNextStep() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
              <span>{nextLabel}</span><ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="h-[3px] bg-gray-100">
        <div className="bg-blue-500 h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
      </div>
    </div>
  );
}