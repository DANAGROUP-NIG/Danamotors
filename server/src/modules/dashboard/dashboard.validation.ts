import { z } from 'zod';

export const dashboardStatsQuerySchema = z.object({
  query: z.object({
    branchId: z.string().uuid('Invalid branch ID').optional(),
  }),
});
