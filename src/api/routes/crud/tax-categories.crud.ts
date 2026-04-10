/**
 * @module 税区分 CRUD
 */

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody, verifyClientOwnership } from '../../helpers/master-data.js';
import { asyncHandler } from '../../helpers/async-handler.js';

const router = Router();

// GET /api/tax-categories
router.get('/tax-categories', asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('tax_categories')
    .select('*')
    .order('sort_order');
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// POST /api/tax-categories
router.post('/tax-categories', asyncHandler(async (req: Request, res: Response) => {
  const body = sanitizeBody(req.body);
  const { data, error } = await supabaseAdmin.from('tax_categories').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
}));

// PUT /api/tax-categories/:id
router.put('/tax-categories/:id', asyncHandler(async (req: Request, res: Response) => {
  const body = sanitizeBody(req.body);
  const { data, error } = await supabaseAdmin
    .from('tax_categories')
    .update(body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// DELETE /api/tax-categories/:id
router.delete('/tax-categories/:id', asyncHandler(async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin.from('tax_categories').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

// GET /api/tax-rates
router.get('/tax-rates', asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('tax_rates')
    .select('*')
    .order('rate', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// POST /api/tax-rates
router.post('/tax-rates', asyncHandler(async (req: Request, res: Response) => {
  const body = sanitizeBody(req.body);
  const { data, error } = await supabaseAdmin.from('tax_rates').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
}));

// PUT /api/tax-rates/:id
router.put('/tax-rates/:id', asyncHandler(async (req: Request, res: Response) => {
  const body = sanitizeBody(req.body);
  const { data, error } = await supabaseAdmin
    .from('tax_rates')
    .update(body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// DELETE /api/tax-rates/:id
router.delete('/tax-rates/:id', asyncHandler(async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin.from('tax_rates').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

// GET /api/client-tax-category-settings
router.get('/client-tax-category-settings', asyncHandler(async (req: Request, res: Response) => {
  const { client_id } = req.query;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });
  const authUser = (req as AuthenticatedRequest).user;
  const owned = await verifyClientOwnership(client_id as string, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
  const { data, error } = await supabaseAdmin
    .from('client_tax_category_settings')
    .select('*')
    .eq('client_id', client_id as string);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// POST /api/client-tax-category-settings (upsert)
router.post('/client-tax-category-settings', asyncHandler(async (req: Request, res: Response) => {
  const body = sanitizeBody(req.body);
  const authUser = (req as AuthenticatedRequest).user;
  if (body.client_id) {
    const owned = await verifyClientOwnership(body.client_id, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
  }
  const { data, error } = await supabaseAdmin
    .from('client_tax_category_settings')
    .upsert(body)
    .select();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

export default router;
