/**
 * @module 仕訳ルール CRUD
 */

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody } from '../../../shared/utils/request-helpers.js';
import { asyncHandler } from '../../helpers/async-handler.js';
import { parsePagination } from '../../helpers/pagination.js';

const router = Router();

// GET /api/rules
router.get('/rules', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const { scope, industry_id, client_id, is_active } = req.query;
  const { perPage, offset } = parsePagination(req.query as Record<string, any>);
  let query = supabaseAdmin.from('processing_rules').select('*, industries(*), clients(*)');
  // Scope to user's organization or shared (null) rules
  query = query.or(`organization_id.eq.${orgId},organization_id.is.null`);
  if (scope) query = query.eq('scope', scope as string);
  if (industry_id) query = query.eq('industry_id', industry_id as string);
  if (client_id) query = query.eq('client_id', client_id as string);
  if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
  const { data, error } = await query.order('priority').range(offset, offset + perPage - 1);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// POST /api/rules
router.post('/rules', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const body = { ...sanitizeBody(req.body, ['organization_id']), organization_id: orgId };
  const { data, error } = await supabaseAdmin.from('processing_rules').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
}));

// PUT /api/rules/:id
router.put('/rules/:id', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const body = sanitizeBody(req.body, ['organization_id']);
  const { data, error } = await supabaseAdmin
    .from('processing_rules')
    .update(body)
    .eq('id', req.params.id)
    .eq('organization_id', orgId)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// DELETE /api/rules/:id
router.delete('/rules/:id', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const { error } = await supabaseAdmin
    .from('processing_rules')
    .delete()
    .eq('id', req.params.id)
    .eq('organization_id', orgId);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

export default router;
