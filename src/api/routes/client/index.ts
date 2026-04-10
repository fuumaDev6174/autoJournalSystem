// 顧客ドメインのルート集約
import { Router } from 'express';
import clientCrud from './client.crud.js';
import clientRatios from './client-ratios.crud.js';
import workflow from './workflow.crud.js';

const router = Router();
router.use(clientCrud);
router.use(clientRatios);
router.use(workflow);
export default router;
