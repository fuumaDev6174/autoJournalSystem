// 仕訳生成 API エンドポイント（ビジネスロジックは domain/journal/journal-pipeline.service に委譲）

import { Router, Request, Response } from 'express';
import { validateBody } from '../../middleware/validate.middleware.js';
import { isValidUUID } from '../../../shared/utils/request-helpers.js';
import { verifyClientOwnership } from '../../../domain/auth/authorization.service.js';
import { getOrganizationId } from '../../../domain/master/master-data.service.js';
import { processJournalGeneration } from '../../../domain/journal/journal-pipeline.service.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

const router = Router();

router.post('/journal-entries/generate', validateBody({
  document_id: 'uuid',
  client_id: 'uuid',
  ocr_result: 'object',
}), async (req: Request, res: Response) => {
  try {
    const { document_id, client_id, ocr_result, industry } = req.body;

    if (!document_id || !client_id || !ocr_result) {
      return res.status(400).json({ error: '必須パラメータが不足しています' });
    }
    if (!isValidUUID(document_id) || !isValidUUID(client_id)) {
      return res.status(400).json({ error: 'document_id / client_id が不正な形式です' });
    }

    const authUser = (req as AuthenticatedRequest).user;
    if (!(await verifyClientOwnership(client_id, authUser.organization_id))) {
      return res.status(403).json({ error: '指定されたクライアントへのアクセス権限がありません' });
    }

    const organizationId = await getOrganizationId(client_id);
    if (!organizationId) {
      return res.status(400).json({ error: '指定された client_id に紐づく組織が見つかりません' });
    }

    const result = await processJournalGeneration({
      document_id, client_id, ocr_result, industry, organization_id: organizationId,
    });

    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[仕訳生成] エラー:', msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
