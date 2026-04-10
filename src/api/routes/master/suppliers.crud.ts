/**
 * @module 取引先 CRUD
 * @description 取引先マスタとエイリアス（名寄せ用別名）の管理。
 */

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody } from '../../../shared/utils/request-helpers.js';
import { asyncHandler } from '../../helpers/async-handler.js';
import { parsePagination } from '../../helpers/pagination.js';

const router = Router();
router.get('/suppliers', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const { is_active } = req.query;
  const { perPage, offset } = parsePagination(req.query as Record<string, any>);
  let query = supabaseAdmin.from('suppliers').select('*').eq('organization_id', orgId);
  if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
  const { data, error } = await query.order('name').range(offset, offset + perPage - 1);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// POST /api/suppliers
router.post('/suppliers', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const body = { ...sanitizeBody(req.body, ['organization_id']), organization_id: orgId };
  const { data, error } = await supabaseAdmin.from('suppliers').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
}));

// PUT /api/suppliers/:id
router.put('/suppliers/:id', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const body = sanitizeBody(req.body, ['organization_id']);
  const { data, error } = await supabaseAdmin
    .from('suppliers')
    .update(body)
    .eq('id', req.params.id)
    .eq('organization_id', orgId)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// DELETE /api/suppliers/:id
router.delete('/suppliers/:id', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const { error } = await supabaseAdmin.from('suppliers').delete().eq('id', req.params.id).eq('organization_id', orgId);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

// GET /api/suppliers/:id/aliases
router.get('/suppliers/:id/aliases', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  // Verify the supplier belongs to the user's organization
  const { data: supplier, error: supplierErr } = await supabaseAdmin
    .from('suppliers')
    .select('id')
    .eq('id', req.params.id)
    .eq('organization_id', orgId)
    .single();
  if (supplierErr || !supplier) return res.status(404).json({ error: 'Supplier not found' });

  const { data, error } = await supabaseAdmin
    .from('supplier_aliases')
    .select('*')
    .eq('supplier_id', req.params.id)
    .order('created_at');
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// POST /api/suppliers/:id/aliases
router.post('/suppliers/:id/aliases', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  // Verify the supplier belongs to the user's organization
  const { data: supplier, error: supplierErr } = await supabaseAdmin
    .from('suppliers')
    .select('id')
    .eq('id', req.params.id)
    .eq('organization_id', orgId)
    .single();
  if (supplierErr || !supplier) return res.status(404).json({ error: 'Supplier not found' });

  const body = sanitizeBody(req.body, ['organization_id']);
  const { data, error } = await supabaseAdmin
    .from('supplier_aliases')
    .insert({ ...body, supplier_id: req.params.id })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
}));

router.get('/supplier-aliases', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const { data, error } = await supabaseAdmin
    .from('supplier_aliases')
    .select('supplier_id, alias_name, suppliers!inner(organization_id)')
    .eq('suppliers.organization_id', orgId)
    .order('created_at');
  if (error) return res.status(400).json({ error: error.message });
  // suppliers JOIN カラムをレスポンスから除外
  const cleaned = (data || []).map(({ suppliers, ...rest }: any) => rest);
  res.json({ data: cleaned });
}));

// PUT /api/supplier-aliases/:id
router.put('/supplier-aliases/:id', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  // Verify the alias belongs to a supplier in user's organization
  const { data: alias } = await supabaseAdmin
    .from('supplier_aliases').select('supplier_id').eq('id', req.params.id).single();
  if (!alias) return res.status(404).json({ error: 'Alias not found' });
  const { data: supplier } = await supabaseAdmin
    .from('suppliers').select('id').eq('id', alias.supplier_id).eq('organization_id', orgId).single();
  if (!supplier) return res.status(403).json({ error: 'Unauthorized' });

  const body = sanitizeBody(req.body, ['organization_id', 'supplier_id']);
  const { data, error } = await supabaseAdmin
    .from('supplier_aliases').update(body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// DELETE /api/supplier-aliases/:id
router.delete('/supplier-aliases/:id', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  // Verify the alias belongs to a supplier in user's organization
  const { data: alias } = await supabaseAdmin
    .from('supplier_aliases').select('supplier_id').eq('id', req.params.id).single();
  if (!alias) return res.status(404).json({ error: 'Alias not found' });
  const { data: supplier } = await supabaseAdmin
    .from('suppliers').select('id').eq('id', alias.supplier_id).eq('organization_id', orgId).single();
  if (!supplier) return res.status(403).json({ error: 'Unauthorized' });

  const { error } = await supabaseAdmin.from('supplier_aliases').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

export default router;
