import { z } from 'zod';
import { MASTER_KINDS } from './master-kinds';

export const masterKind = z.enum(MASTER_KINDS);

export const masterBody = z.object({
  kind: masterKind,
  code: z.string().trim().min(1).max(50),
  description: z.string().trim().min(1).max(300),
  shortDescription: z.string().trim().max(50).nullable().optional(),
  attributes: z.record(z.unknown()).nullable().optional(),
  active: z.boolean().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  chargedTo: z.enum(['CUSTOMER', 'COMPANY']).optional(),
  freeService: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(100000).nullable().optional(),
  preDelivery: z.boolean().optional(),
  parentId: z.string().uuid().nullable().optional(),
  fuel: z.string().trim().max(50).nullable().optional(),
  gearbox: z.string().trim().max(50).nullable().optional(),
  acFitted: z.boolean().optional(),
  warrantyDays: z.number().int().nonnegative().nullable().optional(),
  warrantyKm: z.number().int().nonnegative().nullable().optional(),
}).strict();

export const createMasterSchema = z.object({
  body: masterBody,
});

export const updateMasterSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),

  body: masterBody.omit({
    kind: true,
  }).partial().strict(),
});

export const listMasterSchema = z.object({
  query: z.object({
    kind: masterKind.optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
    includeInactive: z.enum(['true', 'false']).optional(),
    parentId: z.string().uuid().optional(),
  }),
});
