// 仕訳ドメインのルート集約
import { Router } from 'express';
import journalCrud from './journal.crud.js';
import journalOperations from './journal.operations.js';
import journalLines from './journal-lines.crud.js';
import journalGenerate from './journal.generate.js';
import journalCorrections from './journal-corrections.crud.js';

const router = Router();
// bulk-status は /:id より前にマウントする必要がある
router.use(journalOperations);
router.use(journalCrud);
router.use(journalLines);
router.use(journalGenerate);
router.use(journalCorrections);
export default router;
