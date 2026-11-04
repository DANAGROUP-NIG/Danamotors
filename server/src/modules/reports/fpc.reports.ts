import { CampaignStatus, CampaignType, CampaignVehicleStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../../shared/constants/roles';
import { localDayRange } from './core/dates';
import { branchParam, dateString, idList, modeParam, rangeQuery } from './core/filters';
import { MAX_REPORT_ROWS } from './core/shape';
import { canonicalStatusSql, inFilter } from './core/sql';
import { defineReport, type ReportDb, type ReportGroup, type ReportScope } from './core/types';
import {
  addFpcFacts,
  emptyFpcCounts,
  FPC_SHOWS,
  fpcPercent,
  fpcRowsFor,
  fpcShowCounts,
  isCalled,
  mergeFpcCounts,
  NOT_ANSWERED,
  reasonsText,
  type FpcAnalysisCounts,
  type FpcVehicleFacts,
  type FpcVisit,
} from './fpc.logic';

/** "ALL" or one campaign type. FPC by default; a picked campaign overrides the type. */
const campaignTypeParam = z.union([z.nativeEnum(CampaignType), z.literal('ALL')]).default(CampaignType.FPC);

interface FpcFilters {
  model?: string[];
  variant?: string[];
  campaign?: string[];
  campaignType: string;
  /** Bulletin date range (local days), F2 only. */
  bulletinFrom?: string;
  bulletinTo?: string;
}

interface CampaignVehicleRow {
  campaignVehicleId: string;
  campaignId: string;
  bulletin: string;
  subject: string;
  measures: string | null;
  bulletinDate: Date | null;
  effectiveDate: Date;
  closeDate: Date | null;
  campaignStatus: CampaignStatus;
  status: CampaignVehicleStatus;
  vin: string;
  vehicleId: string | null;
  registration: string | null;
  modelId: string | null;
  model: string | null;
  variant: string | null;
  customer: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  branchName: string | null;
  branchAddress: string | null;
  branchPhone: string | null;
  branchEmail: string | null;
}

interface LoadedVehicle extends CampaignVehicleRow {
  facts: FpcVehicleFacts;
}

/**
 * Campaign vehicles in scope with their contacts and visits. Branch scope is the vehicle
 * owner's branch; VINs not registered yet (and vehicles without an owner branch) are in every
 * branch's scope, since they cannot belong to one.
 */
async function loadFpcVehicles(db: ReportDb, scope: ReportScope, filters: FpcFilters): Promise<{ vehicles: LoadedVehicle[]; truncated: boolean }> {
  const typeFilter =
    filters.campaign?.length || filters.campaignType === 'ALL' ? Prisma.empty : Prisma.sql` AND c."type"::text = ${filters.campaignType}`;
  const branchFilter = scope.branchIds ? Prisma.sql` AND (cu."branchId" IS NULL OR cu."branchId" IN (${Prisma.join(scope.branchIds)}))` : Prisma.empty;
  const bulletinDate =
    filters.bulletinFrom && filters.bulletinTo
      ? (() => {
          const { start, end } = localDayRange(filters.bulletinFrom, filters.bulletinTo, scope.timeZone);
          return Prisma.sql` AND c."bulletinDate" >= ${start} AND c."bulletinDate" < ${end}`;
        })()
      : Prisma.empty;

  const rows = await db.$queryRaw<CampaignVehicleRow[]>`
    SELECT cv."id" AS "campaignVehicleId", c."id" AS "campaignId", c."code" AS "bulletin", c."title" AS "subject",
      c."description" AS "measures", c."bulletinDate", c."startDate" AS "effectiveDate", c."endDate" AS "closeDate",
      c."status"::text AS "campaignStatus", cv."status"::text AS "status", cv."vin", cv."vehicleId",
      v."registrationNumber" AS "registration", mdl."id" AS "modelId",
      COALESCE(mdl."description", v."model", v."customModel") AS "model",
      COALESCE(var."description", v."trim") AS "variant",
      CASE WHEN cu."id" IS NULL THEN NULL
           ELSE COALESCE(NULLIF(cu."companyName", ''), TRIM(CONCAT(cu."firstName", ' ', cu."lastName"))) END AS "customer",
      NULLIF(CONCAT_WS(', ', NULLIF(cu."address", ''), NULLIF(cu."city", ''), NULLIF(cu."state", '')), '') AS "customerAddress",
      NULLIF(CONCAT_WS(' / ', NULLIF(cu."phoneNumber", ''), NULLIF(cu."mobile2", '')), '') AS "customerPhone",
      b."name" AS "branchName",
      NULLIF(CONCAT_WS(', ', NULLIF(b."address", ''), NULLIF(b."city", ''), NULLIF(b."state", '')), '') AS "branchAddress",
      b."phoneNumber" AS "branchPhone", b."email" AS "branchEmail"
    FROM "CampaignVehicle" cv
    JOIN "Campaign" c ON c."id" = cv."campaignId"
    LEFT JOIN "Vehicle" v ON v."id" = cv."vehicleId"
    LEFT JOIN "WorkshopMaster" var ON var."id" = v."catalogueId"
    LEFT JOIN "WorkshopMaster" mdl ON mdl."id" = var."parentId"
    LEFT JOIN "Customer" cu ON cu."id" = v."customerId"
    LEFT JOIN "Branch" b ON b."id" = cu."branchId"
    WHERE TRUE${typeFilter}${inFilter(Prisma.raw('c."id"'), filters.campaign)}${inFilter(Prisma.raw('mdl."id"'), filters.model)}${inFilter(
      Prisma.raw('var."id"'),
      filters.variant,
    )}${branchFilter}${bulletinDate}
    ORDER BY c."code", cv."vin"
    LIMIT ${MAX_REPORT_ROWS + 1}`;
  const truncated = rows.length > MAX_REPORT_ROWS;
  const base = truncated ? rows.slice(0, MAX_REPORT_ROWS) : rows;
  const campaignIds = [...new Set(base.map((row) => row.campaignId))];
  if (campaignIds.length === 0) return { vehicles: [], truncated };

  const [contacts, visits] = await Promise.all([
    db.$queryRaw<{ campaignVehicleId: string; createdAt: Date }[]>`
      SELECT l."campaignVehicleId", l."createdAt"
      FROM "CampaignContactLog" l
      JOIN "CampaignVehicle" cv ON cv."id" = l."campaignVehicleId"
      WHERE cv."campaignId" IN (${Prisma.join(campaignIds)})`,
    db.$queryRaw<(FpcVisit & { campaignId: string; vehicleId: string })[]>`
      SELECT jcc."campaignId", j."vehicleId", j."id" AS "jobId", j."jobNumber", j."createdAt" AS "jobDate", j."billedAt",
        jcc."attended", jcc."notAttendedReason"
      FROM "JobCardCampaign" jcc
      JOIN "JobCard" j ON j."id" = jcc."jobCardId"
      WHERE jcc."campaignId" IN (${Prisma.join(campaignIds)})
        AND j."vehicleId" IS NOT NULL
        AND ${canonicalStatusSql(Prisma.raw('j."status"'))} <> 'CANCELLED'
      ORDER BY j."createdAt"`,
  ]);

  const contactsBy = new Map<string, Date[]>();
  for (const contact of contacts) contactsBy.set(contact.campaignVehicleId, [...(contactsBy.get(contact.campaignVehicleId) ?? []), contact.createdAt]);
  const visitsBy = new Map<string, FpcVisit[]>();
  for (const { campaignId, vehicleId, ...visit } of visits) {
    const key = `${campaignId}:${vehicleId}`;
    visitsBy.set(key, [...(visitsBy.get(key) ?? []), visit]);
  }

  return {
    truncated,
    vehicles: base.map((row) => ({
      ...row,
      facts: {
        status: row.status,
        campaignActive: row.campaignStatus === CampaignStatus.ACTIVE,
        contactDates: contactsBy.get(row.campaignVehicleId) ?? [],
        visits: row.vehicleId ? visitsBy.get(`${row.campaignId}:${row.vehicleId}`) ?? [] : [],
      },
    })),
  };
}

const text = (value: string | null | undefined) => value ?? '';

/** Sort keys for each order; blanks (unregistered vehicles) go last. */
const ORDER_KEYS = {
  MODEL: ['model', 'variant', 'registration', 'vin'],
  VARIANT: ['variant', 'model', 'registration', 'vin'],
  REGISTRATION: ['registration', 'vin'],
  VIN: ['vin'],
} as const;
type FpcOrder = keyof typeof ORDER_KEYS;

export function compareFpcRows(order: FpcOrder) {
  return (a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const key of ORDER_KEYS[order]) {
      const x = text(a[key] as string | null);
      const y = text(b[key] as string | null);
      if (x === y) continue;
      if (!x) return 1;
      if (!y) return -1;
      return x.localeCompare(y, 'en', { numeric: true });
    }
    return 0;
  };
}

// ── F1. FPC vehicles ──────────────────────────────────────────────────────────

const vehiclesQuery = z
  .object({
    branchId: branchParam,
    mode: modeParam,
    model: idList,
    variant: idList,
    campaign: idList,
    campaignType: campaignTypeParam,
    show: z.enum(FPC_SHOWS).default('TO_BE_CALLED'),
    order: z.enum(['MODEL', 'VARIANT', 'REGISTRATION', 'VIN']).default('MODEL'),
  })
  .strict();

const fpcVehicles = defineReport<z.infer<typeof vehiclesQuery>>({
  slug: 'fpc-vehicles',
  title: 'FPC vehicles',
  width: 80,
  permission: PERMISSIONS.FPC_VEHICLES_READ,
  summary:
    'Vehicles under FPC bulletins (or other campaigns): to be called, called but not visited, visited but not attended, attended, attended but not called. Printed as a list, letters or address labels.',
  period: 'none',
  query: vehiclesQuery,
  filterKeys: ['model', 'variant', 'campaign'],
  params: [
    { name: 'campaignType', description: 'Campaign type when no campaign is picked: FPC (default), RECALL, FREE_FIX, SERVICE_CAMPAIGN or ALL.', schema: { type: 'string', default: 'FPC' } },
    { name: 'show', description: 'Which list: TO_BE_CALLED (default), CALLED_NOT_VISITED, VISITED_NOT_ATTENDED, ATTENDED, ATTENDED_NOT_CALLED.', schema: { type: 'string', enum: [...FPC_SHOWS] } },
    { name: 'order', description: 'MODEL (default), VARIANT, REGISTRATION or VIN.', schema: { type: 'string', enum: ['MODEL', 'VARIANT', 'REGISTRATION', 'VIN'] } },
  ],
  example: {
    rows: [
      {
        campaignVehicleId: 'cv-uuid',
        campaignId: 'campaign-uuid',
        bulletin: 'KC13-14-P010-XM',
        subject: 'Sorento (XM) fuel pump plate cover replacement',
        vin: 'KNAKU813DC5214595',
        registered: true,
        registration: 'LND-123-AB',
        model: 'Sorento',
        variant: '2.4 EX',
        customer: 'Chinedu Okafor',
        customerPhone: '08031234567',
        branchName: 'Kia Plaza',
        status: 'PENDING',
        called: false,
        jobNumber: null,
      },
    ],
    totals: { count: 1, registered: 1, notRegistered: 0 },
    summary: { TO_BE_CALLED: 1, CALLED_NOT_VISITED: 0, VISITED_NOT_ATTENDED: 0, ATTENDED: 0, ATTENDED_NOT_CALLED: 0 },
  },
  async run(db, scope, query) {
    const { vehicles, truncated } = await loadFpcVehicles(db, scope, query);
    const rows = vehicles
      .flatMap((vehicle) =>
        fpcRowsFor(query.show, vehicle.facts).map((visit) => ({
          campaignVehicleId: vehicle.campaignVehicleId,
          campaignId: vehicle.campaignId,
          bulletin: vehicle.bulletin,
          subject: vehicle.subject,
          measures: vehicle.measures,
          vin: vehicle.vin,
          vehicleId: vehicle.vehicleId,
          registered: vehicle.vehicleId !== null,
          registration: vehicle.registration,
          model: vehicle.model,
          variant: vehicle.variant,
          customer: vehicle.customer,
          customerAddress: vehicle.customerAddress,
          customerPhone: vehicle.customerPhone,
          branchName: vehicle.branchName,
          branchAddress: vehicle.branchAddress,
          branchPhone: vehicle.branchPhone,
          branchEmail: vehicle.branchEmail,
          status: vehicle.status,
          called: isCalled(vehicle.facts),
          contacts: vehicle.facts.contactDates.length,
          jobId: visit?.jobId ?? null,
          jobNumber: visit?.jobNumber ?? null,
          jobDate: visit?.jobDate ?? null,
          billDate: visit?.billedAt ?? null,
          attended: visit?.attended ?? null,
          notAttendedReason: visit && visit.attended !== true ? visit.notAttendedReason ?? NOT_ANSWERED : null,
        })),
      )
      .sort(compareFpcRows(query.order));
    const registered = rows.filter((row) => row.registered).length;
    return {
      rows,
      groups: [],
      totals: { count: rows.length, registered, notRegistered: rows.length - registered },
      summary: fpcShowCounts(vehicles.map((vehicle) => vehicle.facts)),
      truncated,
    };
  },
});

// ── F2. FPC analysis ──────────────────────────────────────────────────────────

const analysisQuery = rangeQuery(['model'], {
  campaignType: campaignTypeParam,
  bulletinFrom: dateString.optional(),
  bulletinTo: dateString.optional(),
  order: z.enum(['MODEL', 'BULLETIN_DATE']).default('MODEL'),
}).superRefine((value, ctx) => {
  const { bulletinFrom, bulletinTo } = value as { bulletinFrom?: string; bulletinTo?: string };
  if (Boolean(bulletinFrom) !== Boolean(bulletinTo))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bulletinTo'], message: 'Give both bulletin dates, or neither for all' });
  else if (bulletinFrom && bulletinTo && bulletinTo < bulletinFrom)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bulletinTo'], message: 'The last bulletin date must be on or after the first' });
});
type AnalysisQuery = z.infer<typeof analysisQuery>;

/** Count columns of an analysis row or total, with the percentages worked out from the counts. */
export function analysisColumns(counts: FpcAnalysisCounts) {
  return {
    affected: counts.affected,
    called: counts.called,
    visited: counts.visited,
    attended: counts.attended,
    notAttended: counts.notAttended,
    reasons: reasonsText(counts.reasons),
    attendedPctVisited: fpcPercent(counts.attended, counts.visited),
    attendedPctAffected: fpcPercent(counts.attendedToDate, counts.affected),
    outstanding: counts.outstanding,
  };
}

/** Totals keep numbers only (the framework's totals are numeric); null percentages are left out. */
function numericTotals(counts: FpcAnalysisCounts): Record<string, number> {
  return Object.fromEntries(Object.entries(analysisColumns(counts)).filter((entry): entry is [string, number] => typeof entry[1] === 'number'));
}

const fpcAnalysis = defineReport<AnalysisQuery>({
  slug: 'fpc-analysis',
  title: 'FPC analysis',
  width: 132,
  permission: PERMISSIONS.FPC_ANALYSIS_READ,
  summary:
    'Per FPC bulletin: vehicles affected, called, visited in the period (jobs billed in the bill date range), attended and not attended (by reason), attended % and still outstanding. Totals per model and a grand total.',
  period: 'range',
  query: analysisQuery,
  filterKeys: ['model'],
  params: [
    { name: 'campaignType', description: 'FPC (default), another campaign type, or ALL.', schema: { type: 'string', default: 'FPC' } },
    { name: 'bulletinFrom', description: 'First bulletin date (YYYY-MM-DD). Give both bulletin dates or neither (all).', schema: { type: 'string', format: 'date' } },
    { name: 'bulletinTo', description: 'Last bulletin date, inclusive.', schema: { type: 'string', format: 'date' } },
    { name: 'order', description: 'MODEL (default: one row per bulletin and model, totals per model) or BULLETIN_DATE.', schema: { type: 'string', enum: ['MODEL', 'BULLETIN_DATE'] } },
  ],
  example: {
    rows: [
      {
        groupKey: 'model-uuid',
        bulletin: 'KC13-14-P010-XM',
        bulletinDate: '2013-02-26T00:00:00.000Z',
        subject: 'Sorento (XM) fuel pump plate cover replacement',
        model: 'Sorento',
        affected: 3,
        called: 1,
        visited: 2,
        attended: 1,
        notAttended: 1,
        reasons: 'Parts not available 1',
        attendedPctVisited: 50,
        attendedPctAffected: 33.3,
        outstanding: 2,
      },
    ],
    groups: [{ key: 'model-uuid', label: 'Sorento', count: 1, totals: { affected: 3, visited: 2, attended: 1, attendedPctVisited: 50 } }],
    totals: { count: 1, affected: 3, called: 1, visited: 2, attended: 1, notAttended: 1, attendedPctVisited: 50, attendedPctAffected: 33.3, outstanding: 2 },
  },
  async run(db, scope, query) {
    const { vehicles, truncated } = await loadFpcVehicles(db, scope, query);
    const { start, end } = localDayRange(query.from, query.to, scope.timeZone);
    const inPeriod = (visit: FpcVisit) => visit.billedAt !== null && visit.billedAt >= start && visit.billedAt < end;
    const byModel = query.order === 'MODEL';

    // One bucket per bulletin, or per bulletin and model when ordered by model.
    const buckets = new Map<string, { vehicle: LoadedVehicle; counts: FpcAnalysisCounts }>();
    for (const vehicle of vehicles) {
      const key = byModel ? `${vehicle.modelId ?? ''}:${vehicle.campaignId}` : vehicle.campaignId;
      const bucket = buckets.get(key) ?? { vehicle, counts: emptyFpcCounts() };
      addFpcFacts(bucket.counts, vehicle.facts, inPeriod);
      buckets.set(key, bucket);
    }

    const modelLabel = (vehicle: LoadedVehicle) => vehicle.model ?? 'Not registered';
    const ordered = Array.from(buckets.values()).sort((a, b) => {
      if (byModel) {
        const model = modelLabel(a.vehicle).localeCompare(modelLabel(b.vehicle));
        if (model) return model;
      }
      const dateA = a.vehicle.bulletinDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const dateB = b.vehicle.bulletinDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return dateA - dateB || a.vehicle.bulletin.localeCompare(b.vehicle.bulletin);
    });

    const rows = ordered.map(({ vehicle, counts }) => ({
      groupKey: byModel ? vehicle.modelId ?? 'none' : '',
      campaignId: vehicle.campaignId,
      bulletin: vehicle.bulletin,
      bulletinDate: vehicle.bulletinDate,
      subject: vehicle.subject,
      effectiveDate: vehicle.effectiveDate,
      closeDate: vehicle.closeDate,
      model: byModel ? modelLabel(vehicle) : null,
      ...analysisColumns(counts),
    }));

    const groups: ReportGroup[] = [];
    if (byModel) {
      const perModel = new Map<string, { label: string; count: number; counts: FpcAnalysisCounts }>();
      for (const { vehicle, counts } of ordered) {
        const key = vehicle.modelId ?? 'none';
        const group = perModel.get(key) ?? { label: modelLabel(vehicle), count: 0, counts: emptyFpcCounts() };
        group.count += 1;
        mergeFpcCounts(group.counts, counts);
        perModel.set(key, group);
      }
      for (const [key, group] of perModel) groups.push({ key, label: group.label, count: group.count, totals: numericTotals(group.counts) });
    }

    const grand = ordered.reduce((all, bucket) => mergeFpcCounts(all, bucket.counts), emptyFpcCounts());
    return {
      rows,
      groups,
      totals: { count: rows.length, ...numericTotals(grand) },
      summary: { bulletins: new Set(rows.map((row) => row.campaignId)).size, reasons: reasonsText(grand.reasons) || null },
      truncated,
    };
  },
});

export const FPC_REPORTS = [fpcVehicles, fpcAnalysis];
