/**
 * @module 業種 CRUD
 */

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody } from '../../helpers/master-data.js';
import { asyncHandler } from '../../helpers/async-handler.js';
import { parsePagination } from '../../helpers/pagination.js';

const router = Router();

// GET /api/industries
router.get('/industries', asyncHandler(async (req: Request, res: Response) => {
  const { is_active } = req.query;
  const { perPage, offset } = parsePagination(req.query as Record<string, any>);
  let query = supabaseAdmin.from('industries').select('*');
  if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
  const { data, error } = await query.order('sort_order').range(offset, offset + perPage - 1);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// POST /api/industries
router.post('/industries', asyncHandler(async (req: Request, res: Response) => {
  const body = sanitizeBody(req.body);
  const { data, error } = await supabaseAdmin.from('industries').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
}));

// PUT /api/industries/:id
router.put('/industries/:id', asyncHandler(async (req: Request, res: Response) => {
  const body = sanitizeBody(req.body);
  const { data, error } = await supabaseAdmin
    .from('industries')
    .update(body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// DELETE /api/industries/:id
router.delete('/industries/:id', asyncHandler(async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin.from('industries').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

// GET /api/client-industries
router.get('/client-industries', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const { client_id, industry_id } = req.query;
  let query = supabaseAdmin.from('client_industries').select('*, clients(*)');
  if (client_id) query = query.eq('client_id', client_id as string);
  if (industry_id) query = query.eq('industry_id', industry_id as string);
  // Scope to user's organization via client relationship
  query = query.eq('clients.organization_id', orgId);
  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

export default router;
