import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody, verifyClientOwnership } from '../../helpers/master-data.js';

const router = Router();

// GET /api/workflows
router.get('/workflows', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const { client_id, status: statusFilter } = req.query;

    if (client_id) {
      const owned = await verifyClientOwnership(client_id as string, authUser.organization_id);
      if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
    }

    let query = supabaseAdmin.from('workflows').select('*, clients(name)');
    if (client_id) query = query.eq('client_id', client_id as string);
    if (statusFilter) query = query.eq('status', statusFilter as string);
    const { data, error } = await query.order('updated_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/workflows/:id
router.get('/workflows/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('workflows')
      .select('*, clients(name)')
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/workflows
router.post('/workflows', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const body = sanitizeBody(req.body, ['organization_id']);

    if (body.client_id) {
      const owned = await verifyClientOwnership(body.client_id, authUser.organization_id);
      if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
    }

    const { data, error } = await supabaseAdmin.from('workflows').insert(body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/workflows/:id
router.put('/workflows/:id', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const body = sanitizeBody(req.body, ['client_id']);
    const { data, error } = await supabaseAdmin
      .from('workflows')
      .update(body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/workflows/:id/complete
router.put('/workflows/:id/complete', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const { data, error } = await supabaseAdmin
      .from('workflows')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: authUser.id,
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/workflows/:id/cancel
router.put('/workflows/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('workflows')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
