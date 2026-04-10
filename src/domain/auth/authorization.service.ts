// 組織所有権の検証サービス（IDOR防止）

import { supabaseAdmin } from '../../adapters/supabase/supabase-admin.client.js';

export async function verifyClientOwnership(clientId: string, organizationId: string): Promise<boolean> {
  if (!clientId || !organizationId) return false;
  const { data } = await supabaseAdmin
    .from('clients').select('id').eq('id', clientId).eq('organization_id', organizationId).single();
  return !!data;
}

export async function verifyDocumentOwnership(documentId: string, organizationId: string): Promise<boolean> {
  if (!documentId || !organizationId) return false;
  const { data: doc } = await supabaseAdmin.from('documents').select('client_id').eq('id', documentId).single();
  if (!doc?.client_id) return false;
  return verifyClientOwnership(doc.client_id, organizationId);
}

export async function verifyJournalEntryOwnership(journalEntryId: string, organizationId: string): Promise<boolean> {
  if (!journalEntryId || !organizationId) return false;
  const { data: entry } = await supabaseAdmin.from('journal_entries').select('client_id').eq('id', journalEntryId).single();
  if (!entry?.client_id) return false;
  return verifyClientOwnership(entry.client_id, organizationId);
}

export async function verifyWorkflowOwnership(workflowId: string, organizationId: string): Promise<boolean> {
  if (!workflowId || !organizationId) return false;
  const { data } = await supabaseAdmin
    .from('workflows').select('id').eq('id', workflowId).eq('organization_id', organizationId).single();
  return !!data;
}
