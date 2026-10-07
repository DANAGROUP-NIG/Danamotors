import { Prisma } from '@prisma/client';
import type { DimensionFilters, ReportScope } from './types';

export type { DimensionFilters } from './types';

/**
 * Legacy status text → canonical status. Mirrors canonicalJobStatus() in
 * service/job-card-workflow.service.ts; a unit test keeps the two in step.
 */
export const JOB_STATUS_ALIASES: Readonly<Record<string, string>> = {
  Open: 'OPEN',
  Pending: 'OPEN',
  'In Progress': 'IN_PROGRESS',
  'On Hold': 'IN_PROGRESS',
  'Quality Check': 'QC',
  Ready: 'READY',
  Completed: 'READY',
  Billed: 'BILLED',
  Closed: 'DELIVERED',
  Cancelled: 'CANCELLED',
};

/** SQL expression giving the canonical status of a status column. */
export function canonicalStatusSql(column: Prisma.Sql): Prisma.Sql {
  const branches = Object.entries(JOB_STATUS_ALIASES).map(([from, to]) => Prisma.sql`WHEN ${from} THEN ${to}`);
  return Prisma.sql`(CASE ${column} ${Prisma.join(branches, ' ')} ELSE ${column} END)`;
}

/** `AND column IN (...)`, or nothing when the filter is "All". */
export function inFilter(column: Prisma.Sql, ids: string[] | undefined): Prisma.Sql {
  return ids?.length ? Prisma.sql` AND ${column} IN (${Prisma.join(ids)})` : Prisma.empty;
}

export function branchFilter(column: Prisma.Sql, scope: ReportScope): Prisma.Sql {
  return inFilter(column, scope.branchIds ?? undefined);
}

/** Column references used by jobFromSql(); raw because identifiers cannot be bound. */
export const J = {
  id: Prisma.raw('j."id"'),
  status: Prisma.raw('j."status"'),
  branchId: Prisma.raw('j."branchId"'),
  createdAt: Prisma.raw('j."createdAt"'),
  promisedAt: Prisma.raw('j."promisedAt"'),
  serviceTypeId: Prisma.raw('j."serviceTypeId"'),
  teamId: Prisma.raw('j."teamId"'),
  serviceAdvisorId: Prisma.raw('j."serviceAdvisorId"'),
  deliveryAdvisorId: Prisma.raw('j."deliveryAdvisorId"'),
  modelId: Prisma.raw('mdl."id"'),
  variantId: Prisma.raw('v."catalogueId"'),
};

/**
 * Job card with the dimensions every workshop report shows. Aliases: j job card, b branch,
 * v vehicle, var/mdl variant and model masters, c customer, st service type, tm team,
 * sa service advisor (received by), da delivery advisor (delivered by).
 */
export const jobFromSql = Prisma.sql`
  FROM "JobCard" j
  JOIN "Branch" b ON b."id" = j."branchId"
  LEFT JOIN "Vehicle" v ON v."id" = j."vehicleId"
  LEFT JOIN "WorkshopMaster" var ON var."id" = v."catalogueId"
  LEFT JOIN "WorkshopMaster" mdl ON mdl."id" = var."parentId"
  LEFT JOIN "Customer" c ON c."id" = COALESCE(j."customerId", v."customerId")
  LEFT JOIN "WorkshopMaster" st ON st."id" = j."serviceTypeId"
  LEFT JOIN "WorkshopMaster" tm ON tm."id" = j."teamId"
  LEFT JOIN "User" sa ON sa."id" = j."serviceAdvisorId"
  LEFT JOIN "User" da ON da."id" = j."deliveryAdvisorId"`;

/** Display columns from jobFromSql(), selected by most workshop reports. */
export const jobColumnsSql = Prisma.sql`
  j."id" AS "jobId",
  j."jobNumber" AS "jobNumber",
  j."createdAt" AS "jobDate",
  b."name" AS "branchName",
  v."registrationNumber" AS "registration",
  v."vin" AS "vin",
  COALESCE(mdl."description", v."model", v."customModel") AS "model",
  COALESCE(var."description", v."trim") AS "variant",
  CASE WHEN c."id" IS NULL THEN NULL
       ELSE COALESCE(NULLIF(c."companyName", ''), TRIM(CONCAT(c."firstName", ' ', c."lastName"))) END AS "customer",
  NULLIF(CONCAT_WS(', ', NULLIF(c."address", ''), NULLIF(c."city", ''), NULLIF(c."state", '')), '') AS "customerAddress",
  NULLIF(CONCAT_WS(' / ', NULLIF(c."phoneNumber", ''), NULLIF(c."mobile2", ''), NULLIF(c."residencePhone", '')), '') AS "customerPhone",
  j."serviceTypeId" AS "serviceTypeId",
  st."code" AS "serviceTypeCode",
  COALESCE(st."description", 'Not set') AS "serviceType",
  j."mileage" AS "mileage",
  NULLIF(TRIM(CONCAT(sa."firstName", ' ', sa."lastName")), '') AS "receivedBy",
  NULLIF(TRIM(CONCAT(da."firstName", ' ', da."lastName")), '') AS "deliveredBy",
  tm."description" AS "team",
  ${canonicalStatusSql(J.status)} AS "status",
  j."promisedAt" AS "promisedAt",
  j."readyAt" AS "readyAt",
  j."billedAt" AS "billedAt",
  j."deliveredAt" AS "deliveredAt"`;

export interface JobFilterOptions {
  /** PDI jobs appear only in the PDI bill register. */
  includePdi?: boolean;
  includeCancelled?: boolean;
}

/** WHERE conditions (each starting with AND) for the shared dimension filters on jobFromSql(). */
export function jobFilterSql(scope: ReportScope, filters: DimensionFilters, options: JobFilterOptions = {}): Prisma.Sql {
  const technician = filters.technician?.length
    ? Prisma.sql` AND EXISTS (
        SELECT 1 FROM "JobCardLabour" fl
        WHERE fl."jobCardId" = j."id" AND fl."technicianId" IN (${Prisma.join(filters.technician)}))`
    : Prisma.empty;
  const complaint = filters.complaint?.length
    ? Prisma.sql` AND EXISTS (SELECT 1 FROM "JobComplaint" fc WHERE fc."jobCardId" = j."id" AND fc."complaintCodeId" IN (${Prisma.join(filters.complaint)}))`
    : Prisma.empty;
  const labourOperation = filters.labourOperation?.length
    ? Prisma.sql` AND EXISTS (SELECT 1 FROM "JobCardLabour" fo WHERE fo."jobCardId" = j."id" AND fo."labourItemId" IN (${Prisma.join(filters.labourOperation)}))`
    : Prisma.empty;

  return Prisma.sql`${branchFilter(J.branchId, scope)}${inFilter(J.modelId, filters.model)}${inFilter(J.variantId, filters.variant)}${inFilter(
    J.serviceTypeId,
    filters.serviceType,
  )}${inFilter(J.teamId, filters.team)}${inFilter(J.serviceAdvisorId, filters.receivedBy)}${inFilter(
    J.deliveryAdvisorId,
    filters.deliveredBy,
  )}${technician}${complaint}${labourOperation}${
    options.includeCancelled ? Prisma.empty : Prisma.sql` AND ${canonicalStatusSql(J.status)} <> 'CANCELLED'`
  }${options.includePdi ? Prisma.empty : notPdiSql}`;
}

/** Excludes PDI jobs, identified by the PDI category on their service type. */
export const notPdiSql = Prisma.sql` AND UPPER(COALESCE(st."category", '')) <> 'PDI'`;

/** Bills that count in reports: not cancelled. */
export const activeInvoiceSql = Prisma.sql`i."cancelledAt" IS NULL AND LOWER(i."status") NOT IN ('cancelled', 'canceled', 'void')`;

/** Round a numeric SQL expression to 2dp and return it as a JS number. */
export function moneySql(expression: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`ROUND((${expression})::numeric, 2)::float8`;
}
