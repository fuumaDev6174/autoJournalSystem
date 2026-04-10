// マスタデータドメインのルート集約
import { Router } from 'express';
import accountItems from './account-items.crud.js';
import taxCategories from './tax-categories.crud.js';
import industries from './industries.crud.js';
import suppliers from './suppliers.crud.js';
import items from './items.crud.js';
import rules from './rules.crud.js';

const router = Router();
router.use(accountItems);
router.use(taxCategories);
router.use(industries);
router.use(suppliers);
router.use(items);
router.use(rules);
export default router;
