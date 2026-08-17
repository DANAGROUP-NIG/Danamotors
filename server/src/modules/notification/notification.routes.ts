import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { validateRequest } from '../../middleware/requestValidator';
import { NotificationController } from './notification.controller';
import { listNotificationsQuerySchema, notificationIdParamSchema } from './notification.validation';

const router = Router();
const controller = new NotificationController();

router.use(authMiddleware);

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: List notifications
 *     description: Returns the authenticated user's notification feed.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: unread
 *         schema: { type: boolean }
 *         description: Filter to unread only
 *     responses:
 *       200:
 *         description: Notification list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /notifications/unread-count:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: Get unread notification count
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Unread notification count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     count: { type: integer, example: 7 }
 *
 * /notifications/read-all:
 *   patch:
 *     tags:
 *       - Notifications
 *     summary: Mark all notifications as read
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /notifications/{id}/read:
 *   patch:
 *     tags:
 *       - Notifications
 *     summary: Mark a single notification as read
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
router.get('/', validateRequest(listNotificationsQuerySchema), controller.list);
router.get('/unread-count', controller.getUnreadCount);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', validateRequest(notificationIdParamSchema), controller.markRead);

export default router;

