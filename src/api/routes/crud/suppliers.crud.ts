import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';

const router = Router();

// GET /api/suppliers
router.get('/suppliers', async (req: Request, res: Response) => {
  try {
    const { is_active } = req.query;
    let query = supabaseAdmin.from('suppliers').select('*');
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    const { data, error } = await query.order('name');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/suppliers
router.post('/suppliers', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('suppliers').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/suppliers/:id
router.put('/suppliers/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('suppliers')
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

// DELETE /api/suppliers/:id
router.delete('/suppliers/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('suppliers').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/suppliers/:id/aliases
router.get('/suppliers/:id/aliases', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('supplier_aliases')
      .select('*')
      .eq('supplier_id', req.params.id)
      .order('created_at');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/suppliers/:id/aliases
router.post('/suppliers/:id/aliases', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('supplier_aliases')
      .insert({ ...req.body, supplier_id: req.params.id })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/supplier-aliases (all aliases)
router.get('/supplier-aliases', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('supplier_aliases')
      .select('supplier_id, alias_name')
      .order('created_at');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/supplier-aliases/:id
router.delete('/supplier-aliases/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('supplier_aliases').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
