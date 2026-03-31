import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';

const router = Router();

// GET /api/industries
router.get('/industries', async (req: Request, res: Response) => {
  try {
    const { is_active } = req.query;
    let query = supabaseAdmin.from('industries').select('*');
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    const { data, error } = await query.order('sort_order');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/industries
router.post('/industries', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('industries').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/industries/:id
router.put('/industries/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('industries')
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

// DELETE /api/industries/:id
router.delete('/industries/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('industries').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/client-industries
router.get('/client-industries', async (req: Request, res: Response) => {
  try {
    const { client_id, industry_id } = req.query;
    let query = supabaseAdmin.from('client_industries').select('*, clients(*)');
    if (client_id) query = query.eq('client_id', client_id as string);
    if (industry_id) query = query.eq('industry_id', industry_id as string);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
