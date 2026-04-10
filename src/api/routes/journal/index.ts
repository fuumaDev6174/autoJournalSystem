// 仕訳ドメインのルート集約
import { Router } from 'express';
import journalCrud from './journal.crud.js';
import journalGenerate from './journal.generate.js';
import journalCorrections from './journal-corrections.crud.js';

const router = Router();
router.use(journalCrud);
router.use(journalGenerate);
router.use(journalCorrections);
export default router;
