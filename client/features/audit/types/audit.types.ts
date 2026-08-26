export type AuditUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

export type AuditLog = {
  id: string;
  action: string;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  userId?: string | null;
  createdAt: string;
  user: AuditUser | null;
};

export type AuditLogParams = {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type AuditLogsResponse = {
  logs: AuditLog[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

export type AuditStats = {
  totalLogs: number;
  todayCount: number;
  topActions: Array<{ action: string; count: number }>;
  topUsers: Array<{ userId: string; name: string; count: number }>;
};
