// 証憑ドメインのルート集約
import { Router } from 'express';
import documentCrud from './document.crud.js';
import documentUpload from './document.upload.js';
import documentOcr from './document.ocr.js';
import documentBatch from './document.batch.js';
import documentStorage from './document.storage.js';

const router = Router();
router.use(documentCrud);
router.use(documentUpload);
router.use(documentOcr);
router.use(documentBatch);
router.use(documentStorage);
export default router;
