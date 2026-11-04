import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../../../shared/constants/roles';
import { localDateOf, localDayRange, localToday, startOfLocalDay } from '../core/dates';
import { branchParam, dateQuery, flag, modeParam, rangeQuery } from '../core/filters';
import { capRows, countBy, groupRows, MAX_REPORT_ROWS } from '../core/shape';
import { canonicalStatusSql, inFilter, jobColumnsSql, jobJoinsSql, notPdiSql } from '../core/sql';
import { defineReport, type ReportRow, type ReportScope } from '../core/types';
import { MAX_MIS_JOBS } from './mis.data';
import {
  averageKmBetween,
  countedVisits,
  dayMonthKey,
  dayMonthOf,
  dayMonthPosition,
  inDayMonthRange,
  isValidDayMonth,
  percentOf,
  skippedFreeServices,
  type FreeServiceRule,
} from './mis.logic';

const customerNameSql = (alias: string) =>
  Prisma.raw(`CASE WHEN ${alias}."id" IS NULL THEN NULL ELSE COALESCE(NULLIF(${alias}."companyName", ''), TRIM(CONCAT(${alias}."firstName", ' ', ${alias}."lastName"))) END`);
const addressSql = (alias: string) => Prisma.raw(`NULLIF(CONCAT_WS(', ', NULLIF(${alias}."address", ''), NULLIF(${alias}."city", ''), NULLIF(${alias}."state", '')), '')`);
const phoneSql = (alias: string) => Prisma.raw(`NULLIF(CONCAT_WS(' / ', NULLIF(${alias}."phoneNumber", ''), NULLIF(${alias}."mobile2", '')), '')`);

/** Branch scope on alias.branchId (a customer's or a job's). With allowNone, rows without one (stock vehicles) are in every branch's scope. */
function branchScopeSql(alias: string, scope: ReportScope, allowNone = false): Prisma.Sql {
  if (!scope.branchIds) return Prisma.empty;
  const column = Prisma.raw(`${alias}."branchId"`);
  return allowNone ? Prisma.sql` AND (${column} IS NULL OR ${column} IN (${Prisma.join(scope.branchIds)}))` : Prisma.sql` AND ${column} IN (${Prisma.join(scope.branchIds)})`;
}

const orderParam = z.enum(['MODEL', 'VARIANT', 'SALE_DATE']).default('MODEL');
const orderDoc = { name: 'order', description: 'MODEL (default), VARIANT or SALE_DATE.', schema: { type: 'string', enum: ['MODEL', 'VARIANT', 'SALE_DATE'] } };

// ── S9. List of new customers ────────────────────────────────────────────────

const newCustomers = defineReport({
  slug: 'new-customers',
  title: 'List of new customers',
  width: 80,
  permission: PERMISSIONS.NEW_CUSTOMERS_READ,
  summary: "Customers whose first ever job card (at any branch, not PDI, not cancelled) was opened in the period; the branch is that first job's branch.",
  period: 'range',
  query: rangeQuery(['model'], {}),
  filterKeys: ['model'],
  example: {
    rows: [{ groupKey: 'model-uuid', customer: 'Example customer', customerAddress: '1 Example road, Abuja', customerPhone: '08000000000', email: null, registration: 'ABJ503GD', model: 'Rio', variant: 'Rio 1.4 EX', saleDate: '2025-11-02T00:00:00.000Z', jobNumber: 'JC-000123', jobDate: '2026-03-02T09:00:00.000Z', serviceType: 'FIRST SERVICE' }],
    groups: [{ key: 'model-uuid', label: 'Rio', count: 1, totals: {} }],
    totals: { count: 1 },
  },
  async run(db, scope, query) {
    const { start, end } = localDayRange(query.from, query.to, scope.timeZone);
    const customer = Prisma.sql`COALESCE(j."customerId", v."customerId")`;
    const counted = Prisma.sql`${canonicalStatusSql(Prisma.raw('j."status"'))} <> 'CANCELLED'${notPdiSql}`;
    const result = await db.$queryRaw<ReportRow[]>`
      WITH candidates AS (
        SELECT DISTINCT ${customer} AS "customerId"
        FROM "JobCard" j
        LEFT JOIN "Vehicle" v ON v."id" = j."vehicleId"
        LEFT JOIN "WorkshopMaster" st ON st."id" = j."serviceTypeId"
        WHERE j."createdAt" >= ${start} AND j."createdAt" < ${end} AND ${customer} IS NOT NULL AND ${counted}
      ),
      first_jobs AS (
        SELECT DISTINCT ON (${customer}) j."id"
        FROM "JobCard" j
        LEFT JOIN "Vehicle" v ON v."id" = j."vehicleId"
        LEFT JOIN "WorkshopMaster" st ON st."id" = j."serviceTypeId"
        JOIN candidates ca ON ca."customerId" = ${customer}
        WHERE ${counted}
        ORDER BY ${customer}, j."createdAt", j."id"
      )
      SELECT ${jobColumnsSql}, c."email", v."saleDate", mdl."id" AS "modelId"
      FROM first_jobs f
      JOIN "JobCard" j ON j."id" = f."id"
      ${jobJoinsSql}
      WHERE j."createdAt" >= ${start} AND j."createdAt" < ${end}${branchScopeSql('j', scope)}${inFilter(Prisma.raw('mdl."id"'), query.model)}
      ORDER BY COALESCE(mdl."description", v."model", '~'), j."createdAt"
      LIMIT ${MAX_REPORT_ROWS + 1}`;
    const { rows, truncated } = capRows(result);
    const grouped = groupRows(rows, { key: (row) => String(row.modelId ?? 'none'), label: (row) => String(row.model ?? 'Model not recorded') }, []);
    return {
      rows: grouped.rows,
      groups: grouped.groups,
      totals: { count: rows.length },
      breakdown: grouped.groups.map((group) => ({ key: group.key, label: group.label, count: group.count })),
      truncated,
    };
  },
});

// ── S10. List of regular customers ───────────────────────────────────────────

interface VisitRow {
  vehicleId: string;
  registration: string | null;
  model: string | null;
  customer: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  jobDate: Date;
  mileage: number | null;
}

const regularCustomers = defineReport({
  slug: 'regular-customers',
  title: 'List of regular customers',
  width: 80,
  permission: PERMISSIONS.REGULAR_CUSTOMERS_READ,
  summary:
    'Vehicles with at least the minimum number of counted visits since the date. A visit counts when its mileage is at least the mileage difference above the previous counted visit, so comebacks within a few km count once.',
  period: 'date',
  query: dateQuery([], {
    fromRegistration: z.string().trim().min(1).max(30).optional(),
    toRegistration: z.string().trim().min(1).max(30).optional(),
    mileageDiff: z.coerce.number().int().min(0).max(1_000_000).default(0),
    minVisits: z.coerce.number().int().min(1).max(100).default(2),
  }),
  filterKeys: [],
  params: [
    { name: 'fromRegistration', description: 'First registration number (inclusive, case-insensitive).', schema: { type: 'string' } },
    { name: 'toRegistration', description: 'Last registration number (inclusive).', schema: { type: 'string' } },
    { name: 'mileageDiff', description: 'Km above the last counted visit for a visit to count (default 0).', schema: { type: 'integer', minimum: 0 } },
    { name: 'minVisits', description: 'Counted visits needed (default 2).', schema: { type: 'integer', minimum: 1, maximum: 100 } },
  ],
  example: {
    rows: [{ vehicleId: 'uuid', registration: 'ABJ503GD', model: 'Rio', customer: 'Example customer', customerPhone: '08000000000', visits: 4, allVisits: 5, firstVisit: '2026-01-10', firstMileage: 10200, lastVisit: '2026-09-02', lastMileage: 31800, averageKm: 7200 }],
    groups: [],
    totals: { count: 1, visits: 4 },
  },
  async run(db, scope, query) {
    const start = startOfLocalDay(query.date, scope.timeZone);
    const registration = Prisma.sql`UPPER(v."registrationNumber")`;
    const range = Prisma.sql`${query.fromRegistration ? Prisma.sql` AND ${registration} >= UPPER(${query.fromRegistration})` : Prisma.empty}${
      query.toRegistration ? Prisma.sql` AND ${registration} <= UPPER(${query.toRegistration})` : Prisma.empty
    }`;
    const visits = await db.$queryRaw<VisitRow[]>`
      SELECT v."id" AS "vehicleId", v."registrationNumber" AS "registration", COALESCE(mdl."description", v."model", v."customModel") AS "model",
        ${customerNameSql('c')} AS "customer", ${addressSql('c')} AS "customerAddress", ${phoneSql('c')} AS "customerPhone",
        j."createdAt" AS "jobDate", j."mileage"
      FROM "JobCard" j
      ${jobJoinsSql}
      WHERE j."createdAt" >= ${start} AND j."vehicleId" IS NOT NULL
        AND ${canonicalStatusSql(Prisma.raw('j."status"'))} <> 'CANCELLED'${notPdiSql}${branchScopeSql('j', scope)}${range}
      ORDER BY v."registrationNumber", j."createdAt"
      LIMIT ${MAX_MIS_JOBS + 1}`;
    const truncated = visits.length > MAX_MIS_JOBS;
    const byVehicle = new Map<string, VisitRow[]>();
    for (const visit of visits.slice(0, MAX_MIS_JOBS)) byVehicle.set(visit.vehicleId, [...(byVehicle.get(visit.vehicleId) ?? []), visit]);

    const rows: ReportRow[] = [];
    for (const list of byVehicle.values()) {
      const counted = countedVisits(
        list.map((visit) => ({ date: localDateOf(visit.jobDate, scope.timeZone), mileage: visit.mileage })),
        query.mileageDiff,
      );
      if (counted.length < query.minVisits) continue;
      const latest = list[list.length - 1];
      rows.push({
        vehicleId: latest.vehicleId,
        registration: latest.registration,
        model: latest.model,
        customer: latest.customer,
        customerAddress: latest.customerAddress,
        customerPhone: latest.customerPhone,
        visits: counted.length,
        allVisits: list.length,
        firstVisit: counted[0].date,
        firstMileage: counted[0].mileage,
        lastVisit: counted[counted.length - 1].date,
        lastMileage: counted[counted.length - 1].mileage,
        averageKm: averageKmBetween(counted),
      });
    }
    rows.sort((a, b) => Number(b.visits) - Number(a.visits) || String(a.registration ?? '').localeCompare(String(b.registration ?? '')));
    return { rows, groups: [], totals: { count: rows.length, visits: rows.reduce((total, row) => total + Number(row.visits), 0) }, truncated };
  },
});

// ── S11. Birthday / anniversary report ───────────────────────────────────────

const dayOf = z.coerce.number().int().min(1).max(31);
const monthOf = z.coerce.number().int().min(1).max(12);

const birthdayQuery = z
  .object({
    branchId: branchParam,
    mode: modeParam,
    fromDay: dayOf.default(1),
    fromMonth: monthOf.default(1),
    toDay: dayOf.default(31),
    toMonth: monthOf.default(12),
    show: z.enum(['BIRTHDAY', 'ANNIVERSARY', 'BOTH']).default('BIRTHDAY'),
    order: z.enum(['DATE', 'NAME']).default('DATE'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!isValidDayMonth(value.fromMonth, value.fromDay)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fromDay'], message: 'Not a valid day of that month' });
    if (!isValidDayMonth(value.toMonth, value.toDay)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toDay'], message: 'Not a valid day of that month' });
  });

interface OccasionCustomer {
  customerId: string;
  customer: string;
  customerPhone: string | null;
  email: string | null;
  customerAddress: string | null;
  registration: string | null;
  birthday: string | null;
  anniversary: string | null;
}

const birthdayAnniversary = defineReport({
  slug: 'birthday-anniversary',
  title: 'Birthday / anniversary report',
  width: 80,
  permission: PERMISSIONS.BIRTHDAY_ANNIVERSARY_READ,
  summary:
    "Customers whose birthday or anniversary falls between two days of the year (any year; a range such as 01 Dec to 31 Jan wraps over the year end), with the registration of their latest vehicle and how many customers have no date recorded.",
  period: 'none',
  query: birthdayQuery,
  filterKeys: [],
  params: [
    { name: 'fromDay', description: 'First day (1–31), default 1.', schema: { type: 'integer' } },
    { name: 'fromMonth', description: 'First month (1–12), default 1.', schema: { type: 'integer' } },
    { name: 'toDay', description: 'Last day (1–31), default 31.', schema: { type: 'integer' } },
    { name: 'toMonth', description: 'Last month (1–12), default 12.', schema: { type: 'integer' } },
    { name: 'show', description: 'BIRTHDAY (default), ANNIVERSARY or BOTH.', schema: { type: 'string', enum: ['BIRTHDAY', 'ANNIVERSARY', 'BOTH'] } },
    { name: 'order', description: 'DATE (default, from the first day of the range) or NAME.', schema: { type: 'string', enum: ['DATE', 'NAME'] } },
  ],
  example: {
    rows: [{ customerId: 'uuid', occasion: 'BIRTHDAY', dayMonth: '12-05', date: '1988-05-12', customer: 'Example customer', customerPhone: '08000000000', email: null, registration: 'ABJ503GD' }],
    groups: [],
    totals: { count: 1 },
    summary: { customers: 24417, withoutBirthday: 24350, withoutAnniversary: 24363 },
  },
  async run(db, scope, query) {
    const branch = branchScopeSql('c', scope);
    const [customers, counts] = await Promise.all([
      db.$queryRaw<OccasionCustomer[]>`
        SELECT c."id" AS "customerId", ${customerNameSql('c')} AS "customer", ${phoneSql('c')} AS "customerPhone", c."email",
          ${addressSql('c')} AS "customerAddress",
          (SELECT v."registrationNumber" FROM "Vehicle" v WHERE v."customerId" = c."id" ORDER BY v."createdAt" DESC LIMIT 1) AS "registration",
          to_char((c."dateOfBirth" AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timeZone}, 'YYYY-MM-DD') AS "birthday",
          to_char(c."anniversaryOn", 'YYYY-MM-DD') AS "anniversary"
        FROM "Customer" c
        WHERE c."mergedIntoId" IS NULL AND (c."dateOfBirth" IS NOT NULL OR c."anniversaryOn" IS NOT NULL)${branch}`,
      db.$queryRaw<{ customers: number; withoutBirthday: number; withoutAnniversary: number }[]>`
        SELECT COUNT(*)::int AS "customers",
          COUNT(*) FILTER (WHERE c."dateOfBirth" IS NULL)::int AS "withoutBirthday",
          COUNT(*) FILTER (WHERE c."anniversaryOn" IS NULL)::int AS "withoutAnniversary"
        FROM "Customer" c
        WHERE c."mergedIntoId" IS NULL${branch}`,
    ]);

    const from = dayMonthKey(query.fromMonth, query.fromDay);
    const to = dayMonthKey(query.toMonth, query.toDay);
    const occasions = query.show === 'BOTH' ? (['BIRTHDAY', 'ANNIVERSARY'] as const) : ([query.show] as const);
    const rows: ReportRow[] = [];
    for (const customer of customers) {
      for (const occasion of occasions) {
        const date = occasion === 'BIRTHDAY' ? customer.birthday : customer.anniversary;
        if (!date) continue;
        const key = dayMonthOf(date);
        if (!inDayMonthRange(key, from, to)) continue;
        const { birthday: _birthday, anniversary: _anniversary, ...rest } = customer;
        rows.push({ ...rest, occasion, date, dayMonth: date.slice(5), position: dayMonthPosition(key, from) });
      }
    }
    rows.sort((a, b) =>
      query.order === 'NAME'
        ? String(a.customer).localeCompare(String(b.customer)) || Number(a.position) - Number(b.position)
        : Number(a.position) - Number(b.position) || String(a.customer).localeCompare(String(b.customer)),
    );
    const count = counts[0] ?? { customers: 0, withoutBirthday: 0, withoutAnniversary: 0 };
    return {
      rows,
      groups: [],
      totals: { count: rows.length },
      summary: { ...count, birthdays: rows.filter((row) => row.occasion === 'BIRTHDAY').length, anniversaries: rows.filter((row) => row.occasion === 'ANNIVERSARY').length },
    };
  },
});

// ── S12. Vehicle resale history ──────────────────────────────────────────────

const vehicleResale = defineReport({
  slug: 'vehicle-resale',
  title: 'Vehicle resale history',
  width: 80,
  permission: PERMISSIONS.VEHICLE_RESALE_READ,
  summary: "Owner changes in the period: every ownership record after a vehicle's first, dated by its purchase date, with the previous and new owner. Branch scope is the new owner's branch.",
  period: 'range',
  query: rangeQuery([], { registration: z.string().trim().min(1).max(30).optional() }),
  filterKeys: [],
  params: [{ name: 'registration', description: 'One vehicle by registration number or VIN (exact, case-insensitive). Omitted = all vehicles.', schema: { type: 'string' } }],
  example: {
    rows: [{ ownershipId: 'uuid', vehicleId: 'uuid', registration: 'ABJ503GD', vin: 'KNADN512AB6123456', engineNumber: 'G4FA123456', model: 'Rio', variant: 'Rio 1.4 EX', resaleDate: '2026-04-01T00:00:00.000Z', previousOwner: 'First owner', newOwner: 'Second owner', customerType: 'INDIVIDUAL', recordedBy: 'Example user' }],
    groups: [],
    totals: { count: 1 },
  },
  async run(db, scope, query) {
    const { start, end } = localDayRange(query.from, query.to, scope.timeZone);
    const vehicle = query.registration
      ? Prisma.sql` AND (UPPER(v."registrationNumber") = UPPER(${query.registration}) OR UPPER(v."vin") = UPPER(${query.registration}))`
      : Prisma.empty;
    const result = await db.$queryRaw<ReportRow[]>`
      WITH ranked AS (
        SELECT o.*,
          ROW_NUMBER() OVER (PARTITION BY o."vehicleId" ORDER BY o."purchaseDate", o."createdAt") AS "position",
          LAG(o."customerId") OVER (PARTITION BY o."vehicleId" ORDER BY o."purchaseDate", o."createdAt") AS "previousCustomerId"
        FROM "VehicleOwnership" o
        WHERE o."vehicleId" IN (SELECT "vehicleId" FROM "VehicleOwnership" WHERE "purchaseDate" >= ${start} AND "purchaseDate" < ${end})
      )
      SELECT r."id" AS "ownershipId", v."id" AS "vehicleId", v."registrationNumber" AS "registration", v."vin", v."engineNumber",
        COALESCE(mdl."description", v."model", v."customModel") AS "model", COALESCE(var."description", v."trim") AS "variant",
        r."purchaseDate" AS "resaleDate", ${customerNameSql('pc')} AS "previousOwner", ${customerNameSql('nc')} AS "newOwner",
        nc."type" AS "customerType", NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), '') AS "recordedBy"
      FROM ranked r
      JOIN "Vehicle" v ON v."id" = r."vehicleId"
      LEFT JOIN "WorkshopMaster" var ON var."id" = v."catalogueId"
      LEFT JOIN "WorkshopMaster" mdl ON mdl."id" = var."parentId"
      JOIN "Customer" nc ON nc."id" = r."customerId"
      LEFT JOIN "Customer" pc ON pc."id" = r."previousCustomerId"
      LEFT JOIN "User" u ON u."id" = r."createdById"
      WHERE r."position" > 1 AND r."purchaseDate" >= ${start} AND r."purchaseDate" < ${end}${branchScopeSql('nc', scope)}${vehicle}
      ORDER BY v."registrationNumber" NULLS LAST, r."purchaseDate"
      LIMIT ${MAX_REPORT_ROWS + 1}`;
    const { rows, truncated } = capRows(result);
    return { rows, groups: [], totals: { count: rows.length }, summary: { vehicles: new Set(rows.map((row) => row.vehicleId)).size }, truncated };
  },
});

// ── S13. Vehicles that skipped free service ──────────────────────────────────

interface SoldVehicle extends ReportRow {
  vehicleId: string;
  registration: string | null;
  vin: string;
  modelId: string | null;
  model: string | null;
  variantId: string | null;
  variant: string | null;
  saleDate: Date;
  sellingDealer: string | null;
  customer: string | null;
  customerPhone: string | null;
  mileage: number | null;
  lastVisit: Date | null;
  lastMileage: number | null;
}

const skippedFreeService = defineReport({
  slug: 'skipped-free-service',
  title: 'Vehicles that skipped free service',
  width: 80,
  permission: PERMISSIONS.SKIPPED_FREE_SERVICE_READ,
  summary:
    'Vehicles sold in the period with a free service not done although its due limit (days from the sale date, or km) has passed by today; a free service with no limit counts as skipped once a later free service has been done. Summary: vehicles sold and skipped per free service by model (or variant).',
  period: 'range',
  query: rangeQuery(['model', 'variant', 'freeService'], { order: orderParam }),
  filterKeys: ['model', 'variant', 'freeService'],
  params: [orderDoc],
  example: {
    rows: [
      { groupKey: 'model-uuid', vehicleId: 'uuid', registration: 'ABJ503GD', vin: 'KNADN512AB6123456', model: 'Rio', variant: 'Rio 1.4 EX', saleDate: '2026-01-05T00:00:00.000Z', customer: 'Example customer', serviceSkipped: '1F · FIRST SERVICE', dueBy: '2026-02-04', dueKm: 1000, reason: 'DAYS', 'skipped:st-uuid': 1 },
    ],
    groups: [{ key: 'model-uuid', label: 'Rio', count: 1, totals: { sold: 12, 'skipped:st-uuid': 1, 'pct:st-uuid': 8.33 } }],
    columns: [{ key: 'skipped:st-uuid', label: '1F skipped', format: 'integer' }, { key: 'pct:st-uuid', label: '1F %', format: 'percent' }],
    totals: { count: 1, sold: 12 },
  },
  async run(db, scope, query) {
    const { start, end } = localDayRange(query.from, query.to, scope.timeZone);
    const today = localToday(scope.timeZone);
    const [types, vehicles] = await Promise.all([
      db.workshopMaster.findMany({
        where: { kind: 'SERVICE_TYPE', category: 'FREE', OR: [{ active: true }, ...(query.freeService?.length ? [{ id: { in: query.freeService } }] : [])] },
        select: { id: true, code: true, description: true, serviceTypeSettings: { select: { modelId: true, daysLimit: true, mileageLimit: true } } },
        orderBy: [{ displayOrder: { sort: 'asc', nulls: 'last' } }, { code: 'asc' }],
      }),
      db.$queryRaw<SoldVehicle[]>`
        SELECT v."id" AS "vehicleId", v."registrationNumber" AS "registration", v."vin", mdl."id" AS "modelId",
          COALESCE(mdl."description", v."model", v."customModel") AS "model", var."id" AS "variantId", COALESCE(var."description", v."trim") AS "variant",
          v."saleDate", v."sellingDealer", ${customerNameSql('c')} AS "customer", ${phoneSql('c')} AS "customerPhone",
          GREATEST(v."lastRecordedMileage", lv."mileage") AS "mileage", lv."createdAt" AS "lastVisit", lv."mileage" AS "lastMileage"
        FROM "Vehicle" v
        LEFT JOIN "WorkshopMaster" var ON var."id" = v."catalogueId"
        LEFT JOIN "WorkshopMaster" mdl ON mdl."id" = var."parentId"
        LEFT JOIN "Customer" c ON c."id" = v."customerId"
        LEFT JOIN LATERAL (
          SELECT j."createdAt", j."mileage" FROM "JobCard" j
          WHERE j."vehicleId" = v."id" AND ${canonicalStatusSql(Prisma.raw('j."status"'))} <> 'CANCELLED'
          ORDER BY j."createdAt" DESC LIMIT 1
        ) lv ON true
        WHERE v."saleDate" >= ${start} AND v."saleDate" < ${end}${branchScopeSql('c', scope)}${inFilter(Prisma.raw('mdl."id"'), query.model)}${inFilter(
          Prisma.raw('var."id"'),
          query.variant,
        )}
        ORDER BY v."saleDate", v."registrationNumber"
        LIMIT ${MAX_MIS_JOBS + 1}`,
    ]);
    const truncated = vehicles.length > MAX_MIS_JOBS;
    const sold = vehicles.slice(0, MAX_MIS_JOBS);
    const typeIds = types.map((type) => type.id);
    const done =
      sold.length && typeIds.length
        ? await db.$queryRaw<{ vehicleId: string; serviceTypeId: string }[]>`
            SELECT DISTINCT j."vehicleId", j."serviceTypeId" FROM "JobCard" j
            WHERE j."vehicleId" IN (${Prisma.join(sold.map((vehicle) => vehicle.vehicleId))}) AND j."serviceTypeId" IN (${Prisma.join(typeIds)})
              AND ${canonicalStatusSql(Prisma.raw('j."status"'))} <> 'CANCELLED'`
        : [];
    const doneBy = new Map<string, Set<string>>();
    for (const row of done) doneBy.set(row.vehicleId, (doneBy.get(row.vehicleId) ?? new Set()).add(row.serviceTypeId));

    const selected = new Set(query.freeService?.length ? query.freeService : typeIds);
    const shown = types.filter((type) => selected.has(type.id));
    const rulesFor = (modelId: string | null): FreeServiceRule[] =>
      types.map((type, order) => {
        const setting = type.serviceTypeSettings.find((candidate) => candidate.modelId === modelId);
        return { serviceTypeId: type.id, code: type.code, label: `${type.code} · ${type.description}`, order, daysLimit: setting?.daysLimit ?? null, mileageLimit: setting?.mileageLimit ?? null };
      });

    const byVariant = query.order === 'VARIANT';
    const groupKey = (vehicle: SoldVehicle) => (byVariant ? vehicle.variantId : vehicle.modelId) ?? 'none';
    const groupLabel = (vehicle: SoldVehicle) => (byVariant ? [vehicle.model, vehicle.variant].filter(Boolean).join(' · ') : vehicle.model) || 'Not recorded';
    const rows: SoldVehicle[] = [];
    const soldPer = new Map<string, { label: string; sold: number }>();
    for (const vehicle of sold) {
      const key = groupKey(vehicle);
      soldPer.set(key, { label: groupLabel(vehicle), sold: (soldPer.get(key)?.sold ?? 0) + 1 });
      const facts = { saleDate: localDateOf(vehicle.saleDate, scope.timeZone), mileage: vehicle.mileage, done: doneBy.get(vehicle.vehicleId) ?? new Set<string>() };
      for (const skip of skippedFreeServices(facts, rulesFor(vehicle.modelId), today)) {
        if (!selected.has(skip.serviceTypeId)) continue;
        rows.push({
          ...vehicle,
          serviceSkipped: skip.label,
          dueBy: skip.dueBy,
          dueKm: skip.dueKm,
          reason: skip.reason,
          [`skipped:${skip.serviceTypeId}`]: 1,
        });
      }
    }
    rows.sort((a, b) =>
      query.order === 'SALE_DATE'
        ? (a.saleDate as Date).getTime() - (b.saleDate as Date).getTime()
        : String(a.registration ?? '').localeCompare(String(b.registration ?? '')),
    );
    const skippedKeys = shown.map((type) => `skipped:${type.id}`);
    const always = Array.from(soldPer.entries()).sort(([, a], [, b]) => a.label.localeCompare(b.label)).map(([key, value]) => ({ key, label: value.label }));
    const grouped = groupRows(rows, { key: groupKey, label: groupLabel, always }, skippedKeys);
    const withPct = (totals: Record<string, number>, soldCount: number) => ({
      ...totals,
      sold: soldCount,
      ...Object.fromEntries(shown.map((type) => [`pct:${type.id}`, percentOf(totals[`skipped:${type.id}`] ?? 0, soldCount)])),
    });
    const overall = Object.fromEntries(skippedKeys.map((key) => [key, rows.filter((row) => row[key] === 1).length]));
    return {
      rows: grouped.rows,
      groups: grouped.groups.map((group) => ({ ...group, totals: withPct(group.totals, soldPer.get(group.key)?.sold ?? 0) })),
      totals: { count: rows.length, ...withPct(overall, sold.length) },
      columns: shown.flatMap((type) => [
        { key: `skipped:${type.id}`, label: `${type.code} skipped`, format: 'integer' as const },
        { key: `pct:${type.id}`, label: `${type.code} %`, format: 'percent' as const },
      ]),
      summary: { sold: sold.length, vehicles: new Set(rows.map((row) => row.vehicleId)).size, skips: rows.length, asOn: today },
      breakdown: shown.map((type) => ({ key: type.id, label: `${type.code} skipped`, count: overall[`skipped:${type.id}`] ?? 0 })),
      truncated,
    };
  },
});

// ── S14. Vehicle list by model and variant ───────────────────────────────────

const vehicleList = defineReport({
  slug: 'vehicle-list',
  title: 'Vehicle list by model and variant',
  width: 80,
  permission: PERMISSIONS.VEHICLE_LIST_READ,
  summary:
    "Vehicles sold in the period (by the owner's branch), optionally with stock vehicles (no sale date or no owner; vehicles without an owner are in every branch's list), with subtotals per model and variant.",
  period: 'range',
  query: rangeQuery(['model', 'variant'], { includeStock: flag, order: orderParam }),
  filterKeys: ['model', 'variant'],
  params: [{ name: 'includeStock', description: 'true: also vehicles with no sale date or no owner.', schema: { type: 'boolean' } }, orderDoc],
  example: {
    rows: [{ groupKey: 'variant-uuid', vehicleId: 'uuid', model: 'Rio', variant: 'Rio 1.4 EX', vin: 'KNADN512AB6123456', engineNumber: 'G4FA123456', registration: 'ABJ503GD', colour: 'White', saleDate: '2026-01-05T00:00:00.000Z', sellingDealer: 'Dana Motors Abuja', customer: 'Example customer', stock: false }],
    groups: [{ key: 'variant-uuid', label: 'Rio · Rio 1.4 EX', count: 1, totals: {} }],
    totals: { count: 1 },
  },
  async run(db, scope, query) {
    const { start, end } = localDayRange(query.from, query.to, scope.timeZone);
    const stock = Prisma.sql`(v."saleDate" IS NULL OR v."customerId" IS NULL)`;
    const sold = Prisma.sql`(v."saleDate" >= ${start} AND v."saleDate" < ${end}${branchScopeSql('c', scope)})`;
    const which = query.includeStock ? Prisma.sql`(${sold} OR (${stock}${branchScopeSql('c', scope, true)}))` : sold;
    const order =
      query.order === 'SALE_DATE'
        ? Prisma.sql`v."saleDate" NULLS LAST, v."registrationNumber"`
        : Prisma.sql`COALESCE(mdl."description", v."model", '~'), COALESCE(var."description", v."trim", '~'), v."saleDate" NULLS LAST, v."registrationNumber"`;
    const result = await db.$queryRaw<ReportRow[]>`
      SELECT v."id" AS "vehicleId", mdl."id" AS "modelId", var."id" AS "variantId",
        COALESCE(mdl."description", v."model", v."customModel") AS "model", COALESCE(var."description", v."trim") AS "variant",
        v."vin", v."engineNumber", v."registrationNumber" AS "registration", COALESCE(col."description", v."color") AS "colour",
        v."saleDate", v."sellingDealer", ${customerNameSql('c')} AS "customer", ${addressSql('c')} AS "customerAddress", ${phoneSql('c')} AS "customerPhone",
        ${stock} AS "stock"
      FROM "Vehicle" v
      LEFT JOIN "WorkshopMaster" var ON var."id" = v."catalogueId"
      LEFT JOIN "WorkshopMaster" mdl ON mdl."id" = var."parentId"
      LEFT JOIN "WorkshopMaster" col ON col."id" = v."colourId"
      LEFT JOIN "Customer" c ON c."id" = v."customerId"
      WHERE ${which}${inFilter(Prisma.raw('mdl."id"'), query.model)}${inFilter(Prisma.raw('var."id"'), query.variant)}
      ORDER BY ${order}
      LIMIT ${MAX_REPORT_ROWS + 1}`;
    const { rows, truncated } = capRows(result);
    const counts = countBy(rows, (row) => (row.stock ? 'stock' : 'sold'));
    if (query.order === 'SALE_DATE') return { rows, groups: [], totals: { count: rows.length }, summary: { sold: counts.sold ?? 0, stock: counts.stock ?? 0 }, truncated };
    const grouped = groupRows(
      rows,
      { key: (row) => String(row.variantId ?? `model:${row.modelId ?? 'none'}`), label: (row) => [row.model ?? 'Model not recorded', row.variant].filter(Boolean).join(' · ') },
      [],
    );
    return { rows: grouped.rows, groups: grouped.groups, totals: { count: rows.length }, summary: { sold: counts.sold ?? 0, stock: counts.stock ?? 0 }, truncated };
  },
});

export const MIS_LIST_REPORTS = [newCustomers, regularCustomers, birthdayAnniversary, vehicleResale, skippedFreeService, vehicleList];
