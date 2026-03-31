import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';

const router = Router();

// GET /api/workflows
router.get('/workflows', async (req: Request, res: Response) => {
  try {
    const { client_id, status: statusFilter } = req.query;
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

// POST /api/workflows
router.post('/workflows', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('workflows').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/workflows/:id
router.put('/workflows/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('workflows')
      .update(req.body)
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
    const { completed_by } = req.body;
    const { data, error } = await supabaseAdmin
      .from('workflows')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by,
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
