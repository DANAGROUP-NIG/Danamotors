import { Prisma } from '@prisma/client';
import { capRows, MAX_REPORT_ROWS } from '../core/shape';
import { branchFilter, inFilter } from '../core/sql';
import type { DimensionFilters, ReportDb, ReportScope } from '../core/types';
import type { CloseReasonRef, CscReportRow } from './csc.logic';

const fullNameSql = (alias: string) => Prisma.raw(`NULLIF(TRIM(CONCAT(${alias}."firstName", ' ', ${alias}."lastName")), '')`);

/**
 * CSC cases due from..to (due date, both inclusive) with the vehicle, customer, last visit, visit,
 * booking, closure and every contact line. `where` adds report-specific conditions on alias c.
 */
export async function loadCscRows(
  db: ReportDb,
  scope: ReportScope,
  input: { from: string; to: string; filters?: DimensionFilters; where?: Prisma.Sql },
): Promise<{ rows: CscReportRow[]; truncated: boolean }> {
  const filters = input.filters ?? {};
  const rows = await db.$queryRaw<CscReportRow[]>(Prisma.sql`
    SELECT
      c."id" AS "caseId",
      c."id" AS "id",
      c."status"::text AS "status",
      to_char(c."dueDate", 'YYYY-MM-DD') AS "dueDate",
      to_char(c."dueDate", 'YYYY-MM') AS "dueMonth",
      c."dueMileage" AS "dueMileage",
      to_char(c."followUp1Date", 'YYYY-MM-DD') AS "followUp1Date",
      to_char(c."followUp2Date", 'YYYY-MM-DD') AS "followUp2Date",
      c."matchDaysAfter" AS "matchDaysAfter",
      b."name" AS "branchName",
      v."id" AS "vehicleId",
      v."registrationNumber" AS "registration",
      v."vin" AS "vin",
      mdl."id" AS "modelId",
      COALESCE(mdl."description", v."model") AS "model",
      COALESCE(var."description", v."trim") AS "variant",
      st."id" AS "serviceTypeId",
      st."code" AS "serviceCode",
      st."description" AS "serviceDescription",
      cu."id" AS "customerId",
      COALESCE(NULLIF(TRIM(cu."companyName"), ''), ${fullNameSql('cu')}) AS "customerName",
      COALESCE(cu."phoneNumber", cu."mobile2") AS "phone",
      lj."id" AS "lastJobId",
      lj."jobNumber" AS "lastJobNumber",
      lj."createdAt" AS "lastJobDate",
      lj."mileage" AS "lastMileage",
      vj."id" AS "visitJobId",
      vj."jobNumber" AS "visitJobNumber",
      vj."createdAt" AS "visitDate",
      ap."bookingNumber" AS "bookingNumber",
      ap."scheduledAt" AS "bookedFor",
      cr."id" AS "closeReasonId",
      cr."code" AS "closeReasonCode",
      cr."description" AS "closeReason",
      c."closeRemarks" AS "closeRemarks",
      c."closedAt" AS "closedAt",
      COALESCE((
        SELECT json_agg(json_build_object(
          'stage', x."stage", 'slot', x."slot", 'date', to_char(x."contactDate", 'YYYY-MM-DD'),
          'person', x."contactPerson", 'remarks', x."remarks", 'doneBy', ${fullNameSql('u')}
        ) ORDER BY x."stage", x."slot")
        FROM "CscContact" x LEFT JOIN "User" u ON u."id" = x."doneById"
        WHERE x."caseId" = c."id"
      ), '[]'::json) AS "contacts",
      COALESCE((
        SELECT json_agg(json_build_object('stage', y."stage", 'code', r."code", 'type', r."closureType", 'remarks', y."remarks") ORDER BY y."stage")
        FROM "CscStageClosure" y JOIN "CscCloseReason" r ON r."id" = y."reasonId"
        WHERE y."caseId" = c."id"
      ), '[]'::json) AS "stageClosures"
    FROM "CscCase" c
    JOIN "Branch" b ON b."id" = c."branchId"
    JOIN "Vehicle" v ON v."id" = c."vehicleId"
    LEFT JOIN "WorkshopMaster" var ON var."id" = v."catalogueId"
    LEFT JOIN "WorkshopMaster" mdl ON mdl."id" = var."parentId"
    JOIN "WorkshopMaster" st ON st."id" = c."serviceTypeId"
    LEFT JOIN "Customer" cu ON cu."id" = c."customerId"
    LEFT JOIN "JobCard" lj ON lj."id" = c."lastVisitJobCardId"
    LEFT JOIN "JobCard" vj ON vj."id" = c."visitJobCardId"
    LEFT JOIN "ServiceAppointment" ap ON ap."id" = c."bookingId"
    LEFT JOIN "CscCloseReason" cr ON cr."id" = c."closeReasonId"
    WHERE c."dueDate" BETWEEN ${input.from}::date AND ${input.to}::date
      ${branchFilter(Prisma.raw('c."branchId"'), scope)}
      ${inFilter(Prisma.raw('mdl."id"'), filters.model)}
      ${inFilter(Prisma.raw('c."serviceTypeId"'), filters.serviceType)}
      ${input.where ?? Prisma.empty}
    ORDER BY c."dueDate" ASC, v."registrationNumber" ASC NULLS LAST, c."id" ASC
    LIMIT ${MAX_REPORT_ROWS + 1}`);
  return capRows(rows);
}

export async function loadCloseReasons(db: ReportDb): Promise<CloseReasonRef[]> {
  return db.cscCloseReason.findMany({ select: { id: true, code: true, description: true }, orderBy: { code: 'asc' } });
}
