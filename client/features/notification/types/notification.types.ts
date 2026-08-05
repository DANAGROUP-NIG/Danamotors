export type AppNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationListMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type NotificationListResponse = {
  notifications: AppNotification[];
  meta: NotificationListMeta;
};
