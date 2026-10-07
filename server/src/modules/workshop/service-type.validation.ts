import { z } from 'zod';

const charge = z.number().finite().min(0).max(1e12).multipleOf(0.01);
export const serviceTypeSettingBody = z.object({
  serviceTypeId: z.string().uuid(),
  modelId: z.string().uuid(),
  serviceCharge: charge,
  previousCharge: charge.nullable().optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
  active: z.boolean().optional(),
}).strict();
export const settingIdParams = z.object({ id: z.string().uuid() });
export const createSettingSchema = z.object({ body: serviceTypeSettingBody });
export const updateSettingSchema = z.object({
  params: settingIdParams,
  body: serviceTypeSettingBody.omit({ serviceTypeId: true, modelId: true }).partial().strict(),
});
export const deleteSettingSchema = z.object({ params: settingIdParams });
export const listSettingsSchema = z.object({ query: z.object({
  serviceTypeId: z.string().uuid(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}) });

export const serviceTypeOptionsSchema = z.object({ query: z.object({
  vehicleId: z.string().uuid(),
  date: z.string().date().optional(),
}) });
