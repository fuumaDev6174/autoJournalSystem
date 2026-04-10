// 証憑ドキュメント CRUD

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody, verifyClientOwnership, verifyDocumentOwnership } from '../../helpers/master-data.js';
import { asyncHandler } from '../../helpers/async-handler.js';
import { parsePagination } from '../../helpers/pagination.js';

const router = Router();

router.get('/documents', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const client_id = typeof req.query.client_id === 'string' ? req.query.client_id : undefined;
  const workflow_id = typeof req.query.workflow_id === 'string' ? req.query.workflow_id : undefined;
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
  const { perPage, offset } = parsePagination(req.query as Record<string, string>);

  if (client_id) {
    const owned = await verifyClientOwnership(client_id, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
  }

  let query = supabaseAdmin.from('documents').select('*');
  if (client_id) query = query.eq('client_id', client_id);
  if (workflow_id) query = query.eq('workflow_id', workflow_id);
  if (statusFilter) query = query.eq('status', statusFilter);
  const { data, error } = await query.order('created_at', { ascending: false }).range(offset, offset + perPage - 1);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

router.get('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;
  const owned = await verifyDocumentOwnership(id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'このドキュメントへのアクセス権がありません' });

  const { data, error } = await supabaseAdmin.from('documents').select('*').eq('id', id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json({ data });
}));

router.post('/documents', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const body = sanitizeBody(req.body, ['organization_id']);

  if (body.client_id) {
    const owned = await verifyClientOwnership(body.client_id, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
  }

  body.organization_id = authUser.organization_id;
  const { data, error } = await supabaseAdmin.from('documents').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
}));

router.put('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;
  const owned = await verifyDocumentOwnership(id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'このドキュメントへのアクセス権がありません' });

  const body = sanitizeBody(req.body, ['organization_id', 'client_id']);
  const { data, error } = await supabaseAdmin.from('documents').update(body).eq('id', id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

router.delete('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;
  const owned = await verifyDocumentOwnership(id, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'このドキュメントへのアクセス権がありません' });

  const { error } = await supabaseAdmin.from('documents').delete().eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

export default router;
