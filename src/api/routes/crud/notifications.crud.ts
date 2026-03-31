import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';

const router = Router();

// GET /api/notifications
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const { user_id, limit: limitStr } = req.query;
    let query = supabaseAdmin.from('notifications').select('*');
    if (user_id) query = query.eq('user_id', user_id as string);
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(Number(limitStr) || 50);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/notifications/:id/read
router.put('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/notifications/read-all
router.put('/notifications/read-all', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user_id)
      .eq('is_read', false);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/notifications/unread-count
router.get('/notifications/unread-count', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id as string)
      .eq('is_read', false);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ count });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
