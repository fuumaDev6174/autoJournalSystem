// ユーザードメインのルート集約
import { Router } from 'express';
import users from './users.crud.js';
import notifications from './notifications.crud.js';

const router = Router();
router.use(users);
router.use(notifications);
export default router;
