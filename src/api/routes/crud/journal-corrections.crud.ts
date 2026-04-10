/**
 * @module 仕訳修正履歴 CRUD
 */

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody, verifyClientOwnership } from '../../helpers/master-data.js';
import { asyncHandler } from '../../helpers/async-handler.js';

const router = Router();

// POST /api/journal-entry-corrections
router.post('/journal-entry-corrections', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const body = sanitizeBody(req.body);
  if (body.client_id) {
    const owned = await verifyClientOwnership(body.client_id, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'アクセス権がありません' });
  }
  const { data, error } = await supabaseAdmin
    .from('journal_entry_corrections')
    .insert(body)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
}));

// GET /api/journal-entry-corrections/count
router.get('/journal-entry-corrections/count', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const { client_id, field_name, corrected_value, rule_suggested } = req.query;
  if (client_id) {
    const owned = await verifyClientOwnership(client_id as string, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'アクセス権がありません' });
  }
  let query = supabaseAdmin.from('journal_entry_corrections').select('id', { count: 'exact', head: true });
  if (client_id) query = query.eq('client_id', client_id as string);
  if (field_name) query = query.eq('field_name', field_name as string);
  if (corrected_value) query = query.eq('corrected_value', corrected_value as string);
  if (rule_suggested !== undefined) query = query.eq('rule_suggested', rule_suggested === 'true');
  const { count, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ count });
}));

// PUT /api/journal-entry-corrections/mark-suggested
router.put('/journal-entry-corrections/mark-suggested', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const { client_id, field_name, corrected_value } = req.body;
  if (client_id) {
    const owned = await verifyClientOwnership(client_id, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'アクセス権がありません' });
  }
  const { error } = await supabaseAdmin
    .from('journal_entry_corrections')
    .update({ rule_suggested: true })
    .eq('client_id', client_id)
    .eq('field_name', field_name)
    .eq('corrected_value', corrected_value);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
}));

// GET /api/excluded-entries
router.get('/excluded-entries', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const { client_id } = req.query;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });
  const owned = await verifyClientOwnership(client_id as string, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'アクセス権がありません' });
  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .select('*, journal_entry_lines(*, account_items(id, name, code), tax_categories(id, name))')
    .eq('client_id', client_id as string)
    .eq('is_excluded', true)
    .order('entry_date', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

export default router;
