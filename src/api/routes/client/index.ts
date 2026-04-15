// 顧客ドメインのルート集約
import { Router } from 'express';
import clientCrud from './client.crud.js';
import clientRatios from './client-ratios.crud.js';
import workflow from './workflow.crud.js';
import missingDocs from './client.missing-docs.js';

const router = Router();
router.use(clientCrud);
router.use(clientRatios);
router.use(workflow);
router.use(missingDocs);
export default router;
