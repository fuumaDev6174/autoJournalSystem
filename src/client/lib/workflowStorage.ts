// ============================================
// Workflow進捗管理
// ローカルキャッシュ + Supabase永続化
// ============================================

import { supabase } from './supabase';

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
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return dbRowToState(data);
  },

  /** IDで取得 */
  getById: async (id: string): Promise<WorkflowState | null> => {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return dbRowToState(data);
  },

  /** 新規作成 */
  create: async (clientId: string, clientName: string): Promise<WorkflowState | null> => {
    // 既存の進行中ワークフローをキャンセル
    await supabase
      .from('workflows')
      .update({ status: 'cancelled' })
      .eq('client_id', clientId)
      .eq('status', 'in_progress');

    const { data, error } = await supabase
      .from('workflows')
      .insert({
        client_id: clientId,
        current_step: 1,
        completed_steps: [],
        status: 'in_progress',
        data: {},
      })
      .select()
      .single();

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

    const { data, error } = await supabase
      .from('workflows')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      console.error('Failed to update workflow:', error);
      return null;
    }
    return dbRowToState(data);
  },

  /** 完了 */
  complete: async (id: string): Promise<boolean> => {
    // D7: 完了者の記録
    const { data: authData } = await supabase.auth.getUser();
    const completedBy = authData.user?.id || null;

    const { error } = await supabase
      .from('workflows')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: completedBy,
      })
      .eq('id', id);

    return !error;
  },

  /** キャンセル（中断中のワークフローを停止） */
  cancel: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('workflows')
      .update({ status: 'cancelled' })
      .eq('id', id);

    return !error;
  },

  /** クライアントの進行中ワークフローを全てキャンセル */
  cancelAllByClient: async (clientId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('workflows')
      .update({ status: 'cancelled' })
      .eq('client_id', clientId)
      .eq('status', 'in_progress');

    return !error;
  },

  /** ワークフロー履歴を取得（clients.tsx のステータス表示用） */
  getHistoryByClient: async (clientId: string): Promise<Array<{
    id: string;
    status: string;
    currentStep: number;
    createdAt: string;
    updatedAt: string;
  }>> => {
    const { data, error } = await supabase
      .from('workflows')
      .select('id, status, current_step, created_at, updated_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error || !data) return [];
    return data.map((row: any) => ({
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