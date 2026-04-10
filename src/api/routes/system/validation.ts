/**
 * @module バリデーション API
 * @description 仕訳の貸借バランスチェック・証憑重複チェック。
 */

import { Router, Request, Response } from 'express';
import { checkDocumentDuplicate } from '../../../domain/document/duplicate-checker.js';
import { validateJournalBalance } from '../../../domain/accounting/balance-validator.js';
import {
  supabaseAdmin,
  isValidUUID,
  verifyClientOwnership,
} from '../../helpers/master-data.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

const router = Router();

router.post('/validate/journal-balance', async (req: Request, res: Response) => {
  try {
    const { journal_entry_id } = req.body;
    if (!journal_entry_id || !isValidUUID(journal_entry_id)) {
      return res.status(400).json({ error: 'journal_entry_id が必要です' });
    }
    const result = await validateJournalBalance(supabaseAdmin, journal_entry_id);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/validate/document-duplicate', async (req: Request, res: Response) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    const { hash_value, client_id, exclude_doc_id } = req.body;
    if (!client_id || !isValidUUID(client_id)) {
      return res.status(400).json({ error: 'client_id が必要です' });
    }
    const owned = await verifyClientOwnership(client_id, authUser.organization_id);
    if (!owned) return res.status(403).json({ error: 'アクセス権がありません' });
    const result = await checkDocumentDuplicate(supabaseAdmin, hash_value, client_id, exclude_doc_id);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
