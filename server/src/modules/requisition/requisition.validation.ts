import { z } from 'zod';
import { ChargeType } from '@prisma/client';

const id = z.string().uuid();
const percent = z.number().finite().min(0).max(100);
export const requisitionBody = z.object({
  branchId: id,
  jobCardId: id,
  chargeType: z.nativeEnum(ChargeType),
  groupId: id.optional(),
  engineerId: id.optional(),
  campaignId: id.optional(),
  goodwillReason: z.string().trim().min(1).max(2000).optional(),
  lines: z.array(z.object({
    sparePartId: id,
    quantityRequired: z.number().int().positive().max(2147483647),
    quantityIssued: z.number().int().nonnegative().max(2147483647),
    approvalPercent: percent.optional(),
    customerPercent: percent.optional(),
  }).strict()).min(1).max(100),
}).strict().refine(input => new Set(input.lines.map(line => line.sparePartId)).size === input.lines.length, 'Combine duplicate part rows');

export type RequisitionInput = z.infer<typeof requisitionBody>;
export const createRequisitionSchema = z.object({ body: requisitionBody });
export const requisitionIdSchema = z.object({ params: z.object({ id }) });
export const cancelRequisitionSchema = z.object({ params: z.object({ id }), body: z.object({ reason: z.string().trim().min(1).max(2000) }).strict() });
export const listRequisitionsSchema = z.object({ query: z.object({
  branchId: id.optional(), jobCardId: id.optional(),
  chargeType: z.nativeEnum(ChargeType).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict() });
export type RequisitionQuery = z.infer<typeof listRequisitionsSchema>['query'];
