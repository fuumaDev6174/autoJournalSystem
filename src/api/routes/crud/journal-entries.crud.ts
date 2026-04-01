import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { sanitizeBody, verifyClientOwnership } from '../../helpers/master-data.js';

const router = Router();

const JOURNAL_SELECT = `
  *,
  journal_entry_lines(
    *,
    account_items(id, name, code),
    tax_categories(id, name)
  )
`;

const VALID_STATUSES = ['draft', 'pending', 'approved', 'exported', 'excluded'];

// GET /api/journal-entries
router.get('/journal-entries', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const { client_id, workflow_id, status: statusFilter, document_id } = req.query;

    if (client_id) {
      const owned = await verifyClientOwnership(client_id as string, authUser.organization_id);
      if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
    }

    let query = supabaseAdmin.from('journal_entries').select(JOURNAL_SELECT);
    if (client_id) query = query.eq('client_id', client_id as string);
    if (workflow_id) query = query.eq('workflow_id', workflow_id as string);
    if (document_id) query = query.eq('document_id', document_id as string);
    if (statusFilter) {
      const statuses = (statusFilter as string).split(',');
      query = query.in('status', statuses);
    }
    const { data, error } = await query.order('entry_date', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/journal-entries/:id
router.get('/journal-entries/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select(JOURNAL_SELECT)
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/journal-entries
router.post('/journal-entries', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const { lines, ...rawEntry } = req.body;
    const entry = sanitizeBody(rawEntry, ['organization_id', 'approved_at', 'approved_by']);

    if (entry.client_id) {
      const owned = await verifyClientOwnership(entry.client_id, authUser.organization_id);
      if (!owned) return res.status(403).json({ error: 'このクライアントへのアクセス権がありません' });
    }

    const { data: entryData, error: entryError } = await supabaseAdmin
      .from('journal_entries')
      .insert(entry)
      .select()
      .single();
    if (entryError) return res.status(400).json({ error: entryError.message });

    if (lines && lines.length > 0) {
      const linesWithEntryId = lines.map((l: any) => ({ ...l, journal_entry_id: entryData.id }));
      const { error: linesError } = await supabaseAdmin.from('journal_entry_lines').insert(linesWithEntryId);
      if (linesError) return res.status(400).json({ error: linesError.message });
    }

    const { data } = await supabaseAdmin
      .from('journal_entries')
      .select(JOURNAL_SELECT)
      .eq('id', entryData.id)
      .single();
    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/journal-entries/:id
router.put('/journal-entries/:id', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const { lines, ...rawEntry } = req.body;
    const entry = sanitizeBody(rawEntry, ['organization_id', 'client_id', 'approved_at', 'approved_by']);

    if (Object.keys(entry).length > 0) {
      const { error } = await supabaseAdmin
        .from('journal_entries')
        .update(entry)
        .eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
    }

    if (lines) {
      // Delete existing lines and re-insert
      await supabaseAdmin.from('journal_entry_lines').delete().eq('journal_entry_id', req.params.id);
      if (lines.length > 0) {
        const linesWithEntryId = lines.map((l: any) => ({ ...l, journal_entry_id: req.params.id }));
        const { error: linesError } = await supabaseAdmin.from('journal_entry_lines').insert(linesWithEntryId);
        if (linesError) return res.status(400).json({ error: linesError.message });
      }
    }

    const { data } = await supabaseAdmin
      .from('journal_entries')
      .select(JOURNAL_SELECT)
      .eq('id', req.params.id)
      .single();
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/journal-entries/:id
router.delete('/journal-entries/:id', async (req: Request, res: Response) => {
  try {
    await supabaseAdmin.from('journal_entry_lines').delete().eq('journal_entry_id', req.params.id);
    const { error } = await supabaseAdmin.from('journal_entries').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/journal-entries/:id/status
router.put('/journal-entries/:id/status', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `無効なステータスです。有効な値: ${VALID_STATUSES.join(', ')}` });
    }

    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/journal-entries/bulk-status
router.put('/journal-entries/bulk-status', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const { ids, status } = req.body;

    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'ids must be an array' });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `無効なステータスです。有効な値: ${VALID_STATUSES.join(', ')}` });
    }

    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .update({ status })
      .in('id', ids)
      .select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/journal-entries/:id/approve
router.post('/journal-entries/:id/approve', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const { approval_status, approval_level, comments } = req.body;
    const { data, error } = await supabaseAdmin
      .from('journal_entry_approvals')
      .insert({
        journal_entry_id: req.params.id,
        approver_id: authUser.id,
        approval_status: approval_status || 'approved',
        approval_level: approval_level || 1,
        approved_at: new Date().toISOString(),
        comments,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });

    // Update entry status
    await supabaseAdmin
      .from('journal_entries')
      .update({ status: 'approved' })
      .eq('id', req.params.id);

    res.status(201).json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/journal-entry-lines/:id
router.put('/journal-entry-lines/:id', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const body = sanitizeBody(req.body, ['journal_entry_id']);
    const { data, error } = await supabaseAdmin
      .from('journal_entry_lines')
      .update(body)
      .eq('id', req.params.id)
      .select('*, account_items(id, name, code), tax_categories(id, name)')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
