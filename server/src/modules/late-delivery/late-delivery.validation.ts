import { z } from 'zod';
import { DATE_PATTERN } from '../reports/core/dates';
import { MAX_LATE_REASONS, MAX_LATE_REMARKS } from './late-delivery.logic';

const uuid = z.string().uuid();
const day = z.string().regex(DATE_PATTERN, 'Use the format YYYY-MM-DD');
const kind = z.enum(['DATE', 'TIME']);

export const lateListSchema = z.object({
  query: z
    .object({
      kind,
      branchId: uuid.optional(),
      /** Promised date range (local days); both optional. */
      dateFrom: day.optional(),
      dateTo: day.optional(),
      search: z.string().trim().max(50).optional(),
      /** missing: no reason recorded yet; recorded: at least one; all (default). */
      reasons: z.enum(['all', 'missing', 'recorded']).default('all'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    })
    .strict(),
});

/** Find one late job by its job number or the vehicle's registration (legacy Find). */
export const lateFindSchema = z.object({
  query: z
    .object({
      kind,
      q: z.string().trim().min(1, 'Enter a job number or registration').max(50),
      branchId: uuid.optional(),
    })
    .strict(),
});

export const lateDetailSchema = z.object({
  params: z.object({ jobCardId: uuid }),
  query: z.object({ kind }).strict(),
});

/** Mirrors the entry form: one to six distinct reasons and an optional remark (re-checked against the master). */
export const lateSaveSchema = z.object({
  params: z.object({ jobCardId: uuid }),
  body: z
    .object({
      kind,
      reasonIds: z
        .array(uuid)
        .min(1, 'Select at least one reason')
        .max(MAX_LATE_REASONS, `Select at most ${MAX_LATE_REASONS} reasons`)
        .refine((ids) => new Set(ids).size === ids.length, 'A reason can be selected only once'),
      remarks: z.string().trim().max(MAX_LATE_REMARKS).nullable().optional(),
    })
    .strict(),
});

export type LateListQuery = z.infer<typeof lateListSchema>['query'];
export type LateFindQuery = z.infer<typeof lateFindSchema>['query'];
export type LateSaveBody = z.infer<typeof lateSaveSchema>['body'];
