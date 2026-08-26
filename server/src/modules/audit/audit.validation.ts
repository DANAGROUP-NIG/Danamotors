import { z } from 'zod';

export const listAuditLogsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    userId: z.string().uuid().optional(),
    action: z.string().optional(),
    search: z.string().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  }),
});

export const auditLogIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid audit log ID'),
  }),
});
