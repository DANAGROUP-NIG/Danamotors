import { Prisma, type PsfStatus } from '@prisma/client';
import { statusLabel } from '../../psf/psf.logic';
import { accidentalSql, allPhonesSql, noPhoneSql, notContactedSql, plate, plateSql, psfEligibleSql, psfJoinSql } from '../../psf/psf.sql';
import { localDayRange } from '../core/dates';
import { capRows, MAX_REPORT_ROWS } from '../core/shape';
import { jobColumnsSql, jobFilterSql, jobFromSql } from '../core/sql';
import type { DimensionFilters, ReportDb, ReportRow, ReportScope } from '../core/types';
import { mailingAddress, type LetterJob, type PsfJobFact, type PsfLineFact } from './psf.logic';

export interface PsfPeriod {
  from: string;
  to: string;
  /** Every delivery date (from / to ignored). */
  allDates?: boolean;
  filters?: DimensionFilters;
}

/** Delivered jobs that are followed up (not cancelled, not PDI), filtered on the delivery date (local days). */
function baseWhere(scope: ReportScope, period: PsfPeriod): Prisma.Sql {
  const { start, end } = localDayRange(period.from, period.to, scope.timeZone);
  const range = period.allDates ? Prisma.empty : Prisma.sql` AND j."deliveredAt" >= ${start} AND j."deliveredAt" < ${end}`;
  return Prisma.sql`WHERE TRUE${psfEligibleSql}${range}${jobFilterSql(scope, period.filters ?? {}, { jobType: 'BOTH' })}`;
}

const nameSql = (alias: string) => Prisma.sql`NULLIF(TRIM(CONCAT(${Prisma.raw(`${alias}."firstName"`)}, ' ', ${Prisma.raw(`${alias}."lastName"`)})), '')`;

/** Columns every PSF list shows next to jobColumnsSql. */
const followColumnsSql = Prisma.sql`
  ${allPhonesSql} AS "customerPhones",
  f."status" AS "status",
  f."remark" AS "remark",
  COALESCE(f."callCount", 0)::int AS "callCount",
  f."lastCalledAt" AS "lastCalledAt",
  ${nameSql('fu')} AS "lastCalledBy"`;

const withStatusLabel = <Row extends ReportRow & { status?: PsfStatus | null }>(row: Row) => ({ ...row, id: String(row.jobId ?? row.id), statusLabel: row.status ? statusLabel(row.status) : 'Not followed up' });

/** Delivered jobs in the period with their model and current status (the analysis base). */
export async function loadJobFacts(db: ReportDb, scope: ReportScope, period: PsfPeriod): Promise<PsfJobFact[]> {
  return db.$queryRaw<PsfJobFact[]>(Prisma.sql`
    SELECT j."id" AS "jobId", COALESCE(mdl."description", v."model", v."customModel") AS "model", f."status"
    ${jobFromSql} ${psfJoinSql}
    ${baseWhere(scope, period)}`);
}

/** The lines of each job's last call (labour / service-wise satisfaction). */
export async function loadLastLines(db: ReportDb, scope: ReportScope, period: PsfPeriod): Promise<PsfLineFact[]> {
  return db.$queryRaw<PsfLineFact[]>(Prisma.sql`
    SELECT pl."kind", pl."code", pl."description", pl."status"
    ${jobFromSql} ${psfJoinSql}
    JOIN "PsfCallLine" pl ON pl."callId" = f."lastCallId"
    ${baseWhere(scope, period)}`);
}

export type NotContacted = 'INCLUDE' | 'EXCLUDE' | 'ONLY';

export interface FollowUpListOptions {
  basis: 'ALL' | 'MAJOR';
  flaggedOnly: boolean;
  includeAccidental: boolean;
  notContacted: NotContacted;
}

/**
 * Post-service follow-up list: one row per delivered job with the labour lines the basis selects.
 * 100% = every job (every labour line); major labour = jobs with a major labour line; "flagged only"
 * keeps labour marked for follow-up analysis (and jobs that have some).
 */
export async function loadFollowUpList(db: ReportDb, scope: ReportScope, period: PsfPeriod, options: FollowUpListOptions) {
  const labourCondition = Prisma.sql`${options.basis === 'MAJOR' ? Prisma.sql` AND li."majorLabour"` : Prisma.empty}${options.flaggedOnly ? Prisma.sql` AND li."followUpAnalysis"` : Prisma.empty}`;
  const limitsJobs = options.basis === 'MAJOR' || options.flaggedOnly;
  const labourFrom = Prisma.sql`FROM "JobCardLabour" l JOIN "LabourItem" li ON li."id" = l."labourItemId" WHERE l."jobCardId" = j."id"${labourCondition}`;
  const contacted = options.notContacted === 'ONLY' ? Prisma.sql` AND ${notContactedSql}` : options.notContacted === 'EXCLUDE' ? Prisma.sql` AND NOT ${notContactedSql}` : Prisma.empty;
  const rows = await db.$queryRaw<ReportRow[]>(Prisma.sql`
    SELECT ${jobColumnsSql}, ${followColumnsSql},
      c."preferredFollowupDay" AS "preferredDay", c."preferredFollowupTime" AS "preferredTime",
      ${accidentalSql} AS "accidental",
      COALESCE((SELECT json_agg(json_build_object('code', li."code", 'description', l."description", 'major', li."majorLabour") ORDER BY l."createdAt", l."id") ${labourFrom}), '[]'::json) AS "labour"
    ${jobFromSql} ${psfJoinSql}
    ${baseWhere(scope, period)}
      ${options.includeAccidental ? Prisma.empty : Prisma.sql` AND NOT ${accidentalSql}`}
      ${limitsJobs ? Prisma.sql` AND EXISTS (SELECT 1 ${labourFrom})` : Prisma.empty}
      ${contacted}
    ORDER BY j."deliveredAt", j."jobNumber"
    LIMIT ${MAX_REPORT_ROWS + 1}`);
  return capRows(rows.map(withStatusLabel));
}

/**
 * Jobs whose current status is DISSATISFIED (with the lines marked dissatisfied on the last call) or
 * CLOSED (with who closed it and the status before closing).
 */
export async function loadStatusList(db: ReportDb, scope: ReportScope, period: PsfPeriod, status: 'DISSATISFIED' | 'CLOSED') {
  const rows = await db.$queryRaw<ReportRow[]>(Prisma.sql`
    SELECT ${jobColumnsSql}, ${followColumnsSql},
      COALESCE((SELECT json_agg(json_build_object('code', pl."code", 'description', pl."description") ORDER BY pl."position")
        FROM "PsfCallLine" pl WHERE pl."callId" = f."lastCallId" AND pl."status" = 'DISSATISFIED'), '[]'::json) AS "dissatisfiedLines",
      f."closedAt", ${nameSql('cb')} AS "closedBy",
      (SELECT pc."status" FROM "PsfCall" pc WHERE pc."followUpId" = f."id" AND pc."id" <> f."lastCallId" ORDER BY pc."calledAt" DESC LIMIT 1) AS "previousStatus"
    ${jobFromSql} ${psfJoinSql}
    LEFT JOIN "User" cb ON cb."id" = f."closedById"
    ${baseWhere(scope, period)} AND f."status" = ${status}::"PsfStatus"
    ORDER BY j."deliveredAt", j."jobNumber"
    LIMIT ${MAX_REPORT_ROWS + 1}`);
  return capRows(
    rows.map((row) => {
      const previous = row.previousStatus as PsfStatus | null;
      return { ...withStatusLabel(row), previousStatusLabel: previous ? statusLabel(previous) : null };
    }),
  );
}

/**
 * Vehicle follow-up history: one row per call on each job of the vehicle delivered in the period (oldest
 * first), with the call's lines; a job never followed up gives one row without a call.
 */
export async function loadVehicleHistory(db: ReportDb, scope: ReportScope, period: PsfPeriod, registration: string) {
  const rows = await db.$queryRaw<ReportRow[]>(Prisma.sql`
    SELECT ${jobColumnsSql},
      f."status" AS "currentStatus", COALESCE(f."callCount", 0)::int AS "callCount",
      pc."id" AS "callId", pc."calledAt", pc."status" AS "callStatus", pc."remark" AS "remark", ${nameSql('cu')} AS "calledBy",
      pc."bookingAt", ap."bookingNumber",
      ROW_NUMBER() OVER (PARTITION BY j."id" ORDER BY pc."calledAt") AS "attempt",
      COALESCE((SELECT json_agg(json_build_object('code', pl."code", 'description', pl."description", 'kind', pl."kind", 'status', pl."status") ORDER BY pl."position")
        FROM "PsfCallLine" pl WHERE pl."callId" = pc."id"), '[]'::json) AS "lines"
    ${jobFromSql} ${psfJoinSql}
    LEFT JOIN "PsfCall" pc ON pc."followUpId" = f."id"
    LEFT JOIN "User" cu ON cu."id" = pc."calledById"
    LEFT JOIN "ServiceAppointment" ap ON ap."id" = pc."appointmentId"
    ${baseWhere(scope, period)} AND ${plateSql} = ${plate(registration)}
    ORDER BY j."deliveredAt", j."jobNumber", pc."calledAt"
    LIMIT ${MAX_REPORT_ROWS + 1}`);
  return capRows(
    rows.map((row): ReportRow => {
      const call = row.callStatus as PsfStatus | null;
      const lines = Array.isArray(row.lines) ? (row.lines as { status: PsfStatus }[]).map((line) => ({ ...line, statusLabel: statusLabel(line.status) })) : [];
      return {
        ...row,
        id: String(row.callId ?? row.jobId),
        attempt: row.callId ? Number(row.attempt) : null,
        callStatusLabel: call ? statusLabel(call) : 'Not followed up',
        lines,
      };
    }),
  );
}

interface LetterJobRow extends Omit<LetterJob, 'customerAddress'> {
  address: string | null;
  city: string | null;
  state: string | null;
}

/** Delivered jobs in the period that have a customer, with what the letter groups and the letter need. */
export async function loadLetterJobs(db: ReportDb, scope: ReportScope, period: PsfPeriod): Promise<LetterJob[]> {
  const rows = await db.$queryRaw<LetterJobRow[]>(Prisma.sql`
    SELECT j."id" AS "jobId", j."jobNumber", j."deliveredAt", v."registrationNumber" AS "registration",
      COALESCE(mdl."description", v."model", v."customModel") AS "model", COALESCE(st."description", 'Not set') AS "serviceType",
      f."status", c."id" AS "customerId",
      COALESCE(NULLIF(c."companyName", ''), TRIM(CONCAT(c."firstName", ' ', c."lastName"))) AS "customer",
      c."address", c."city", c."state", c."city" AS "customerCity", NOT ${noPhoneSql} AS "hasPhone",
      b."name" AS "branchName",
      NULLIF(CONCAT_WS(', ', NULLIF(b."address", ''), NULLIF(b."city", ''), NULLIF(b."state", '')), '') AS "branchAddress",
      b."phoneNumber" AS "branchPhone", b."email" AS "branchEmail"
    ${jobFromSql} ${psfJoinSql}
    ${baseWhere(scope, period)} AND c."id" IS NOT NULL
    ORDER BY j."deliveredAt", j."jobNumber"
    LIMIT ${MAX_REPORT_ROWS * 4}`);
  return rows.map(({ address, city, state, ...row }) => ({ ...row, customerAddress: mailingAddress({ address, city, state }) }));
}

/**
 * Customers of the branch (not vendors, not merged) for the mailing list, by name, optionally of one city.
 * Customers without a street address are counted, not listed.
 */
export async function loadMailingList(db: ReportDb, scope: ReportScope, city: string | null) {
  const branch = scope.branchIds ? Prisma.sql` AND c."branchId" IN (${Prisma.join(scope.branchIds)})` : Prisma.empty;
  const cityFilter = city ? Prisma.sql` AND LOWER(TRIM(c."city")) = LOWER(${city.trim()})` : Prisma.empty;
  const rows = await db.$queryRaw<{ id: string; code: string | null; customer: string; address: string | null; city: string | null; state: string | null; phone: string | null; branchName: string }[]>(Prisma.sql`
    SELECT c."id", c."code",
      COALESCE(NULLIF(c."companyName", ''), TRIM(CONCAT(c."salutation", ' ', c."firstName", ' ', c."lastName"))) AS "customer",
      c."address", c."city", c."state", NULLIF(c."phoneNumber", '') AS "phone", b."name" AS "branchName"
    FROM "Customer" c JOIN "Branch" b ON b."id" = c."branchId"
    WHERE c."mergedIntoId" IS NULL AND UPPER(COALESCE(c."type", '')) <> 'VENDOR'${branch}${cityFilter}
    ORDER BY 3, c."code"
    LIMIT ${MAX_REPORT_ROWS * 4}`);
  const listed = rows.flatMap((row) => {
    const address = mailingAddress(row);
    return address ? [{ ...row, customer: row.customer.trim(), customerAddress: address }] : [];
  });
  const { rows: capped, truncated } = capRows(listed);
  return { rows: capped, truncated, noAddress: rows.length - listed.length };
}

/** Distinct customer cities in the scope, for the mailing list's city dropdown. */
export async function loadCustomerCities(db: ReportDb, scope: ReportScope): Promise<string[]> {
  const branch = scope.branchIds ? Prisma.sql` AND c."branchId" IN (${Prisma.join(scope.branchIds)})` : Prisma.empty;
  const rows = await db.$queryRaw<{ city: string }[]>(Prisma.sql`
    SELECT MIN(TRIM(c."city")) AS "city" FROM "Customer" c
    WHERE c."mergedIntoId" IS NULL AND COALESCE(TRIM(c."city"), '') <> ''${branch}
    GROUP BY LOWER(TRIM(c."city")) ORDER BY 1`);
  return rows.map((row) => row.city);
}
