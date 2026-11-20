import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { serviceHistoryWhere } from '../pdi/pdi.logic';
import { localDateOf, REPORT_TZ } from '../reports/core/dates';
import {
  DEFAULT_NOT_VISITED_MONTHS,
  followUpDates,
  lastVisitOf,
  matchingVisit,
  nextDue,
  notVisitedCutoff,
  pickVersion,
  startDateOf,
  type ScheduleRule,
  type Visit,
} from './csc.logic';
import { reconcileCases } from './csc.match';

const VEHICLE_BATCH = 500;
const CANCELLED = ['CANCELLED', 'Cancelled'];

export interface GenerateInput {
  /** null = every branch (cross-branch users). */
  branchId: string | null;
  from: string;
  to: string;
  modelIds?: string[];
  serviceTypeIds?: string[];
  actorId: string;
}

export interface GenerateResult {
  from: string;
  to: string;
  vehiclesChecked: number;
  due: number;
  created: number;
  alreadyGenerated: number;
  alreadyVisited: number;
  byService: { code: string; description: string; due: number }[];
  skipped: { noStartDate: number; notVisitedRecently: number; noSchedule: number };
}

const toDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const dayOf = (value: Date | null) => (value ? localDateOf(value, REPORT_TZ) : null);

const vehicleSelect = {
  id: true,
  customerId: true,
  saleDate: true,
  saleInvoiceDate: true,
  pdiDate: true,
  catalogue: { select: { parentId: true } },
  customer: { select: { branchId: true, mergedIntoId: true } },
  jobCards: {
    where: { ...serviceHistoryWhere(), status: { notIn: CANCELLED } },
    select: { id: true, createdAt: true, mileage: true, serviceTypeId: true, branchId: true },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.VehicleSelect;

function toSchedule(rule: Prisma.CscRuleGetPayload<{ include: { serviceType: { select: { code: true } } } }>): ScheduleRule {
  return {
    id: rule.id,
    serviceTypeId: rule.serviceTypeId,
    code: rule.serviceType.code,
    effectiveDate: rule.effectiveDate.toISOString().slice(0, 10),
    dueDays: rule.dueDays,
    dueKm: rule.dueKm,
    rotationDays: rule.rotationDays,
    rotationKm: rule.rotationKm,
    followUp1Days: rule.followUp1Days,
    followUp2Days: rule.followUp2Days,
    variationDays: rule.variationDays,
    variationKm: rule.variationKm,
    matchDaysBefore: rule.matchDaysBefore,
    matchDaysAfter: rule.matchDaysAfter,
    notVisitedMonths: rule.notVisitedMonths,
  };
}

/**
 * Creates the cases due from..to: for each vehicle of a model with a schedule, the next service it
 * is due for (csc.logic nextDue). A vehicle belongs to the branch of its last visit, else its
 * customer's branch. Re-running creates no duplicates (unique vehicle, service, due date).
 */
export async function generateCases(input: GenerateInput): Promise<GenerateResult> {
  const rules = await prisma.cscRule.findMany({
    where: { active: true, model: { kind: 'MODEL' }, ...(input.modelIds?.length ? { modelId: { in: input.modelIds } } : {}) },
    include: { serviceType: { select: { code: true } } },
  });
  const byModel = new Map<string, ScheduleRule[]>();
  for (const rule of rules) byModel.set(rule.modelId, [...(byModel.get(rule.modelId) ?? []), toSchedule(rule)]);
  const serviceFilter = input.serviceTypeIds?.length ? new Set(input.serviceTypeIds) : null;

  const result: GenerateResult = {
    from: input.from, to: input.to, vehiclesChecked: 0, due: 0, created: 0, alreadyGenerated: 0, alreadyVisited: 0, byService: [],
    skipped: { noStartDate: 0, notVisitedRecently: 0, noSchedule: 0 },
  };
  if (!byModel.size) return result;

  const dueByService = new Map<string, number>();
  let cursor: string | undefined;
  for (;;) {
    const vehicles = await prisma.vehicle.findMany({
      where: { catalogue: { parentId: { in: [...byModel.keys()] } } },
      select: vehicleSelect,
      orderBy: { id: 'asc' },
      take: VEHICLE_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!vehicles.length) break;
    cursor = vehicles[vehicles.length - 1].id;

    const rows: Prisma.CscCaseCreateManyInput[] = [];
    for (const vehicle of vehicles) {
      const homeBranch = vehicle.jobCards[0]?.branchId ?? vehicle.customer?.branchId ?? null;
      if (!homeBranch || (input.branchId && homeBranch !== input.branchId)) continue;
      result.vehiclesChecked += 1;
      const visits: Visit[] = vehicle.jobCards.map((job) => ({ jobCardId: job.id, date: localDateOf(job.createdAt, REPORT_TZ), mileage: job.mileage, serviceTypeId: job.serviceTypeId }));
      const start = startDateOf({ saleDate: dayOf(vehicle.saleDate), saleInvoiceDate: dayOf(vehicle.saleInvoiceDate), pdiDate: dayOf(vehicle.pdiDate), visits });
      if (!start) {
        result.skipped.noStartDate += 1;
        continue;
      }
      const schedule = pickVersion(byModel.get(vehicle.catalogue?.parentId ?? '') ?? [], start);
      if (!schedule.length) {
        result.skipped.noSchedule += 1;
        continue;
      }
      const last = lastVisitOf(visits);
      if ((last?.date ?? start) < notVisitedCutoff(input.from, schedule[0].notVisitedMonths || DEFAULT_NOT_VISITED_MONTHS)) {
        result.skipped.notVisitedRecently += 1;
        continue;
      }
      const due = nextDue({ schedule, start, visits, asOf: input.from });
      if (!due || due.dueDate < input.from || due.dueDate > input.to) continue;
      if (serviceFilter && !serviceFilter.has(due.rule.serviceTypeId)) continue;

      const visit = matchingVisit(visits, due.dueDate, due.rule.matchDaysBefore);
      const visitJob = visit ? vehicle.jobCards.find((job) => job.id === visit.jobCardId) : undefined;
      if (visit) result.alreadyVisited += 1;
      const dates = followUpDates(due.dueDate, due.rule);
      dueByService.set(due.rule.serviceTypeId, (dueByService.get(due.rule.serviceTypeId) ?? 0) + 1);
      rows.push({
        vehicleId: vehicle.id,
        customerId: vehicle.customer?.mergedIntoId ?? vehicle.customerId,
        branchId: homeBranch,
        serviceTypeId: due.rule.serviceTypeId,
        ruleId: due.rule.id,
        dueDate: toDate(due.dueDate),
        dueMileage: due.dueMileage,
        followUp1Date: toDate(dates.followUp1Date),
        followUp2Date: toDate(dates.followUp2Date),
        matchDaysBefore: due.rule.matchDaysBefore,
        matchDaysAfter: due.rule.matchDaysAfter,
        lastVisitJobCardId: last?.jobCardId ?? null,
        ...(visitJob ? { status: 'VISITED' as const, visitJobCardId: visitJob.id, visitedAt: visitJob.createdAt } : {}),
        generatedById: input.actorId,
      });
    }
    result.due += rows.length;
    if (rows.length) result.created += (await prisma.cscCase.createMany({ data: rows, skipDuplicates: true })).count;
    if (vehicles.length < VEHICLE_BATCH) break;
  }
  result.alreadyGenerated = result.due - result.created;

  const services = await prisma.workshopMaster.findMany({ where: { id: { in: [...dueByService.keys()] } }, select: { id: true, code: true, description: true } });
  result.byService = services
    .map((service) => ({ code: service.code, description: service.description, due: dueByService.get(service.id) ?? 0 }))
    .sort((a, b) => a.code.localeCompare(b.code));

  await prisma.$transaction(async (tx) => {
    await reconcileCases(tx, input.branchId ? [input.branchId] : null);
    await tx.auditLog.create({
      data: {
        userId: input.actorId,
        action: 'CSC_CASES_GENERATED',
        details: JSON.stringify({ branchId: input.branchId, from: input.from, to: input.to, modelIds: input.modelIds ?? 'ALL', serviceTypeIds: input.serviceTypeIds ?? 'ALL', due: result.due, created: result.created }),
      },
    });
  });
  return result;
}
