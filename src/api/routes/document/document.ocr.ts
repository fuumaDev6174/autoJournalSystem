// OCR処理 API エンドポイント（ビジネスロジックは domain/ocr/ocr-pipeline.service に委譲）

import { Router, Request, Response } from 'express';
import { validateBody } from '../../middleware/validate.middleware.js';
import { isValidUUID } from '../../../shared/utils/request-helpers.js';
import { processDocumentOCR } from '../../../domain/ocr/ocr-pipeline.service.js';

const router = Router();

router.post('/ocr/process', validateBody({ document_id: 'uuid' }), async (req: Request, res: Response) => {
  try {
    const { document_id, file_url, file_path } = req.body;
    const targetUrl = file_url || file_path;

    if (!document_id || !targetUrl) {
      return res.status(400).json({ error: 'document_idとfile_url（またはfile_path）は必須です' });
    }
    if (!isValidUUID(document_id)) {
      return res.status(400).json({ error: 'document_idが不正な形式です' });
    }

    const result = await processDocumentOCR({ document_id, file_url: targetUrl });
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[OCR] エラー:', msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
