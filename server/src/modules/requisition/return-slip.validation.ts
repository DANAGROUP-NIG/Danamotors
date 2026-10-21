import { z } from 'zod';
import { ChargeType } from '@prisma/client';

const id = z.string().uuid();
export const returnSlipBody = z.object({
  requisitionId: id,
  lines: z.array(z.object({ requisitionLineId: id, quantity: z.number().int().positive().max(2147483647) }).strict()).min(1).max(100),
}).strict().refine(input => new Set(input.lines.map(line => line.requisitionLineId)).size === input.lines.length, 'Combine duplicate return rows');
export type ReturnSlipInput = z.infer<typeof returnSlipBody>;
export const createReturnSlipSchema = z.object({ body: returnSlipBody });
export const returnSlipIdSchema = z.object({ params: z.object({ id }) });
export const cancelReturnSlipSchema = z.object({ params: z.object({ id }), body: z.object({ reason: z.string().trim().min(1).max(2000) }).strict() });
export const listReturnSlipsSchema = z.object({ query: z.object({
  branchId: id.optional(), jobCardId: id.optional(), requisitionId: id.optional(), chargeType: z.nativeEnum(ChargeType).optional(),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict() });
export type ReturnSlipQuery = z.infer<typeof listReturnSlipsSchema>['query'];
