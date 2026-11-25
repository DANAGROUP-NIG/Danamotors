import { z } from 'zod';
import { DATE_PATTERN } from '../reports/core/dates';
import { MAX_PSF_REMARK, PSF_STATUS_VALUES } from './psf.logic';

const uuid = z.string().uuid();
const day = z.string().regex(DATE_PATTERN, 'Use the format YYYY-MM-DD');
const status = z.enum(PSF_STATUS_VALUES);

/** Worklist tabs: to call (never followed up, or not reached), dissatisfied, satisfied, closed, all. */
export const PSF_STATES = ['toCall', 'dissatisfied', 'satisfied', 'closed', 'all'] as const;
export type PsfState = (typeof PSF_STATES)[number];

export const psfListSchema = z.object({
  query: z
    .object({
      branchId: uuid.optional(),
      /** Delivery date range (Lagos days); both optional. */
      dateFrom: day.optional(),
      dateTo: day.optional(),
      search: z.string().trim().max(50).optional(),
      state: z.enum(PSF_STATES).default('toCall'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    })
    .strict(),
});

/** Find one delivered job by job number or registration (legacy Job No. dropdown / Find). */
export const psfFindSchema = z.object({
  query: z
    .object({
      q: z.string().trim().min(1, 'Enter a job number or registration').max(50),
      branchId: uuid.optional(),
    })
    .strict(),
});

export const psfDetailSchema = z.object({ params: z.object({ jobCardId: uuid }) });

/** One call: the status, a status per line (when the customer was reached), a remark and an optional booking. */
export const psfCallSchema = z.object({
  params: z.object({ jobCardId: uuid }),
  body: z
    .object({
      status,
      remark: z.string().trim().max(MAX_PSF_REMARK, `The remark can be at most ${MAX_PSF_REMARK} characters`).nullable().optional(),
      lines: z
        .array(z.object({ key: z.string().min(1).max(64), status }).strict())
        .max(200)
        .optional(),
      /** Book the vehicle in: creates a booking, or links the vehicle's active booking. */
      booking: z
        .object({
          scheduledAt: z.string().datetime({ offset: true, message: 'Enter the booking date and time' }),
          serviceTypeId: uuid.nullable().optional(),
          notes: z.string().trim().max(500).nullable().optional(),
        })
        .strict()
        .nullable()
        .optional(),
    })
    .strict(),
});

export type PsfListQuery = z.infer<typeof psfListSchema>['query'];
export type PsfFindQuery = z.infer<typeof psfFindSchema>['query'];
export type PsfCallBody = z.infer<typeof psfCallSchema>['body'];
