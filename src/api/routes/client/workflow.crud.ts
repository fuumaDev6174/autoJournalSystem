// ワークフロー CRUD

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody } from '../../../shared/utils/request-helpers.js';
import { verifyClientOwnership, verifyWorkflowOwnership } from '../../../domain/auth/authorization.service.js';
import { asyncHandler } from '../../helpers/async-handler.js';
import { parsePagination } from '../../helpers/pagination.js';

const router = Router();

router.get('/workflows', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const client_id = typeof req.query.client_id === 'string' ? req.query.client_id : undefined;
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
  const { perPage, offset } = parsePagination(req.query as Record<string, string>);

  if (client_id) {
    const owned = await verifyClientOwnership(client_id, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
  }

  let query = supabaseAdmin.from('workflows').select('*, clients(name)');
  if (client_id) query = query.eq('client_id', client_id);
  if (statusFilter) query = query.eq('status', statusFilter);
  const { data, error } = await query.order('updated_at', { ascending: false }).range(offset, offset + perPage - 1);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

router.get('/workflows/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;
  const owned = await verifyWorkflowOwnership(id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'このワークフローへのアクセス権がありません' });

  const { data, error } = await supabaseAdmin.from('workflows').select('*, clients(name)').eq('id', id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json({ data });
}));

router.post('/workflows', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const body = sanitizeBody(req.body, ['organization_id']);

  if (body.client_id) {
    const owned = await verifyClientOwnership(body.client_id, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
  }

  body.organization_id = authUser.organization_id;
  const { data, error } = await supabaseAdmin.from('workflows').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
}));

router.put('/workflows/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;
  const owned = await verifyWorkflowOwnership(id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'このワークフローへのアクセス権がありません' });

  const body = sanitizeBody(req.body, ['client_id', 'organization_id']);
  const { data, error } = await supabaseAdmin.from('workflows').update(body).eq('id', id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

router.put('/workflows/:id/complete', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;
  const owned = await verifyWorkflowOwnership(id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'このワークフローへのアクセス権がありません' });

  const { data, error } = await supabaseAdmin.from('workflows')
    .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: authUser.id })
    .eq('id', id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

router.put('/workflows/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;
  const owned = await verifyWorkflowOwnership(id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'このワークフローへのアクセス権がありません' });

  const { data, error } = await supabaseAdmin.from('workflows').update({ status: 'cancelled' }).eq('id', id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

export default router;
