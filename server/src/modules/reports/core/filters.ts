import { z } from 'zod';
import { DATE_PATTERN, daysBetween, isValidDateString } from './dates';
import type { FilterKey } from './types';

export type { DimensionFilters } from './types';

export const MAX_RANGE_DAYS = 366;

export const dateString = z
  .string()
  .regex(DATE_PATTERN, 'Use the format YYYY-MM-DD')
  .refine(isValidDateString, 'Not a valid date');

/**
 * A multi-select filter. Omitted or empty = "All" (no filter). Accepts `?model=a,b` and
 * `?model=a&model=b`.
 */
export const idList = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const list = (Array.isArray(value) ? value : [value])
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? Array.from(new Set(list)) : undefined;
}, z.array(z.string().uuid('Each selected value must be an id')).max(500).optional());

export const flag = z.preprocess(
  (value) => value === true || value === 'true' || value === '1',
  z.boolean(),
);

export const branchParam = z.union([z.literal('ALL'), z.string().uuid()]).optional();
export const modeParam = z.enum(['both', 'summary', 'detail']).default('both');

const base = { branchId: branchParam, mode: modeParam };

function filterShape(keys: FilterKey[]) {
  return Object.fromEntries(keys.map((key) => [key, idList])) as Record<FilterKey, typeof idList>;
}

/** Query for a report over a from..to date range (both inclusive, at most 366 days). */
export function rangeQuery<S extends z.ZodRawShape>(keys: FilterKey[], extra: S) {
  return z
    .object({ ...base, from: dateString, to: dateString, ...filterShape(keys), ...extra })
    .strict()
    .superRefine((value, ctx) => {
      const { from, to } = value as { from: string; to: string };
      const span = daysBetween(from, to);
      if (span < 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'The end date must be on or after the start date' });
      else if (span + 1 > MAX_RANGE_DAYS)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: `The period cannot be longer than ${MAX_RANGE_DAYS} days` });
    });
}

/** Query for a report on one date ("as on", "for date"). */
export function dateQuery<S extends z.ZodRawShape>(keys: FilterKey[], extra: S) {
  return z.object({ ...base, date: dateString, ...filterShape(keys), ...extra }).strict();
}

