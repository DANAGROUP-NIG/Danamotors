import { z } from 'zod';

export const branchIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid branch ID'),
  }),
});

export const createBranchSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Branch name is required'),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    phoneNumber: z.string().optional(),
    email: z.string().email('Invalid email address').optional(),
  }),
});

export const updateBranchSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Branch name is required').optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    phoneNumber: z.string().optional(),
    email: z.string().email('Invalid email address').optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid branch ID'),
  }),
});
