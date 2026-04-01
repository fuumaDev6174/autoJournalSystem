import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody } from '../../helpers/master-data.js';

const router = Router();

// GET /api/items
router.get('/items', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    const { is_active } = req.query;
    let query = supabaseAdmin.from('items').select('*');
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    // Scope to user's organization or shared (null) items
    query = query.or(`organization_id.eq.${orgId},organization_id.is.null`);
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
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    const body = { ...sanitizeBody(req.body, ['organization_id']), organization_id: orgId };
    const { data, error } = await supabaseAdmin.from('items').insert(body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/items/:id
router.put('/items/:id', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    const body = sanitizeBody(req.body, ['organization_id']);
    const { data, error } = await supabaseAdmin
      .from('items')
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

// DELETE /api/items/:id
router.delete('/items/:id', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    const { error } = await supabaseAdmin.from('items').delete().eq('id', req.params.id).eq('organization_id', orgId);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/items/:id/aliases
router.get('/items/:id/aliases', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    // Verify the item belongs to the user's organization
    const { data: item, error: itemErr } = await supabaseAdmin
      .from('items')
      .select('id')
      .eq('id', req.params.id)
      .eq('organization_id', orgId)
      .single();
    if (itemErr || !item) return res.status(404).json({ error: 'Item not found' });

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
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    // Verify the item belongs to the user's organization
    const { data: item, error: itemErr } = await supabaseAdmin
      .from('items')
      .select('id')
      .eq('id', req.params.id)
      .eq('organization_id', orgId)
      .single();
    if (itemErr || !item) return res.status(404).json({ error: 'Item not found' });

    const body = sanitizeBody(req.body, ['organization_id']);
    const { data, error } = await supabaseAdmin
      .from('item_aliases')
      .insert({ ...body, item_id: req.params.id })
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
