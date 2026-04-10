// 仕訳エントリ 基本CRUD（GET/POST/PUT/DELETE）

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody } from '../../../shared/utils/request-helpers.js';
import { verifyClientOwnership, verifyJournalEntryOwnership } from '../../../domain/auth/authorization.service.js';
import { asyncHandler } from '../../helpers/async-handler.js';
import { parsePagination } from '../../helpers/pagination.js';

const router = Router();

export const JOURNAL_SELECT = `
  *,
  journal_entry_lines(
    *,
    account_items(id, name, code),
    tax_categories(id, name)
  )
`;

router.get('/journal-entries', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const client_id = typeof req.query.client_id === 'string' ? req.query.client_id : undefined;
  const workflow_id = typeof req.query.workflow_id === 'string' ? req.query.workflow_id : undefined;
  const document_id = typeof req.query.document_id === 'string' ? req.query.document_id : undefined;
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
  const { perPage, offset } = parsePagination(req.query as Record<string, string>);

  if (client_id) {
    const owned = await verifyClientOwnership(client_id, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
  }

  let query = supabaseAdmin.from('journal_entries').select(JOURNAL_SELECT);
  if (client_id) query = query.eq('client_id', client_id);
  if (workflow_id) query = query.eq('workflow_id', workflow_id);
  if (document_id) query = query.eq('document_id', document_id);
  if (statusFilter) query = query.in('status', statusFilter.split(','));
  const { data, error } = await query.order('entry_date', { ascending: false }).range(offset, offset + perPage - 1);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

router.get('/journal-entries/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;
  const owned = await verifyJournalEntryOwnership(id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'この仕訳へのアクセス権がありません' });

  const { data, error } = await supabaseAdmin.from('journal_entries').select(JOURNAL_SELECT).eq('id', id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json({ data });
}));

router.post('/journal-entries', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const { lines, ...rawEntry } = req.body;
  const entry = sanitizeBody(rawEntry, ['organization_id', 'approved_at', 'approved_by']);

  if (entry.client_id) {
    const owned = await verifyClientOwnership(entry.client_id, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
  }

  const { data: entryData, error: entryError } = await supabaseAdmin.from('journal_entries').insert(entry).select().single();
  if (entryError) return res.status(400).json({ error: entryError.message });

  if (lines && lines.length > 0) {
    const linesWithEntryId = lines.map((l: any) => ({ ...l, journal_entry_id: entryData.id }));
    const { error: linesError } = await supabaseAdmin.from('journal_entry_lines').insert(linesWithEntryId);
    if (linesError) return res.status(400).json({ error: linesError.message });
  }

  const { data } = await supabaseAdmin.from('journal_entries').select(JOURNAL_SELECT).eq('id', entryData.id).single();
  res.status(201).json({ data });
}));

router.put('/journal-entries/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;
  const owned = await verifyJournalEntryOwnership(id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'この仕訳へのアクセス権がありません' });

  const { lines, ...rawEntry } = req.body;
  const entry = sanitizeBody(rawEntry, ['organization_id', 'client_id', 'approved_at', 'approved_by']);

  if (Object.keys(entry).length > 0) {
    const { error } = await supabaseAdmin.from('journal_entries').update(entry).eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
  }

  if (lines) {
    // 既存の明細行を全削除して再挿入（部分更新より安全）
    await supabaseAdmin.from('journal_entry_lines').delete().eq('journal_entry_id', id);
    if (lines.length > 0) {
      const linesWithEntryId = lines.map((l: any) => ({ ...l, journal_entry_id: id }));
      const { error: linesError } = await supabaseAdmin.from('journal_entry_lines').insert(linesWithEntryId);
      if (linesError) return res.status(400).json({ error: linesError.message });
    }
  }

  const { data } = await supabaseAdmin.from('journal_entries').select(JOURNAL_SELECT).eq('id', id).single();
  res.json({ data });
}));

router.delete('/journal-entries/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;
  const owned = await verifyJournalEntryOwnership(id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'この仕訳へのアクセス権がありません' });

  await supabaseAdmin.from('journal_entry_lines').delete().eq('journal_entry_id', id);
  const { error } = await supabaseAdmin.from('journal_entries').delete().eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

export default router;
