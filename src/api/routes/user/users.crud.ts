/**
 * @module ユーザー CRUD
 */

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { sanitizeBody } from '../../helpers/master-data.js';
import { asyncHandler } from '../../helpers/async-handler.js';
import { parsePagination } from '../../helpers/pagination.js';

const router = Router();

// GET /api/users
router.get('/users', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const orgId = authUser.organization_id;
  const { perPage, offset } = parsePagination(req.query as Record<string, any>);
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at')
    .range(offset, offset + perPage - 1);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// GET /api/users/:id
router.get('/users/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const orgId = authUser.organization_id;
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', req.params.id)
    .eq('organization_id', orgId)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json({ data });
}));

router.post('/users', requirePermission('canManageUsers'), asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const orgId = authUser.organization_id;
  const body = sanitizeBody(req.body, ['organization_id']);
  body.organization_id = orgId;
  const { data, error } = await supabaseAdmin.from('users').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
}));

router.put('/users/:id', requirePermission('canManageUsers'), asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const orgId = authUser.organization_id;
  const body = sanitizeBody(req.body, ['organization_id']);
  const { data, error } = await supabaseAdmin
    .from('users')
    .update(body)
    .eq('id', req.params.id)
    .eq('organization_id', orgId)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

router.delete('/users/:id', requirePermission('canManageUsers'), asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const orgId = authUser.organization_id;
  if (req.params.id === authUser.id) {
    return res.status(400).json({ error: '自分自身を削除することはできません' });
  }
  const { error } = await supabaseAdmin
    .from('users')
    .delete()
    .eq('id', req.params.id)
    .eq('organization_id', orgId);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

export default router;
