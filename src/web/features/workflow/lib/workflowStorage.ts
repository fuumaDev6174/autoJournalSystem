// ============================================
// Workflow進捗管理
// ローカルキャッシュ + Supabase永続化
// ============================================

import { workflowsApi as backendWorkflowsApi } from '@/web/shared/lib/api/backend.api';

export interface WorkflowState {
  id: string;
  clientId: string;
  clientName: string;
  currentStep: number; // 1-4
  completedSteps: number[];
  data: {
    documents?: string[];      // アップロードしたドキュメントID
    ocrResults?: string[];     // OCR完了したID
    journalEntries?: string[]; // 生成された仕訳ID
    reviewCompleted?: boolean;
    exportCompleted?: boolean;
  };
  lastUpdated: string;
  createdAt: string;
}

// ============================================
// Supabase workflowsApi
// ============================================

export const workflowsApi = {
  /** クライアントIDで進行中のワークフローを取得 */
  getByClient: async (clientId: string): Promise<WorkflowState | null> => {
    const { data, error } = await backendWorkflowsApi.getAll({ client_id: clientId, status: 'in_progress' });

    if (error || !data || data.length === 0) return null;
    // Sort by created_at desc and take the first one
    const sorted = [...data].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return dbRowToState(sorted[0]);
  },

  /** IDで取得 */
  getById: async (id: string): Promise<WorkflowState | null> => {
    const { data, error } = await backendWorkflowsApi.getById(id);
    if (error || !data) return null;
    return dbRowToState(data);
  },

  /** 新規作成 */
  create: async (clientId: string, clientName: string): Promise<WorkflowState | null> => {
    // 既存の進行中ワークフローをキャンセル
    const { data: existing } = await backendWorkflowsApi.getAll({ client_id: clientId, status: 'in_progress' });
    if (existing) {
      for (const wf of existing) {
        await backendWorkflowsApi.cancel(wf.id);
      }
    }

    const { data, error } = await backendWorkflowsApi.create({
      client_id: clientId,
      current_step: 1,
      completed_steps: [],
      status: 'in_progress',
      data: {},
    });

    if (error || !data) {
      console.error('Failed to create workflow:', error);
      return null;
    }
    return dbRowToState(data, clientName);
  },

  /** ステップ・データ更新 */
  update: async (
    id: string,
    updates: { currentStep?: number; completedSteps?: number[]; data?: WorkflowState['data'] }
  ): Promise<WorkflowState | null> => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.currentStep !== undefined) dbUpdates.current_step = updates.currentStep;
    if (updates.completedSteps !== undefined) dbUpdates.completed_steps = updates.completedSteps;
    if (updates.data !== undefined) dbUpdates.data = updates.data;

    const { data, error } = await backendWorkflowsApi.update(id, dbUpdates);

    if (error || !data) {
      console.error('Failed to update workflow:', error);
      return null;
    }
    return dbRowToState(data);
  },

  /** 完了 */
  complete: async (id: string, userId?: string): Promise<boolean> => {
    const { error } = await backendWorkflowsApi.complete(id, userId || '');

    return !error;
  },

  /** キャンセル（中断中のワークフローを停止） */
  cancel: async (id: string): Promise<boolean> => {
    const { error } = await backendWorkflowsApi.cancel(id);

    return !error;
  },

  /** クライアントの進行中ワークフローを全てキャンセル */
  cancelAllByClient: async (clientId: string): Promise<boolean> => {
    const { data: existing } = await backendWorkflowsApi.getAll({ client_id: clientId, status: 'in_progress' });
    if (existing) {
      for (const wf of existing) {
        const { error } = await backendWorkflowsApi.cancel(wf.id);
        if (error) return false;
      }
    }
    return true;
  },

  /** ワークフロー履歴を取得（clients.tsx のステータス表示用） */
  getHistoryByClient: async (clientId: string): Promise<Array<{
    id: string;
    status: string;
    currentStep: number;
    createdAt: string;
    updatedAt: string;
  }>> => {
    const { data, error } = await backendWorkflowsApi.getAll({ client_id: clientId });

    if (error || !data) return [];
    // Sort by created_at desc and limit to 5
    return [...data]
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map((row: any) => ({
        id: row.id,
        status: row.status,
        currentStep: row.current_step,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  },
};

// ============================================
// DBレコード → WorkflowState 変換
// ============================================
function dbRowToState(row: Record<string, unknown>, clientName = ''): WorkflowState {
  const rawData = (row.data as WorkflowState['data']) ?? {};
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    clientName,
    currentStep: (row.current_step as number) ?? 1,
    completedSteps: (row.completed_steps as number[]) ?? [],
    data: rawData,
    lastUpdated: (row.updated_at as string) ?? new Date().toISOString(),
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

// ============================================
// ステップ名取得
// ============================================
export function getStepName(step: number): string {
  const stepNames = [
    '証憑アップロード',
    'OCR処理',
    '仕訳確認',
    '仕訳出力',
  ];
  return stepNames[step - 1] || '不明';
}

// ============================================
// ステップパス取得
// 新URL構造: /clients/:id/upload 等
// ============================================
export function getStepPath(step: number, clientId?: string): string {
  if (!clientId || step < 1) {
    return '/clients';
  }

  const stepSlugs: Record<number, string> = {
    1: 'upload',
    2: 'ocr',
    3: 'review',
    4: 'export',
  };

  const slug = stepSlugs[step];
  if (!slug) return '/clients';

  return `/clients/${clientId}/${slug}`;
}