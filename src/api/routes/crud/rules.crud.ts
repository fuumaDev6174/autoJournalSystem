import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';

const router = Router();

// GET /api/rules
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const { scope, industry_id, client_id, is_active } = req.query;
    let query = supabaseAdmin.from('processing_rules').select('*, industries(*), clients(*)');
    if (scope) query = query.eq('scope', scope as string);
    if (industry_id) query = query.eq('industry_id', industry_id as string);
    if (client_id) query = query.eq('client_id', client_id as string);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    const { data, error } = await query.order('priority');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/rules
router.post('/rules', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('processing_rules').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/rules/:id
router.put('/rules/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('processing_rules')
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

// DELETE /api/rules/:id
router.delete('/rules/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('processing_rules').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
