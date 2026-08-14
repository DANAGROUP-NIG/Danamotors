import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
    unreadOnly: z.enum(['true', 'false']).optional(),
    branchId: z.string().uuid('Invalid branch ID').optional(),
  }),
});

export const notificationIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid notification ID'),
  }),
});
