import { Prisma } from '@prisma/client';
import { isNotRepeatReason } from '../../repeat-job/repeat-job.logic';
import { localDayRange } from '../core/dates';
import { capRows, MAX_REPORT_ROWS } from '../core/shape';
import { inFilter, jobColumnsSql, jobFilterSql, jobFromSql, jobJoinsSql } from '../core/sql';
import type { DimensionFilters, ReportDb, ReportScope } from '../core/types';
import { NONE_KEY, type AnalyseBy, type JobCount, type RepeatReasonRef, type RepeatReportRow } from './repeat.logic';

/** Local calendar date of the job (YYYY-MM-DD). */
const localDaySql = (timeZone: string) => Prisma.sql`to_char((j."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;

/**
 * Staff filters on repeats apply to the previous job's people (a repeat counts against them);
 * model and variant filters apply to the vehicle.
 * TODO(confirm): the date-wise summary's advisor and engineer filters use the previous job's staff
 * for repeats and the job's own staff for jobs opened, as the analysis does.
 */
function repeatStaffSql(filters: DimensionFilters): Prisma.Sql {
  return Prisma.sql`${inFilter(Prisma.raw('r."previousServiceAdvisorId"'), filters.receivedBy)}${inFilter(Prisma.raw('r."previousEngineerId"'), filters.engineer)}`;
}

/** Repeat jobs opened from..to (cancelled and PDI jobs left out), every review status. */
export async function loadRepeatRows(
  db: ReportDb,
  scope: ReportScope,
  input: { from: string; to: string; filters?: DimensionFilters },
): Promise<{ rows: RepeatReportRow[]; truncated: boolean }> {
  const { start, end } = localDayRange(input.from, input.to, scope.timeZone);
  const filters = input.filters ?? {};
  const rows = await db.$queryRaw<RepeatReportRow[]>(Prisma.sql`
    SELECT ${jobColumnsSql},
      ${localDaySql(scope.timeZone)} AS "day",
      mdl."id" AS "modelId",
      var."id" AS "variantId",
      r."id" AS "repeatId",
      r."status"::text AS "reviewStatus",
      r."source"::text AS "source",
      r."daysDifference" AS "daysDifference",
      r."kmDifference" AS "kmDifference",
      r."windowDays" AS "windowDays",
      r."windowKm" AS "windowKm",
      r."remarks" AS "remarks",
      r."openingNote" AS "openingNote",
      r."reviewedAt" AS "reviewedAt",
      pj."id" AS "previousJobId",
      pj."jobNumber" AS "previousJobNumber",
      pj."createdAt" AS "previousJobDate",
      pj."mileage" AS "previousMileage",
      r."previousEngineerId" AS "previousEngineerId",
      NULLIF(TRIM(CONCAT(pe."firstName", ' ', pe."lastName")), '') AS "previousEngineer",
      r."previousServiceAdvisorId" AS "previousServiceAdvisorId",
      NULLIF(TRIM(CONCAT(psa."firstName", ' ', psa."lastName")), '') AS "previousServiceAdvisor",
      COALESCE((
        SELECT json_agg(json_build_object('id', m."id", 'code', m."code", 'description', m."description") ORDER BY rr."position")
        FROM "RepeatJobReason" rr JOIN "WorkshopMaster" m ON m."id" = rr."reasonId"
        WHERE rr."repeatJobId" = r."id"
      ), '[]'::json) AS "reasons"
    FROM "RepeatJob" r
    JOIN "JobCard" j ON j."id" = r."jobCardId"
    ${jobJoinsSql}
    JOIN "JobCard" pj ON pj."id" = r."previousJobId"
    LEFT JOIN "User" pe ON pe."id" = r."previousEngineerId"
    LEFT JOIN "User" psa ON psa."id" = r."previousServiceAdvisorId"
    WHERE j."createdAt" >= ${start} AND j."createdAt" < ${end}
      ${jobFilterSql(scope, { model: filters.model, variant: filters.variant })}
      ${repeatStaffSql(filters)}
    ORDER BY j."createdAt", j."jobNumber"
    LIMIT ${MAX_REPORT_ROWS + 1}`);
  return capRows(rows);
}

/** SQL key and label of the analysis groups, for jobs opened (the job's own people). */
const GROUP_SQL: Record<AnalyseBy, { key: Prisma.Sql; label: Prisma.Sql }> = {
  model: { key: Prisma.sql`mdl."id"`, label: Prisma.sql`COALESCE(mdl."description", NULLIF(v."model", ''), 'Model not set')` },
  variant: { key: Prisma.sql`var."id"`, label: Prisma.sql`COALESCE(var."description", NULLIF(v."trim", ''), 'Variant not set')` },
  serviceAdvisor: { key: Prisma.sql`j."serviceAdvisorId"`, label: Prisma.sql`COALESCE(NULLIF(TRIM(CONCAT(sa."firstName", ' ', sa."lastName")), ''), 'No service advisor')` },
  engineer: { key: Prisma.sql`j."engineerId"`, label: Prisma.sql`COALESCE(NULLIF(TRIM(CONCAT(en."firstName", ' ', en."lastName")), ''), 'No engineer')` },
};

/** Jobs opened from..to per analysis group (not cancelled, not PDI). */
export async function countJobsByGroup(db: ReportDb, scope: ReportScope, input: { from: string; to: string; by: AnalyseBy }): Promise<JobCount[]> {
  const { start, end } = localDayRange(input.from, input.to, scope.timeZone);
  const group = GROUP_SQL[input.by];
  const rows = await db.$queryRaw<{ key: string | null; label: string; jobs: number }[]>(Prisma.sql`
    SELECT ${group.key} AS "key", MIN(${group.label}) AS "label", COUNT(*)::int AS "jobs"
    ${jobFromSql}
    WHERE j."createdAt" >= ${start} AND j."createdAt" < ${end} ${jobFilterSql(scope, {})}
    GROUP BY ${group.key}`);
  return rows.map((row) => ({ key: row.key ?? NONE_KEY, label: row.label, jobs: row.jobs }));
}

/** Jobs opened per local date from..to, with the report's model, variant, advisor and engineer filters. */
export async function countJobsByDay(db: ReportDb, scope: ReportScope, input: { from: string; to: string; filters: DimensionFilters }): Promise<JobCount[]> {
  const { start, end } = localDayRange(input.from, input.to, scope.timeZone);
  const { model, variant, receivedBy, engineer } = input.filters;
  const rows = await db.$queryRaw<{ key: string; jobs: number }[]>(Prisma.sql`
    SELECT ${localDaySql(scope.timeZone)} AS "key", COUNT(*)::int AS "jobs"
    ${jobFromSql}
    WHERE j."createdAt" >= ${start} AND j."createdAt" < ${end} ${jobFilterSql(scope, { model, variant, receivedBy, engineer })}
    GROUP BY 1`);
  return rows.map((row) => ({ key: row.key, label: row.key, jobs: row.jobs }));
}

/** Reason codes that count as repeats (every "not a repeat" code left out), in legend order. */
export async function loadRepeatReasons(db: ReportDb): Promise<RepeatReasonRef[]> {
  const rows = await db.workshopMaster.findMany({
    where: { kind: 'REPEAT_REASON' },
    orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
    select: { id: true, code: true, description: true, attributes: true },
  });
  return rows.filter((row) => !isNotRepeatReason(row)).map(({ id, code, description }) => ({ id, code, description }));
}
