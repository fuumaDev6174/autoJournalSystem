import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody, verifyClientOwnership } from '../../helpers/master-data.js';

const router = Router();

// GET /api/documents
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const { client_id, workflow_id, status: statusFilter } = req.query;

    if (client_id) {
      const owned = await verifyClientOwnership(client_id as string, authUser.organization_id);
      if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
    }

    let query = supabaseAdmin.from('documents').select('*');
    if (client_id) query = query.eq('client_id', client_id as string);
    if (workflow_id) query = query.eq('workflow_id', workflow_id as string);
    if (statusFilter) query = query.eq('status', statusFilter as string);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/documents/:id
router.get('/documents/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/documents
router.post('/documents', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const body = sanitizeBody(req.body, ['organization_id']);

    if (body.client_id) {
      const owned = await verifyClientOwnership(body.client_id, authUser.organization_id);
      if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
    }

    const { data, error } = await supabaseAdmin.from('documents').insert(body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/documents/:id
router.put('/documents/:id', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const body = sanitizeBody(req.body, ['organization_id', 'client_id']);
    const { data, error } = await supabaseAdmin
      .from('documents')
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

// DELETE /api/documents/:id
router.delete('/documents/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('documents').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
