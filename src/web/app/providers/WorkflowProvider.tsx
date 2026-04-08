import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { workflowsApi, getStepPath } from '@/web/features/workflow/lib/workflowStorage';
import { useAuth } from '@/web/app/providers/AuthProvider';
import type { WorkflowState } from '@/web/features/workflow/lib/workflowStorage';

// ============================================
// Context型定義
// ============================================
interface WorkflowContextType {
  currentWorkflow: WorkflowState | null;

  startWorkflow: (clientId: string, clientName: string) => Promise<void>;
  resumeWorkflow: (workflowId: string) => Promise<void>;
  updateWorkflowData: (data: Partial<WorkflowState['data']>) => Promise<void>;

  goToNextStep: () => Promise<void>;
  goToPreviousStep: () => Promise<void>;
  goToStep: (step: number) => Promise<void>;

  markCurrentStepComplete: () => Promise<void>;
  saveAndExit: () => void;
  completeWorkflow: () => Promise<void>;

  isStepComplete: (step: number) => boolean;
  canGoToNextStep: () => boolean;
  canGoToPreviousStep: () => boolean;
}

// ============================================
// Context作成
// ============================================
const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

// ============================================
// Provider
// ============================================
interface WorkflowProviderProps {
  children: React.ReactNode;
}

export function WorkflowProvider({ children }: WorkflowProviderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // パスパラメータから client_id を取得
  const params = useParams<{ id?: string }>();
  const clientIdFromPath = params.id;

  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowState | null>(null);

  // H4: URLパスからステップ番号を推定
  const getStepFromPath = (pathname: string): number | null => {
    const slugToStep: Record<string, number> = { upload: 1, ocr: 2, review: 3, export: 4 };
    const match = pathname.match(/\/clients\/[^/]+\/(\w+)/);
    if (match) return slugToStep[match[1]] ?? null;
    return null;
  };

  // ============================================
  // 初期化：URLのclient_idからワークフローを復元
  // ============================================
  useEffect(() => {
    if (!clientIdFromPath) return;
    // 既に同じクライアントのワークフローがロード済みならスキップ
    if (currentWorkflow?.clientId === clientIdFromPath) return;

    let cancelled = false;
    workflowsApi.getByClient(clientIdFromPath).then((workflow) => {
      if (!cancelled && workflow) {
        setCurrentWorkflow(workflow);
      }
    });
    return () => { cancelled = true; };
  }, [clientIdFromPath, currentWorkflow?.clientId]);

  // H4: URLパスが変わった時にcurrentStepを同期
  useEffect(() => {
    if (!currentWorkflow) return;
    const stepFromPath = getStepFromPath(location.pathname);
    if (stepFromPath && stepFromPath !== currentWorkflow.currentStep) {
      let cancelled = false;
      // DB更新（navigateは不要、既にそのページにいる）
      workflowsApi.update(currentWorkflow.id, { currentStep: stepFromPath }).then(updated => {
        if (!cancelled && updated) {
          setCurrentWorkflow({ ...updated, clientName: currentWorkflow.clientName });
        }
      });
      return () => { cancelled = true; };
    }
  }, [location.pathname, currentWorkflow]);

  // ============================================
  // 新規ワークフロー開始
  // ============================================
  const startWorkflow = useCallback(async (clientId: string, clientName: string) => {
    const workflow = await workflowsApi.create(clientId, clientName);
    if (!workflow) return;

    setCurrentWorkflow(workflow);
    navigate(`/clients/${clientId}/upload`);
  }, [navigate]);

  // ============================================
  // 既存ワークフロー再開
  // ============================================
  const resumeWorkflow = useCallback(async (workflowId: string) => {
    const workflow = await workflowsApi.getById(workflowId);
    if (!workflow) return;

    setCurrentWorkflow(workflow);

    const path = getStepPath(workflow.currentStep, workflow.clientId);
    navigate(path);
  }, [navigate]);

  // ============================================
  // ワークフローデータ更新
  // ============================================
  const updateWorkflowData = useCallback(async (data: Partial<WorkflowState['data']>) => {
    if (!currentWorkflow) return;

    const mergedData = { ...currentWorkflow.data, ...data };
    const updated = await workflowsApi.update(currentWorkflow.id, { data: mergedData });

    if (updated) {
      setCurrentWorkflow({ ...updated, clientName: currentWorkflow.clientName });
    }
  }, [currentWorkflow]);

  // ============================================
  // 次のステップへ
  // ============================================
  const goToNextStep = useCallback(async () => {
    if (!currentWorkflow) return;
    if (currentWorkflow.currentStep >= 4) return;

    const nextStep = currentWorkflow.currentStep + 1;
    const completedSteps = currentWorkflow.completedSteps.includes(currentWorkflow.currentStep)
      ? currentWorkflow.completedSteps
      : [...currentWorkflow.completedSteps, currentWorkflow.currentStep].sort((a, b) => a - b);

    const updated = await workflowsApi.update(currentWorkflow.id, {
      currentStep: nextStep,
      completedSteps,
    });

    if (updated) {
      setCurrentWorkflow({ ...updated, clientName: currentWorkflow.clientName });
      navigate(getStepPath(nextStep, updated.clientId));
    }
  }, [currentWorkflow, navigate]);

  // ============================================
  // 前のステップへ
  // ============================================
  const goToPreviousStep = useCallback(async () => {
    if (!currentWorkflow) return;
    if (currentWorkflow.currentStep <= 1) return;

    const prevStep = currentWorkflow.currentStep - 1;
    const updated = await workflowsApi.update(currentWorkflow.id, { currentStep: prevStep });

    if (updated) {
      setCurrentWorkflow({ ...updated, clientName: currentWorkflow.clientName });
      navigate(getStepPath(prevStep, updated.clientId));
    }
  }, [currentWorkflow, navigate]);

  // ============================================
  // 特定ステップへジャンプ
  // ============================================
  const goToStep = useCallback(async (step: number) => {
    if (!currentWorkflow) return;
    if (step < 1 || step > 4) return;

    const updated = await workflowsApi.update(currentWorkflow.id, { currentStep: step });

    if (updated) {
      setCurrentWorkflow({ ...updated, clientName: currentWorkflow.clientName });
      navigate(getStepPath(step, updated.clientId));
    }
  }, [currentWorkflow, navigate]);

  // ============================================
  // 現在のステップを完了としてマーク
  // ============================================
  const markCurrentStepComplete = useCallback(async () => {
    if (!currentWorkflow) return;

    const step = currentWorkflow.currentStep;
    if (currentWorkflow.completedSteps.includes(step)) return;

    const completedSteps = [...currentWorkflow.completedSteps, step].sort((a, b) => a - b);
    const updated = await workflowsApi.update(currentWorkflow.id, { completedSteps });

    if (updated) {
      setCurrentWorkflow({ ...updated, clientName: currentWorkflow.clientName });
    }
  }, [currentWorkflow]);

  // ============================================
  // 中断して保存（顧客一覧へ戻る）
  // ============================================
  const saveAndExit = useCallback(() => {
    // Supabaseには常に最新状態が保存済みなので追加保存不要
    navigate('/clients');
  }, [navigate]);

  // ============================================
  // ワークフロー完了
  // ============================================
  const completeWorkflow = useCallback(async () => {
    if (!currentWorkflow) return;

    await workflowsApi.complete(currentWorkflow.id, user?.id);
    setCurrentWorkflow(null);
    navigate('/clients');
  }, [currentWorkflow, navigate, user]);

  // ============================================
  // ステップ完了チェック
  // ============================================
  const isStepComplete = useCallback((step: number): boolean => {
    if (!currentWorkflow) return false;
    return currentWorkflow.completedSteps.includes(step);
  }, [currentWorkflow]);

  // ============================================
  // 次へボタン有効チェック
  // ============================================
  const canGoToNextStep = useCallback((): boolean => {
    if (!currentWorkflow) return false;
    return currentWorkflow.currentStep < 4;
  }, [currentWorkflow]);

  // ============================================
  // 前へボタン有効チェック
  // ============================================
  const canGoToPreviousStep = useCallback((): boolean => {
    if (!currentWorkflow) return false;
    return currentWorkflow.currentStep > 1;
  }, [currentWorkflow]);

  // ============================================
  // Context Value
  // ============================================
  const value: WorkflowContextType = {
    currentWorkflow,
    startWorkflow,
    resumeWorkflow,
    updateWorkflowData,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    markCurrentStepComplete,
    saveAndExit,
    completeWorkflow,
    isStepComplete,
    canGoToNextStep,
    canGoToPreviousStep,
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}

// ============================================
// Custom Hook
// ============================================
export function useWorkflow(): WorkflowContextType {
  const context = useContext(WorkflowContext);
  if (context === undefined) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return context;
}