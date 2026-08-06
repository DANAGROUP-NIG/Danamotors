import { Request, Response, NextFunction } from 'express';
import { NotificationService } from './notification.service';

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const result = await this.notificationService.list({
        userId,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        unreadOnly: req.query.unreadOnly === 'true',
      });
      res.status(200).json({ status: 'success', statusCode: 200, data: result });
    } catch (error) {
      next(error);
    }
  };

  getUnreadCount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const count = await this.notificationService.getUnreadCount(userId);
      res.status(200).json({ status: 'success', statusCode: 200, data: { count } });
    } catch (error) {
      next(error);
    }
  };

  markRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      await this.notificationService.markRead(id, userId);
      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'Notification marked as read',
        data: null,
      });
    } catch (error) {
      next(error);
    }
  };

  markAllRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      await this.notificationService.markAllRead(userId);
      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'All notifications marked as read',
        data: null,
      });
    } catch (error) {
      next(error);
    }
  };
}
