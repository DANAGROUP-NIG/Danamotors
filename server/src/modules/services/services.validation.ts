import { z } from 'zod';

export const serviceIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid service ID'),
  }),
});

export const createServiceSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Service name is required'),
    description: z.string().optional(),
    category: z.string().optional(),
    durationMins: z.number().int().positive().optional(),
    price: z.number().nonnegative().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const updateServiceSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Service name is required').optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    durationMins: z.number().int().positive().optional(),
    price: z.number().nonnegative().optional(),
    isActive: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid service ID'),
  }),
});
