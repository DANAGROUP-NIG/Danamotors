import { z } from 'zod';
import { dateString, MAX_RANGE_DAYS } from '../reports/core/filters';
import { daysBetween } from '../reports/core/dates';
import { CSC_STAGES, MAX_CONTACT_SLOTS } from './csc.logic';

const uuid = z.string().uuid();
const days = (label: string) => z.number({ invalid_type_error: `${label} must be a number` }).int(`${label} must be a whole number`).min(0).max(3650);
const km = (label: string) => z.number({ invalid_type_error: `${label} must be a number` }).int(`${label} must be a whole number`).min(0).max(1_000_000);
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().nullable().transform((value) => (value ? value : null));
const branchId = uuid.optional();

// ── Masters ───────────────────────────────────────────────────────────────────

export const ruleServiceBody = z
  .object({
    serviceTypeId: uuid,
    dueDays: days('Due days'),
    dueKm: km('Due mileage'),
    rotationDays: days('Rotation days'),
    rotationKm: km('Rotation mileage'),
    followUp1Days: days('1st follow-up days'),
    followUp2Days: days('2nd follow-up days'),
    variationDays: days('Variation days'),
    variationKm: km('Variation mileage'),
    active: z.boolean().default(true),
  })
  .strict();

/** One version (effective date) of a model's schedule, optionally applied to several models at once. */
export const saveRulesSchema = z.object({
  body: z
    .object({
      modelIds: z.array(uuid).min(1, 'Choose a model').max(200).refine((ids) => new Set(ids).size === ids.length, 'A model can be chosen only once'),
      effectiveDate: dateString,
      notVisitedMonths: z.number().int().min(1, 'Enter at least 1 month').max(240),
      matchDaysBefore: days('Days before the due date').max(90),
      matchDaysAfter: days('Days after the due date').max(90),
      services: z
        .array(ruleServiceBody)
        .min(1, 'Add at least one service')
        .max(30)
        .refine((rows) => new Set(rows.map((row) => row.serviceTypeId)).size === rows.length, 'A service can be listed only once'),
    })
    .strict(),
});

export const rulesQuerySchema = z.object({ query: z.object({ modelId: uuid }).strict() });

const reasonFields = {
  description: text(120).min(1, 'Enter the reason description'),
  shortDescription: optionalText(20),
  closureType: z.enum(['FINAL', 'PARTIAL']),
  active: z.boolean().default(true),
};

export const createReasonSchema = z.object({
  body: z
    .object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/, 'Use up to 10 letters, digits or dashes, e.g. R0009'),
      ...reasonFields,
    })
    .strict(),
});
export const updateReasonSchema = z.object({ params: z.object({ id: uuid }), body: z.object(reasonFields).strict() });
export const reasonIdSchema = z.object({ params: z.object({ id: uuid }) });
export const reasonListSchema = z.object({ query: z.object({ includeInactive: z.enum(['true', 'false']).optional() }).strict() });

// ── Cases ─────────────────────────────────────────────────────────────────────

const idList = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const list = (Array.isArray(value) ? value : [value]).flatMap((item) => String(item).split(',')).map((item) => item.trim()).filter(Boolean);
  return list.length ? Array.from(new Set(list)) : undefined;
}, z.array(uuid).max(500).optional());

const range = <T extends { from: string; to: string }>(value: T, ctx: z.RefinementCtx) => {
  const span = daysBetween(value.from, value.to);
  if (span < 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'The end date must be on or after the start date' });
  else if (span + 1 > MAX_RANGE_DAYS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: `The period cannot be longer than ${MAX_RANGE_DAYS} days` });
};

export const generateSchema = z.object({
  body: z
    .object({ branchId, from: dateString, to: dateString, modelIds: z.array(uuid).max(500).optional(), serviceTypeIds: z.array(uuid).max(50).optional() })
    .strict()
    .superRefine(range),
});

const flag = z.preprocess((value) => value === true || value === 'true' || value === '1', z.boolean());

export const caseListSchema = z.object({
  query: z
    .object({
      branchId,
      stage: z.enum(CSC_STAGES),
      state: z.enum(['DUE', 'DONE', 'BOTH']).default('DUE'),
      from: dateString,
      to: dateString,
      includeFirstNotDone: flag.default(false),
      daysNotVisited: z.coerce.number().int().min(0).max(3650).optional(),
      onlyFollowedUp: flag.default(false),
      modelId: idList,
      serviceTypeId: idList,
      search: z.string().trim().max(50).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    })
    .strict()
    .superRefine(range),
});

export const caseIdSchema = z.object({ params: z.object({ id: uuid }) });
export const branchQuerySchema = z.object({ query: z.object({ branchId }).strict() });

const contactBody = z
  .object({
    slot: z.number().int().min(1).max(MAX_CONTACT_SLOTS),
    contactDate: dateString,
    contactPerson: optionalText(80),
    remarks: optionalText(500),
    doneById: uuid.optional().nullable(),
  })
  .strict();

export const followUpSchema = z.object({
  params: z.object({ id: uuid }),
  body: z
    .object({
      stage: z.enum(CSC_STAGES),
      contacts: z.array(contactBody).max(MAX_CONTACT_SLOTS),
      /** Book the vehicle in: creates a booking, or links the vehicle's active booking. */
      booking: z.object({ scheduledAt: z.string().datetime({ offset: true, message: 'Enter the booking date and time' }), notes: optionalText(500) }).strict().optional().nullable(),
      /** Close the stage (PARTIAL reason) or the case (FINAL reason). */
      closure: z.object({ reasonId: uuid, remarks: optionalText(500) }).strict().optional().nullable(),
    })
    .strict(),
});

export type SaveRulesBody = z.infer<typeof saveRulesSchema>['body'];
export type CreateReasonBody = z.infer<typeof createReasonSchema>['body'];
export type UpdateReasonBody = z.infer<typeof updateReasonSchema>['body'];
export type GenerateBody = z.infer<typeof generateSchema>['body'];
export type CaseListQuery = z.infer<typeof caseListSchema>['query'];
export type FollowUpBody = z.infer<typeof followUpSchema>['body'];
