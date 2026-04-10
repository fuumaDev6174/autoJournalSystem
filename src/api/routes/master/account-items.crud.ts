/**
 * @module 勘定科目 CRUD
 */

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody } from '../../../shared/utils/request-helpers.js';
import { asyncHandler } from '../../helpers/async-handler.js';
import { parsePagination } from '../../helpers/pagination.js';

const router = Router();

// GET /api/account-items
router.get('/account-items', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const { industry_id, is_active } = req.query;
  const { perPage, offset } = parsePagination(req.query as Record<string, any>);
  let query = supabaseAdmin.from('account_items').select('*, account_category:account_categories(id,code,name), tax_category:tax_categories(id,code,name,display_name)');
  if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
  if (industry_id && industry_id !== 'null' && industry_id !== 'undefined') {
    query = query.or(`industry_id.eq.${industry_id},industry_id.is.null`);
  } else if (industry_id === 'null') {
    query = query.is('industry_id', null);
  }
  // Scope to user's organization or shared (null) items
  query = query.or(`organization_id.eq.${orgId},organization_id.is.null`);
  const { data, error } = await query.order('code').range(offset, offset + perPage - 1);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// POST /api/account-items
router.post('/account-items', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const body = { ...sanitizeBody(req.body, ['organization_id']), organization_id: orgId };
  const { data, error } = await supabaseAdmin.from('account_items').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
}));

// PUT /api/account-items/:id
router.put('/account-items/:id', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const body = sanitizeBody(req.body, ['organization_id']);
  const { data, error } = await supabaseAdmin
    .from('account_items')
    .update(body)
    .eq('id', req.params.id)
    .eq('organization_id', orgId)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// DELETE /api/account-items/:id
router.delete('/account-items/:id', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const { error } = await supabaseAdmin.from('account_items').delete().eq('id', req.params.id).eq('organization_id', orgId);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

// GET /api/account-categories
router.get('/account-categories', asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin.from('account_categories').select('*').order('sort_order');
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

export default router;
