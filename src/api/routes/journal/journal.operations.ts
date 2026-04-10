// 仕訳ビジネスオペレーション（ステータス変更・一括更新・承認）

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { verifyClientOwnership, verifyJournalEntryOwnership } from '../../../domain/auth/authorization.service.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { asyncHandler } from '../../helpers/async-handler.js';

const router = Router();

const VALID_STATUSES = ['draft', 'pending', 'approved', 'exported', 'excluded'];

router.put('/journal-entries/:id/status', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;
  const owned = await verifyJournalEntryOwnership(id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'この仕訳へのアクセス権がありません' });

  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `無効なステータスです。有効な値: ${VALID_STATUSES.join(', ')}` });
  }

  const { data, error } = await supabaseAdmin.from('journal_entries').update({ status }).eq('id', id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

router.put('/journal-entries/bulk-status', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const { ids, status } = req.body;

  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `無効なステータスです。有効な値: ${VALID_STATUSES.join(', ')}` });
  }

  // 全IDが自組織に属するか検証
  const { data: entries } = await supabaseAdmin.from('journal_entries').select('id, client_id').in('id', ids);
  if (entries) {
    for (const entry of entries) {
      const owned = await verifyClientOwnership(entry.client_id, authUser.organization_id);
      if (!owned) return res.status(403).json({ error: 'アクセス権のない仕訳が含まれています' });
    }
  }

  const { data, error } = await supabaseAdmin.from('journal_entries').update({ status }).in('id', ids).select();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

router.post('/journal-entries/:id/approve', requirePermission('canApproveEntries'), asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;
  const owned = await verifyJournalEntryOwnership(id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'この仕訳へのアクセス権がありません' });

  const { approval_status, approval_level, comments } = req.body;
  const { data, error } = await supabaseAdmin.from('journal_entry_approvals').insert({
    journal_entry_id: id,
    approver_id: authUser.id,
    approval_status: approval_status || 'approved',
    approval_level: approval_level || 1,
    approved_at: new Date().toISOString(),
    comments,
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });

  await supabaseAdmin.from('journal_entries').update({ status: 'approved' }).eq('id', id);
  res.status(201).json({ data });
}));

export default router;
