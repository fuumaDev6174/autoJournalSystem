import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';

const router = Router();

// GET /api/clients
router.get('/clients', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    let query = supabaseAdmin.from('clients').select('*, industry:industries(*)').order('name');
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
    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('*, industry:industries(*)')
      .eq('id', req.params.id)
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
    const { data, error } = await supabaseAdmin.from('clients').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/clients/:id
router.put('/clients/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('clients')
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

// DELETE /api/clients/:id
router.delete('/clients/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('clients').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
