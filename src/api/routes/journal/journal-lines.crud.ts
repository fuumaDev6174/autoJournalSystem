// 仕訳明細行の個別更新

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody } from '../../../shared/utils/request-helpers.js';
import { verifyJournalEntryOwnership } from '../../../domain/auth/authorization.service.js';
import { asyncHandler } from '../../helpers/async-handler.js';

const router = Router();

router.put('/journal-entry-lines/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;

  // 明細行の親エントリが自組織に属するか検証
  const { data: line } = await supabaseAdmin.from('journal_entry_lines').select('journal_entry_id').eq('id', id).single();
  if (!line) return res.status(404).json({ error: '明細行が見つかりません' });
  const owned = await verifyJournalEntryOwnership(line.journal_entry_id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'この仕訳へのアクセス権がありません' });

  const body = sanitizeBody(req.body, ['journal_entry_id']);
  const { data, error } = await supabaseAdmin
    .from('journal_entry_lines')
    .update(body)
    .eq('id', id)
    .select('*, account_items(id, name, code), tax_categories(id, name)')
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

export default router;
