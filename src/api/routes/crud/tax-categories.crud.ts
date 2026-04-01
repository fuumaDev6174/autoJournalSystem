import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { sanitizeBody } from '../../helpers/master-data.js';

const router = Router();

// GET /api/tax-categories
router.get('/tax-categories', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tax_categories')
      .select('*')
      .order('sort_order');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tax-categories
router.post('/tax-categories', async (req: Request, res: Response) => {
  try {
    const body = sanitizeBody(req.body);
    const { data, error } = await supabaseAdmin.from('tax_categories').insert(body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/tax-categories/:id
router.put('/tax-categories/:id', async (req: Request, res: Response) => {
  try {
    const body = sanitizeBody(req.body);
    const { data, error } = await supabaseAdmin
      .from('tax_categories')
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

// DELETE /api/tax-categories/:id
router.delete('/tax-categories/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('tax_categories').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tax-rates
router.get('/tax-rates', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tax_rates')
      .select('*')
      .order('rate', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tax-rates
router.post('/tax-rates', async (req: Request, res: Response) => {
  try {
    const body = sanitizeBody(req.body);
    const { data, error } = await supabaseAdmin.from('tax_rates').insert(body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/tax-rates/:id
router.put('/tax-rates/:id', async (req: Request, res: Response) => {
  try {
    const body = sanitizeBody(req.body);
    const { data, error } = await supabaseAdmin
      .from('tax_rates')
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

// DELETE /api/tax-rates/:id
router.delete('/tax-rates/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('tax_rates').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/client-tax-category-settings
router.get('/client-tax-category-settings', async (req: Request, res: Response) => {
  try {
    const { client_id } = req.query;
    if (!client_id) return res.status(400).json({ error: 'client_id is required' });
    const { data, error } = await supabaseAdmin
      .from('client_tax_category_settings')
      .select('*')
      .eq('client_id', client_id as string);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/client-tax-category-settings (upsert)
router.post('/client-tax-category-settings', async (req: Request, res: Response) => {
  try {
    const body = sanitizeBody(req.body);
    const { data, error } = await supabaseAdmin
      .from('client_tax_category_settings')
      .upsert(body)
      .select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
