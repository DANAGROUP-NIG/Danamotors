import { Prisma } from '@prisma/client';
import type { ServiceCategory } from '../../workshop/master-kinds';
import { localDayRange } from '../core/dates';
import { activeInvoiceSql, jobFilterSql, jobJoinsSql, type JobType } from '../core/sql';
import type { DimensionFilters, ReportDb, ReportScope } from '../core/types';
import { categoryOf, splitDiscount, subtractMoney, sumMoney } from './mis.logic';

/** Aggregated MIS reports read every job in the period; beyond this the result is flagged truncated. */
export const MAX_MIS_JOBS = 100_000;

/** Which job date the period applies to. */
export type MisDateBasis = 'delivered' | 'billed' | 'created';

const BASIS_COLUMN: Record<MisDateBasis, Prisma.Sql> = {
  delivered: Prisma.raw('j."deliveredAt"'),
  billed: Prisma.raw('j."billedAt"'),
  created: Prisma.raw('j."createdAt"'),
};

/**
 * One job with its MIS category and its work value. The value covers every charge type
 * (customer, warranty, goodwill, free), because job bills hold only the customer-paid lines and
 * free services would otherwise show no labour or parts. Discounts come from the active bill.
 */
export interface MisJob {
  jobId: string;
  jobNumber: string;
  jobDate: Date;
  branchId: string;
  branchName: string;
  promisedAt: Date | null;
  billedAt: Date | null;
  deliveredAt: Date | null;
  registration: string | null;
  vin: string | null;
  customer: string | null;
  modelId: string | null;
  model: string | null;
  variantId: string | null;
  variant: string | null;
  serviceTypeId: string | null;
  serviceTypeCode: string | null;
  serviceType: string;
  category: ServiceCategory;
  engineerId: string | null;
  engineer: string | null;
  bayId: string | null;
  bay: string | null;
  mileage: number | null;
  isRepeat: boolean;
  /** Under warranty when the job was opened (#79 M8). */
  warranty: boolean;
  labourGross: number;
  labourDiscount: number;
  labourNet: number;
  /** Standard hours where recorded, otherwise charged hours. */
  labourHours: number;
  /** Labour in the body repair service group (memo; included in labour). */
  bodyLabour: number;
  /** Spare parts including accessories, before discount. */
  spares: number;
  /** Accessories (part type A), included in spares. */
  accessories: number;
  oil: number;
  sparesDiscount: number;
  oilDiscount: number;
  serviceCharge: number;
  /** Labour net + spares and oil net of discount + service charge. */
  netValue: number;
}

interface MisJobRow extends Omit<MisJob, 'category' | 'labourNet' | 'sparesDiscount' | 'oilDiscount' | 'netValue'> {
  category: string | null;
  preDelivery: boolean | null;
  freeService: boolean | null;
  partsDiscount: number;
}

export interface MisJobQuery {
  from: string;
  to: string;
  basis: MisDateBasis;
  filters?: DimensionFilters;
  jobType?: JobType;
}

/** Jobs in scope whose basis date falls in the local days from..to, with their values. */
export async function loadMisJobs(db: ReportDb, scope: ReportScope, query: MisJobQuery): Promise<{ jobs: MisJob[]; truncated: boolean }> {
  const { start, end } = localDayRange(query.from, query.to, scope.timeZone);
  const basis = BASIS_COLUMN[query.basis];
  const rows = await db.$queryRaw<MisJobRow[]>`
    WITH jobs AS (
      SELECT j."id"
      FROM "JobCard" j
      ${jobJoinsSql}
      WHERE ${basis} >= ${start} AND ${basis} < ${end}${jobFilterSql(scope, query.filters ?? {}, { jobType: query.jobType ?? 'REGULAR' })}
      LIMIT ${MAX_MIS_JOBS + 1}
    ),
    labour AS (
      SELECT l."jobCardId",
        SUM(l."amount")::numeric AS gross,
        SUM(COALESCE(l."standardHours", l."hours"))::numeric AS hours,
        SUM(CASE WHEN COALESCE((sg."attributes"->>'bodyRepair')::boolean, false) THEN l."amount" ELSE 0 END)::numeric AS body
      FROM "JobCardLabour" l
      JOIN jobs ON jobs."id" = l."jobCardId"
      JOIN "LabourItem" li ON li."id" = l."labourItemId"
      LEFT JOIN "WorkshopMaster" sg ON sg."id" = li."serviceGroupId"
      GROUP BY l."jobCardId"
    ),
    part_values AS (
      -- Requisitioned parts: the charge lines, already net of returns.
      SELECT jl."jobCardId", jl."sparePartId", jl."amount"::numeric AS amount
      FROM "JobCardLine" jl
      JOIN jobs ON jobs."id" = jl."jobCardId"
      JOIN "PartRequisitionLine" rl ON rl."id" = jl."requisitionLineId"
      JOIN "PartRequisition" r ON r."id" = rl."requisitionId"
      WHERE jl."kind" = 'PART' AND jl."quantity" > 0 AND r."status" = 'ISSUED'
      UNION ALL
      -- Parts issued directly: net of returns that were not rejected, at the retail rate (as the job bill prices them).
      SELECT pi."jobCardId", pi."sparePartId",
        (pi."quantity" - COALESCE(ret.quantity, 0))::numeric * COALESCE(sp."retailRate", 0)::numeric AS amount
      FROM "PartIssuance" pi
      JOIN jobs ON jobs."id" = pi."jobCardId"
      JOIN "SparePart" sp ON sp."id" = pi."sparePartId"
      LEFT JOIN LATERAL (
        SELECT SUM(pr."quantity") AS quantity FROM "PartReturn" pr
        WHERE pr."partIssuanceId" = pi."id" AND UPPER(pr."status") NOT IN ('REJECTED', 'CANCELLED')
      ) ret ON true
      WHERE NOT EXISTS (SELECT 1 FROM "PartRequisitionLine" prl WHERE prl."partIssuanceId" = pi."id")
    ),
    parts AS (
      SELECT pv."jobCardId",
        SUM(CASE WHEN sp."partType" = 'O' THEN 0 ELSE pv.amount END) AS spares,
        SUM(CASE WHEN sp."partType" = 'A' THEN pv.amount ELSE 0 END) AS accessories,
        SUM(CASE WHEN sp."partType" = 'O' THEN pv.amount ELSE 0 END) AS oil
      FROM part_values pv
      JOIN "SparePart" sp ON sp."id" = pv."sparePartId"
      GROUP BY pv."jobCardId"
    ),
    bills AS (
      SELECT i."jobCardId", SUM(i."labourDiscountAmount")::numeric AS "labourDiscount", SUM(i."partsDiscountAmount")::numeric AS "partsDiscount"
      FROM "Invoice" i
      JOIN jobs ON jobs."id" = i."jobCardId"
      WHERE ${activeInvoiceSql}
      GROUP BY i."jobCardId"
    )
    SELECT j."id" AS "jobId", j."jobNumber", j."createdAt" AS "jobDate", j."branchId", b."name" AS "branchName",
      j."promisedAt", j."billedAt", j."deliveredAt",
      v."registrationNumber" AS "registration", v."vin",
      CASE WHEN c."id" IS NULL THEN NULL
           ELSE COALESCE(NULLIF(c."companyName", ''), TRIM(CONCAT(c."firstName", ' ', c."lastName"))) END AS "customer",
      mdl."id" AS "modelId", COALESCE(mdl."description", v."model", v."customModel") AS "model",
      var."id" AS "variantId", COALESCE(var."description", v."trim") AS "variant",
      j."serviceTypeId", st."code" AS "serviceTypeCode", COALESCE(st."description", 'Not set') AS "serviceType",
      st."category", st."preDelivery", st."freeService",
      j."engineerId", NULLIF(TRIM(CONCAT(en."firstName", ' ', en."lastName")), '') AS "engineer",
      j."bayId", bay."description" AS "bay",
      j."mileage", j."isRepeat", (j."warrantyStatusAtCreation" = 'ACTIVE') AS "warranty",
      ROUND(COALESCE(lb.gross, 0), 2)::float8 AS "labourGross",
      ROUND(COALESCE(bl."labourDiscount", 0), 2)::float8 AS "labourDiscount",
      ROUND(COALESCE(lb.hours, 0), 2)::float8 AS "labourHours",
      ROUND(COALESCE(lb.body, 0), 2)::float8 AS "bodyLabour",
      ROUND(COALESCE(pt.spares, 0), 2)::float8 AS "spares",
      ROUND(COALESCE(pt.accessories, 0), 2)::float8 AS "accessories",
      ROUND(COALESCE(pt.oil, 0), 2)::float8 AS "oil",
      ROUND(COALESCE(bl."partsDiscount", 0), 2)::float8 AS "partsDiscount",
      ROUND(COALESCE(j."serviceCharge", 0)::numeric, 2)::float8 AS "serviceCharge"
    FROM jobs
    JOIN "JobCard" j ON j."id" = jobs."id"
    ${jobJoinsSql}
    LEFT JOIN "WorkshopMaster" bay ON bay."id" = j."bayId"
    LEFT JOIN labour lb ON lb."jobCardId" = j."id"
    LEFT JOIN parts pt ON pt."jobCardId" = j."id"
    LEFT JOIN bills bl ON bl."jobCardId" = j."id"
    ORDER BY ${basis}, j."jobNumber"`;

  const truncated = rows.length > MAX_MIS_JOBS;
  const jobs = (truncated ? rows.slice(0, MAX_MIS_JOBS) : rows).map(toMisJob);
  return { jobs, truncated };
}

export function toMisJob(row: MisJobRow): MisJob {
  const { category, preDelivery, freeService, partsDiscount, ...rest } = row;
  const [sparesDiscount, oilDiscount] = splitDiscount(partsDiscount, rest.spares, rest.oil);
  const labourNet = subtractMoney(rest.labourGross, rest.labourDiscount);
  const partsNet = subtractMoney(sumMoney([rest.spares, rest.oil]), partsDiscount);
  return {
    ...rest,
    category: categoryOf(category, Boolean(preDelivery), Boolean(freeService)),
    labourNet,
    sparesDiscount,
    oilDiscount,
    netValue: sumMoney([labourNet, partsNet, rest.serviceCharge]),
  };
}
