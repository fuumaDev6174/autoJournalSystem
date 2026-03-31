import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';

const router = Router();

// GET /api/users
router.get('/users', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('users').select('*').order('created_at');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/users/:id
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('users').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/users
router.post('/users', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('users').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/users/:id
router.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
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

// DELETE /api/users/:id
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('users').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
