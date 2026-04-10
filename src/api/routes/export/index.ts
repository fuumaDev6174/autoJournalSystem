// エクスポートドメインのルート集約
import { Router } from 'express';
import freee from './freee.js';

const router = Router();
router.use(freee);
export default router;
