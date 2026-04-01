import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody } from '../../helpers/master-data.js';

const router = Router();

// GET /api/users
router.get('/users', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const orgId = authUser.organization_id;
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/users/:id
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/users
router.post('/users', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const orgId = authUser.organization_id;
    const body = sanitizeBody(req.body, ['organization_id']);
    body.organization_id = orgId;
    const { data, error } = await supabaseAdmin.from('users').insert(body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/users/:id
router.put('/users/:id', async (req: Request, res: Response) => {
  try {
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/users/:id
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
