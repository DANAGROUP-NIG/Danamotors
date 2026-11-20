import { z } from 'zod';
import { DATE_PATTERN } from '../reports/core/dates';
import { MAX_REPEAT_REASONS } from './repeat-job.logic';

const uuid = z.string().uuid();
const day = z.string().regex(DATE_PATTERN, 'Use the format YYYY-MM-DD');

export const REPEAT_STATUS_FILTERS = ['PENDING_REVIEW', 'CONFIRMED', 'NOT_REPEAT', 'ALL'] as const;

export const repeatListSchema = z.object({
  query: z
    .object({
      branchId: uuid.optional(),
      status: z.enum(REPEAT_STATUS_FILTERS).default('PENDING_REVIEW'),
      source: z.enum(['AUTOMATIC', 'MANUAL']).optional(),
      search: z.string().trim().max(50).optional(),
      dateFrom: day.optional(),
      dateTo: day.optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    })
    .strict(),
});

export const repeatIdSchema = z.object({ params: z.object({ id: uuid }) });
export const repeatByJobSchema = z.object({ params: z.object({ jobCardId: uuid }) });

/** Mirrors the review form: one to five distinct reasons, remarks required (rules re-checked against the master). */
export const repeatReviewSchema = z.object({
  params: z.object({ id: uuid }),
  body: z
    .object({
      reasonIds: z
        .array(uuid)
        .min(1, 'Choose at least one reason')
        .max(MAX_REPEAT_REASONS, `Choose at most ${MAX_REPEAT_REASONS} reasons`)
        .refine((ids) => new Set(ids).size === ids.length, 'A reason can be chosen only once'),
      remarks: z.string().trim().min(1, 'Enter remarks for the reasons given').max(2000),
    })
    .strict(),
});

export const repeatPreviewSchema = z.object({
  params: z.object({ id: uuid }),
  query: z
    .object({
      branchId: uuid.optional(),
      mileage: z.coerce.number().int().nonnegative().optional(),
    })
    .strict(),
});

export type RepeatListQuery = z.infer<typeof repeatListSchema>['query'];
export type RepeatReviewBody = z.infer<typeof repeatReviewSchema>['body'];
