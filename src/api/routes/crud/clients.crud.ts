import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody } from '../../helpers/master-data.js';

const router = Router();

// GET /api/clients
router.get('/clients', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    const { status } = req.query;
    let query = supabaseAdmin.from('clients').select('*, industry:industries(*)').eq('organization_id', orgId).order('name');
    if (status) query = query.eq('status', status as string);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/clients/:id
router.get('/clients/:id', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('*, industry:industries(*)')
      .eq('id', req.params.id)
      .eq('organization_id', orgId)
      .single();
    if (error) return res.status(404).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/clients
router.post('/clients', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    const body = { ...sanitizeBody(req.body, ['organization_id']), organization_id: orgId };
    const { data, error } = await supabaseAdmin.from('clients').insert(body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/clients/:id
router.put('/clients/:id', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    const body = sanitizeBody(req.body, ['organization_id']);
    const { data, error } = await supabaseAdmin
      .from('clients')
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

// DELETE /api/clients/:id
router.delete('/clients/:id', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    const { error } = await supabaseAdmin.from('clients').delete().eq('id', req.params.id).eq('organization_id', orgId);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
