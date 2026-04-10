// システムルート集約（health は認証不要なので server/index.ts で先にマウントされる）
import { Router } from 'express';
import health from './health.js';
import validation from './validation.js';

const router = Router();
router.use(health);
router.use(validation);
export default router;
