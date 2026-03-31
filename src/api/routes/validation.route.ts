import { Router, Request, Response } from 'express';
import { checkDocumentDuplicate } from '../../modules/document/duplicate-checker.js';
import { validateJournalBalance } from '../../server/services/validation.service.js';
import {
  supabaseAdmin,
  isValidUUID,
} from '../helpers/master-data.js';

const router = Router();

// ============================================
// バリデーションAPI (Task 5-4)
// ============================================

// (m) 仕訳エントリの貸借バランスチェック
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

// (a) 証憑重複チェック（hash_value ベース）
router.post('/validate/document-duplicate', async (req: Request, res: Response) => {
  try {
    const { hash_value, client_id, exclude_doc_id } = req.body;
    if (!client_id || !isValidUUID(client_id)) {
      return res.status(400).json({ error: 'client_id が必要です' });
    }
    const result = await checkDocumentDuplicate(supabaseAdmin, hash_value, client_id, exclude_doc_id);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
