import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../../shared/constants/roles';
import { localDayRange } from './core/dates';
import { dateQuery } from './core/filters';
import { capRows, groupRows, MAX_REPORT_ROWS, sumFields } from './core/shape';
import { branchFilter, canonicalStatusSql, inFilter, moneySql } from './core/sql';
import type { FilterKey, ReportDefinition, ReportRow } from './core/types';

// ── 1. Service booking report ───────────────────────────────────────────────

const BOOKING_FILTERS: FilterKey[] = ['model', 'variant', 'serviceType'];
const serviceBookingQuery = dateQuery(BOOKING_FILTERS, {});

export const BOOKING_STATUS_ORDER = ['BOOKED', 'CONVERTED', 'NO_SHOW', 'CANCELLED'] as const;

type BookingRow = ReportRow & {
  id: string;
  serviceTypeId: string | null;
  serviceType: string;
  bookingStatus: (typeof BOOKING_STATUS_ORDER)[number];
  estimatedAmount: number | null;
};

export const serviceBookingReport: ReportDefinition<z.infer<typeof serviceBookingQuery>> = {
  slug: 'service-booking',
  title: 'Service booking report',
  width: 80,
  permission: PERMISSIONS.REPORT_SERVICE_BOOKING,
  summary:
    'Vehicles booked to come in on a date (booked-for date), with booking requests, the estimated amount and whether the vehicle arrived (job opened), was cancelled or did not show. Totals by service type.',
  period: 'date',
  query: serviceBookingQuery,
  filterKeys: BOOKING_FILTERS,
  example: {
    rows: [{ bookingNumber: 'BK2026001204', scheduledAt: '2026-10-06T07:30:00.000Z', registration: 'LND 452 KJ', customer: 'Chinedu Okafor', serviceType: '1st Free Service', mileage: 1020, requests: 'Oil change; AC noise', estimatedAmount: 0, bookingStatus: 'CONVERTED', jobNumber: '2026004812' }],
    groups: [{ key: 'uuid', label: 'Paid Service', count: 15, totals: { count: 15, arrived: 10, estimatedAmount: 1284000 } }],
    summary: { total: 24, BOOKED: 6, CONVERTED: 15, NO_SHOW: 2, CANCELLED: 1 },
  },
  async run(db, scope, q) {
    const { start, end } = localDayRange(q.date, q.date, scope.timeZone);
    const result = await db.$queryRaw<BookingRow[]>(Prisma.sql`
      SELECT a."id", a."bookingNumber", a."scheduledAt", a."createdAt" AS "bookedOn", a."bookingStatus"::text AS "bookingStatus",
        a."status" AS "appointmentStatus", a."mileage", b."name" AS "branchName",
        v."registrationNumber" AS "registration", v."vin",
        COALESCE(mdl."description", v."model", v."customModel") AS "model",
        COALESCE(var."description", v."trim") AS "variant",
        COALESCE(NULLIF(c."companyName", ''), TRIM(CONCAT(c."firstName", ' ', c."lastName"))) AS "customer",
        NULLIF(CONCAT_WS(', ', NULLIF(c."address", ''), NULLIF(c."city", ''), NULLIF(c."state", '')), '') AS "customerAddress",
        NULLIF(CONCAT_WS(' / ', NULLIF(c."phoneNumber", ''), NULLIF(c."mobile2", '')), '') AS "customerPhone",
        a."serviceTypeId", COALESCE(st."description", 'Not set') AS "serviceType",
        req."requests", req."estimatedAmount",
        job."id" AS "jobId", job."jobNumber"
      FROM "ServiceAppointment" a
      JOIN "Branch" b ON b."id" = a."branchId"
      JOIN "Vehicle" v ON v."id" = a."vehicleId"
      LEFT JOIN "WorkshopMaster" var ON var."id" = v."catalogueId"
      LEFT JOIN "WorkshopMaster" mdl ON mdl."id" = var."parentId"
      LEFT JOIN "Customer" c ON c."id" = a."customerId"
      LEFT JOIN "WorkshopMaster" st ON st."id" = a."serviceTypeId"
      LEFT JOIN LATERAL (
        SELECT string_agg(COALESCE(NULLIF(r."description", ''), cc."description"), '; ' ORDER BY r."createdAt", r."description") AS "requests",
               ${moneySql(Prisma.sql`SUM(r."estimatedParts" + r."estimatedLabour" + r."estimatedOil")`)} AS "estimatedAmount"
        FROM "AppointmentRequest" r LEFT JOIN "WorkshopMaster" cc ON cc."id" = r."complaintCodeId"
        WHERE r."appointmentId" = a."id") req ON true
      LEFT JOIN LATERAL (
        SELECT j."id", j."jobNumber" FROM "JobCard" j
        WHERE j."appointmentId" = a."id" AND ${canonicalStatusSql(Prisma.raw('j."status"'))} <> 'CANCELLED'
        ORDER BY j."createdAt" LIMIT 1) job ON true
      WHERE a."scheduledAt" >= ${start} AND a."scheduledAt" < ${end}
        ${branchFilter(Prisma.raw('a."branchId"'), scope)}
        ${inFilter(Prisma.raw('mdl."id"'), q.model)}
        ${inFilter(Prisma.raw('v."catalogueId"'), q.variant)}
        ${inFilter(Prisma.raw('a."serviceTypeId"'), q.serviceType)}
        AND UPPER(COALESCE(st."category", '')) <> 'PDI'
      ORDER BY a."scheduledAt", a."bookingNumber"
      LIMIT ${MAX_REPORT_ROWS + 1}`);
    const { rows: capped, truncated } = capRows(result);
    const rows = capped.map((row) => ({ ...row, arrived: row.bookingStatus === 'CONVERTED' ? 1 : 0, estimatedAmount: row.estimatedAmount ?? 0 }));
    const grouped = groupRows(rows, { key: (row) => row.serviceTypeId ?? 'none', label: (row) => row.serviceType }, ['arrived', 'estimatedAmount']);
    const summary: Record<string, number> = { total: rows.length, ...Object.fromEntries(BOOKING_STATUS_ORDER.map((status) => [status, 0])) };
    for (const row of rows) summary[row.bookingStatus] += 1;
    return {
      rows: grouped.rows,
      groups: grouped.groups.map((group) => ({ ...group, totals: { count: group.count, ...group.totals } })),
      totals: { count: rows.length, ...sumFields(rows, ['arrived', 'estimatedAmount']) },
      summary,
      truncated,
    };
  },
};

export const FRONT_OFFICE_REPORTS = [serviceBookingReport];
