import { Prisma } from '@prisma/client';
import type { LateKind } from '../../late-delivery/late-delivery.logic';
import { daysLateSql, lateKindSql, lateReasonsJsonSql, minutesLateSql } from '../../late-delivery/late-delivery.sql';
import { localDayRange } from '../core/dates';
import { capRows, MAX_REPORT_ROWS } from '../core/shape';
import { jobColumnsSql, jobFilterSql, jobFromSql, type JobType } from '../core/sql';
import type { DimensionFilters, ReportDb, ReportScope } from '../core/types';
import { type DeliveredCount, type LateReportRow, type ReasonMaster } from './late.logic';

export interface LatePeriod {
  from: string;
  to: string;
  /** Every promised date (legacy "All" next to the dates). */
  allDates?: boolean;
  filters?: DimensionFilters;
  jobType?: JobType;
}

/**
 * Delivered jobs with a promise, filtered on the promised date (local days), plus the shared
 * dimension filters. Late status comes from the stored date-times, so re-runs give the same answer.
 */
function baseWhere(scope: ReportScope, period: LatePeriod): Prisma.Sql {
  const { start, end } = localDayRange(period.from, period.to, scope.timeZone);
  const range = period.allDates ? Prisma.empty : Prisma.sql` AND j."promisedAt" >= ${start} AND j."promisedAt" < ${end}`;
  return Prisma.sql`WHERE j."deliveredAt" IS NOT NULL AND j."promisedAt" IS NOT NULL${range}${jobFilterSql(scope, period.filters ?? {}, { jobType: period.jobType ?? 'BOTH' })}`;
}

/** Jobs delivered late (of one kind, or both when kind is null), oldest promise first. */
export async function loadLateRows(db: ReportDb, scope: ReportScope, period: LatePeriod, kind: LateKind | null): Promise<{ rows: LateReportRow[]; truncated: boolean }> {
  const lateKind = lateKindSql(scope.timeZone);
  const rows = await db.$queryRaw<LateReportRow[]>(Prisma.sql`
    SELECT ${jobColumnsSql},
      ${lateKind} AS "lateKind",
      ${daysLateSql(scope.timeZone)} AS "daysLate",
      ${minutesLateSql} AS "minutesLate",
      j."lateRemarks" AS "remarks",
      ${lateReasonsJsonSql} AS "reasons"
    ${jobFromSql}
    ${baseWhere(scope, period)}
      AND ${kind ? Prisma.sql`${lateKind} = ${kind}` : Prisma.sql`${lateKind} IS NOT NULL`}
    ORDER BY j."promisedAt", j."jobNumber"
    LIMIT ${MAX_REPORT_ROWS + 1}`);
  return capRows(rows.map((row) => ({ ...row, id: row.jobId })));
}

/** Delivered jobs with a promise in the period per model and service type (the late % base); labels as in jobColumnsSql. */
export async function countDelivered(db: ReportDb, scope: ReportScope, period: LatePeriod): Promise<DeliveredCount[]> {
  return db.$queryRaw<DeliveredCount[]>(Prisma.sql`
    SELECT COALESCE(mdl."description", v."model", v."customModel") AS "model",
      COALESCE(st."description", 'Not set') AS "serviceType",
      COUNT(*)::int AS "delivered"
    ${jobFromSql}
    ${baseWhere(scope, period)}
    GROUP BY 1, 2`);
}

/** Every late-delivery reason in legend order (inactive ones too: older jobs may use them). */
export async function loadLateReasons(db: ReportDb): Promise<ReasonMaster[]> {
  return db.workshopMaster.findMany({
    where: { kind: 'LATE_REASON' },
    orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
    select: { id: true, code: true, description: true, active: true },
  });
}
