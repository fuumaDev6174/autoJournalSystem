/**
 * @module 顧客データ hooks
 */
import { useState, useEffect, useCallback } from 'react';
import type { Industry, ClientWithIndustry, Rule, WorkflowData } from '@/types';
import {
  clientsApi, industriesApi, accountItemsApi,
  clientAccountRatiosApi, rulesApi,
  workflowsApi as backendWorkflowsApi,
} from '@/web/shared/lib/api/backend.api';

export interface ActiveWorkflow {
  id: string;
  client_id: string;
  current_step: number;
  status: string;
  data: WorkflowData;
  updated_at: string;
  clientName?: string;
}

export interface ClientRulesData {
  clientSpecific: Rule[];
  industryRules: Rule[];
  sharedRules: Rule[];
}

export function useClientData() {
  const [clients, setClients] = useState<ClientWithIndustry[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [activeWorkflows, setActiveWorkflows] = useState<ActiveWorkflow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadClients = useCallback(async () => {
    setLoading(true);
    const { data, error } = await clientsApi.getAll();
    if (error) console.error('顧客取得エラー:', error);
    if (data) setClients(data);
    setLoading(false);
  }, []);

  const loadIndustries = useCallback(async () => {
    const { data } = await industriesApi.getAll({ is_active: 'true' });
    if (data) setIndustries(data);
  }, []);

  const loadActiveWorkflows = useCallback(async () => {
    const { data } = await backendWorkflowsApi.getAll({ status: 'in_progress' });
    if (data) {
      setActiveWorkflows(
        data.map((w) => ({
          ...w,
          clientName: (w as unknown as { clients?: { name: string } }).clients?.name ?? '不明',
        })) as ActiveWorkflow[]
      );
    }
  }, []);

  useEffect(() => {
    loadClients();
    loadIndustries();
    loadActiveWorkflows();
  }, []);

  const getWorkflowForClient = useCallback((clientId: string) =>
    activeWorkflows.find(w => w.client_id === clientId),
  [activeWorkflows]);

  return {
    clients, industries, activeWorkflows, loading,
    loadClients, loadIndustries, loadActiveWorkflows,
    getWorkflowForClient,
  };
}

export function useClientRules() {
  const [clientRules, setClientRules] = useState<ClientRulesData>({ clientSpecific: [], industryRules: [], sharedRules: [] });
  const [clientAccountItems, setClientAccountItems] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [clientRatios, setClientRatios] = useState<Array<{ account_item_id: string; business_ratio: number }>>([]);

  const loadRules = useCallback(async (client: ClientWithIndustry) => {
    const { data: accounts } = await accountItemsApi.getAll({ is_active: 'true' });
    if (accounts) setClientAccountItems(accounts.map(a => ({ id: a.id, name: a.name, code: a.code })));

    const { data: allRules } = await rulesApi.getAll({ is_active: 'true' });
    if (allRules) {
      const clientSpecific = allRules.filter(r => r.scope === 'client' && r.client_id === client.id);
      const industryRules = client.industry_id ? allRules.filter(r => r.scope === 'industry' && r.industry_id === client.industry_id) : [];
      const sharedRules = allRules.filter(r => r.scope === 'shared');
      setClientRules({ clientSpecific, industryRules, sharedRules });
    }

    const { data: ratios } = await clientAccountRatiosApi.getByClient(client.id);
    setClientRatios(ratios || []);
  }, []);

  return { clientRules, clientAccountItems, clientRatios, loadRules };
}
