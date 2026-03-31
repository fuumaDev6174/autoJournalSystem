import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';

const router = Router();

// GET /api/account-items
router.get('/account-items', async (req: Request, res: Response) => {
  try {
    const { industry_id, is_active } = req.query;
    let query = supabaseAdmin.from('account_items').select('*, account_categories(*), tax_categories(*), industries(*)');
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    if (industry_id) {
      query = query.or(`industry_id.eq.${industry_id},industry_id.is.null`);
    }
    const { data, error } = await query.order('code');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/account-items
router.post('/account-items', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('account_items').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/account-items/:id
router.put('/account-items/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('account_items')
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

// DELETE /api/account-items/:id
router.delete('/account-items/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('account_items').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/account-categories
router.get('/account-categories', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('account_categories').select('*').order('sort_order');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
