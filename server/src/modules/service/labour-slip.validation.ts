import { z } from 'zod';
import { ChargeType } from '@prisma/client';

const id = z.string().uuid();
export const labourSlipLineBody = z.object({
  labourItemId: id,
  chargedHours: z.number().finite().positive().max(1000000).optional(),
  chargeType: z.nativeEnum(ChargeType),
  technicianId: id.optional(),
  mechanicId: id.optional(),
  groupId: id.optional(),
  campaignId: id.optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
}).strict().refine(line => !!line.technicianId !== !!line.mechanicId, 'Choose exactly one technician or mechanic');
export type LabourSlipLineInput = z.infer<typeof labourSlipLineBody>;
export const labourSlipBody = z.object({ branchId: id, jobCardId: id, groupId: id.optional(), engineerId: id.optional(), lines: z.array(labourSlipLineBody).min(1).max(100) }).strict();
export type LabourSlipInput = z.infer<typeof labourSlipBody>;
export const createLabourSlipSchema = z.object({ body: labourSlipBody });
export const labourSlipIdSchema = z.object({ params: z.object({ id }) });
export const addLabourSlipLineSchema = z.object({ params: z.object({ id }), body: labourSlipLineBody });
export const updateLabourSlipLineSchema = z.object({ params: z.object({ id, lineId: id }), body: labourSlipLineBody });
export const listLabourSlipsSchema = z.object({ query: z.object({ branchId: id.optional(), jobCardId: id.optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict() });
export type LabourSlipQuery = z.infer<typeof listLabourSlipsSchema>['query'];
