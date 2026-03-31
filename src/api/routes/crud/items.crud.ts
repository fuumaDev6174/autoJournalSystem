import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';

const router = Router();

// GET /api/items
router.get('/items', async (req: Request, res: Response) => {
  try {
    const { is_active } = req.query;
    let query = supabaseAdmin.from('items').select('*');
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    const { data, error } = await query.order('name');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/items
router.post('/items', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('items').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/items/:id
router.put('/items/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('items')
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

// DELETE /api/items/:id
router.delete('/items/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('items').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/items/:id/aliases
router.get('/items/:id/aliases', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('item_aliases')
      .select('*')
      .eq('item_id', req.params.id)
      .order('created_at');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/items/:id/aliases
router.post('/items/:id/aliases', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('item_aliases')
      .insert({ ...req.body, item_id: req.params.id })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/item-aliases/:id
router.delete('/item-aliases/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('item_aliases').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
