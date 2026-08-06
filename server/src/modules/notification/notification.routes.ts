import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { validateRequest } from '../../middleware/requestValidator';
import { NotificationController } from './notification.controller';
import { listNotificationsQuerySchema, notificationIdParamSchema } from './notification.validation';

const router = Router();
const controller = new NotificationController();

router.use(authMiddleware);

router.get('/', validateRequest(listNotificationsQuerySchema), controller.list);
router.get('/unread-count', controller.getUnreadCount);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', validateRequest(notificationIdParamSchema), controller.markRead);

export default router;
