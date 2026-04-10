/**
 * @module クライアント勘定科目比率 CRUD
 */

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody } from '../../../shared/utils/request-helpers.js';
import { verifyClientOwnership } from '../../../domain/auth/authorization.service.js';
import { asyncHandler } from '../../helpers/async-handler.js';

const router = Router();

// GET /api/client-account-ratios
router.get('/client-account-ratios', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const { client_id } = req.query;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  const owned = await verifyClientOwnership(client_id as string, authUser.organization_id);
  if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });

  const { data, error } = await supabaseAdmin
    .from('client_account_ratios')
    .select('*')
    .eq('client_id', client_id as string)
    .is('valid_until', null);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// POST /api/client-account-ratios (upsert)
router.post('/client-account-ratios', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user;
  const body = sanitizeBody(req.body, ['organization_id']);

  if (body.client_id) {
    const owned = await verifyClientOwnership(body.client_id, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
  }

  const { data, error } = await supabaseAdmin
    .from('client_account_ratios')
    .upsert(body)
    .select();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// DELETE /api/client-account-ratios/:id
router.delete('/client-account-ratios/:id', asyncHandler(async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin.from('client_account_ratios').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

export default router;
