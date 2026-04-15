// 不足書類チェック API

import { Router, Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../helpers/async-handler.js';
import { checkMissingDocs } from '../../../domain/document/missing-docs-checker.js';

const router = Router();

router.get('/clients/:id/missing-docs', asyncHandler(async (req: Request, res: Response) => {
  const orgId = (req as AuthenticatedRequest).user.organization_id;
  const result = await checkMissingDocs(req.params.id, orgId);
  res.json({ data: result });
}));

export default router;
