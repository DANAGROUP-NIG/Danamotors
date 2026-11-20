import { Prisma } from '@prisma/client';

/** Local (time-zone) timestamp of a UTC timestamp column. */
const local = (column: string, timeZone: string) => Prisma.sql`((${Prisma.raw(column)} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})`;

/**
 * 'DATE', 'TIME' or NULL (on time) for job card j, from promisedAt and deliveredAt in the branch time
 * zone. Mirrors lateness() in late-delivery.logic.ts.
 */
export function lateKindSql(timeZone: string): Prisma.Sql {
  return Prisma.sql`(CASE
    WHEN ${local('j."deliveredAt"', timeZone)}::date > ${local('j."promisedAt"', timeZone)}::date THEN 'DATE'
    WHEN j."deliveredAt" > j."promisedAt" THEN 'TIME'
  END)`;
}

/** Calendar days late (local days). */
export function daysLateSql(timeZone: string): Prisma.Sql {
  return Prisma.sql`GREATEST(${local('j."deliveredAt"', timeZone)}::date - ${local('j."promisedAt"', timeZone)}::date, 0)`;
}

/** Whole minutes after the promised time, rounded up. */
export const minutesLateSql = Prisma.sql`GREATEST(CEIL(EXTRACT(EPOCH FROM (j."deliveredAt" - j."promisedAt")) / 60), 0)::int`;

/** Delivered jobs that have a promise: the base of every late-delivery figure. */
export const deliveredWithPromiseSql = Prisma.sql` AND j."deliveredAt" IS NOT NULL AND j."promisedAt" IS NOT NULL`;

/** Late reasons of job j as [{id, code, description}] in the order they were entered. */
export const lateReasonsJsonSql = Prisma.sql`COALESCE((
  SELECT json_agg(json_build_object('id', m."id", 'code', m."code", 'description', m."description") ORDER BY lr.position)
  FROM unnest(j."lateReasonIds") WITH ORDINALITY AS lr(id, position)
  JOIN "WorkshopMaster" m ON m."id" = lr.id
), '[]'::json)`;
