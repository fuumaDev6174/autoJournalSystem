/**
 * @module 仕訳エントリ CRUD
 */

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody, verifyClientOwnership, verifyJournalEntryOwnership } from '../../helpers/master-data.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { asyncHandler } from '../../helpers/async-handler.js';
import { parsePagination } from '../../helpers/pagination.js';

const router = Router();

/** 仕訳の取得時に明細行・勘定科目・税区分を JOIN するクエリ */
const JOURNAL_SELECT = `
  *,
  journal_entry_lines(
    *,
    account_items(id, name, code),
    tax_categories(id, name)
  )
`;

const VALID_STATUSES = ['draft', 'pending', 'approved', 'exported', 'excluded'];

// GET /api/journal-entries
router.get('/journal-entries', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const { client_id, workflow_id, status: statusFilter, document_id } = req.query;
  const { perPage, offset } = parsePagination(req.query as Record<string, any>);

  if (client_id) {
    const owned = await verifyClientOwnership(client_id as string, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
  }

  let query = supabaseAdmin.from('journal_entries').select(JOURNAL_SELECT);
  if (client_id) query = query.eq('client_id', client_id as string);
  if (workflow_id) query = query.eq('workflow_id', workflow_id as string);
  if (document_id) query = query.eq('document_id', document_id as string);
  if (statusFilter) {
    const statuses = (statusFilter as string).split(',');
    query = query.in('status', statuses);
  }
  const { data, error } = await query.order('entry_date', { ascending: false }).range(offset, offset + perPage - 1);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// GET /api/journal-entries/:id
router.get('/journal-entries/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const owned = await verifyJournalEntryOwnership(req.params.id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'この仕訳へのアクセス権がありません' });

  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .select(JOURNAL_SELECT)
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json({ data });
}));

// POST /api/journal-entries
router.post('/journal-entries', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const { lines, ...rawEntry } = req.body;
  const entry = sanitizeBody(rawEntry, ['organization_id', 'approved_at', 'approved_by']);

  if (entry.client_id) {
    const owned = await verifyClientOwnership(entry.client_id, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
  }

  const { data: entryData, error: entryError } = await supabaseAdmin
    .from('journal_entries')
    .insert(entry)
    .select()
    .single();
  if (entryError) return res.status(400).json({ error: entryError.message });

  if (lines && lines.length > 0) {
    const linesWithEntryId = lines.map((l: any) => ({ ...l, journal_entry_id: entryData.id }));
    const { error: linesError } = await supabaseAdmin.from('journal_entry_lines').insert(linesWithEntryId);
    if (linesError) return res.status(400).json({ error: linesError.message });
  }

  const { data } = await supabaseAdmin
    .from('journal_entries')
    .select(JOURNAL_SELECT)
    .eq('id', entryData.id)
    .single();
  res.status(201).json({ data });
}));

router.put('/journal-entries/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const owned = await verifyJournalEntryOwnership(req.params.id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'この仕訳へのアクセス権がありません' });

  const { lines, ...rawEntry } = req.body;
  const entry = sanitizeBody(rawEntry, ['organization_id', 'client_id', 'approved_at', 'approved_by']);

  if (Object.keys(entry).length > 0) {
    const { error } = await supabaseAdmin
      .from('journal_entries')
      .update(entry)
      .eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
  }

  if (lines) {
    // 既存の明細行を全削除して再挿入する（部分更新より安全）
    await supabaseAdmin.from('journal_entry_lines').delete().eq('journal_entry_id', req.params.id);
    if (lines.length > 0) {
      const linesWithEntryId = lines.map((l: any) => ({ ...l, journal_entry_id: req.params.id }));
      const { error: linesError } = await supabaseAdmin.from('journal_entry_lines').insert(linesWithEntryId);
      if (linesError) return res.status(400).json({ error: linesError.message });
    }
  }

  const { data } = await supabaseAdmin
    .from('journal_entries')
    .select(JOURNAL_SELECT)
    .eq('id', req.params.id)
    .single();
  res.json({ data });
}));

router.delete('/journal-entries/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const owned = await verifyJournalEntryOwnership(req.params.id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'この仕訳へのアクセス権がありません' });

  await supabaseAdmin.from('journal_entry_lines').delete().eq('journal_entry_id', req.params.id);
  const { error } = await supabaseAdmin.from('journal_entries').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

// PUT /api/journal-entries/:id/status
router.put('/journal-entries/:id/status', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const owned = await verifyJournalEntryOwnership(req.params.id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'この仕訳へのアクセス権がありません' });

  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `無効なステータスです。有効な値: ${VALID_STATUSES.join(', ')}` });
  }

  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// PUT /api/journal-entries/bulk-status
router.put('/journal-entries/bulk-status', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const { ids, status } = req.body;

  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids must be an array' });
  }

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `無効なステータスです。有効な値: ${VALID_STATUSES.join(', ')}` });
  }

  // 全IDが自組織に属するか検証
  const { data: entries } = await supabaseAdmin
    .from('journal_entries')
    .select('id, client_id')
    .in('id', ids);
  if (entries) {
    for (const entry of entries) {
      const owned = await verifyClientOwnership(entry.client_id, authUser.organization_id);
      if (!owned) return res.status(403).json({ error: 'アクセス権のない仕訳が含まれています' });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .update({ status })
    .in('id', ids)
    .select();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// POST /api/journal-entries/:id/approve
router.post('/journal-entries/:id/approve', requirePermission('canApproveEntries'), asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const owned = await verifyJournalEntryOwnership(req.params.id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'この仕訳へのアクセス権がありません' });

  const { approval_status, approval_level, comments } = req.body;
  const { data, error } = await supabaseAdmin
    .from('journal_entry_approvals')
    .insert({
      journal_entry_id: req.params.id,
      approver_id: authUser.id,
      approval_status: approval_status || 'approved',
      approval_level: approval_level || 1,
      approved_at: new Date().toISOString(),
      comments,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  await supabaseAdmin
    .from('journal_entries')
    .update({ status: 'approved' })
    .eq('id', req.params.id);

  res.status(201).json({ data });
}));

// PUT /api/journal-entry-lines/:id
router.put('/journal-entry-lines/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;

  // 明細行の親エントリが自組織に属するか検証
  const { data: line } = await supabaseAdmin
    .from('journal_entry_lines')
    .select('journal_entry_id')
    .eq('id', req.params.id)
    .single();
  if (!line) return res.status(404).json({ error: '明細行が見つかりません' });
  const owned = await verifyJournalEntryOwnership(line.journal_entry_id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'この仕訳へのアクセス権がありません' });

  const body = sanitizeBody(req.body, ['journal_entry_id']);
  const { data, error } = await supabaseAdmin
    .from('journal_entry_lines')
    .update(body)
    .eq('id', req.params.id)
    .select('*, account_items(id, name, code), tax_categories(id, name)')
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

export default router;
