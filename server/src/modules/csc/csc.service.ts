import { Prisma, type CscStage } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/appError';
import { localDateOf, localToday, REPORT_TZ, startOfLocalDay } from '../reports/core/dates';
import { createBooking } from '../service/booking.persistence';
import { assertWithinBookingHorizon } from '../service/service.service';
import { generateCases } from './csc.generate';
import { closureEffect, contactProblem, CSC_STAGES, daysOverdue, followUpBlocked, isNotVisited, ruleProblem, visitTiming, type CscStageName } from './csc.logic';
import { reconcileCases } from './csc.match';
import type { CaseListQuery, CreateReasonBody, FollowUpBody, GenerateBody, SaveRulesBody, UpdateReasonBody } from './csc.validation';

export interface CscActor {
  userId: string;
  branchId: string | null;
  allBranches: boolean;
  canFollowUp: boolean;
}

const ACTIVE_BOOKING = { bookingStatus: 'BOOKED' as const, status: { notIn: ['Closed', 'Cancelled', 'Completed', 'No Show'] } };
const day = (value: Date) => value.toISOString().slice(0, 10);
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const fullName = (user: { firstName: string; lastName: string } | null | undefined) => (user ? `${user.firstName} ${user.lastName}`.trim() : null);
const person = { select: { id: true, firstName: true, lastName: true } } as const;

function assertBranch(actor: CscActor, branchId?: string | null) {
  if (!actor.allBranches && (!actor.branchId || (branchId && branchId !== actor.branchId)))
    throw new ForbiddenError('You can only work on CSC cases of your branch');
}

/** The branch a request works on: a branch-scoped user's own; null = every branch (cross-branch users only). */
function branchScope(actor: CscActor, branchId?: string): string | null {
  assertBranch(actor, branchId);
  return actor.allBranches ? (branchId ?? null) : actor.branchId!;
}

const stageEnum = (stage: CscStageName) => Prisma.sql`${stage}::"CscStage"`;
const doneSql = (stage: CscStageName) =>
  Prisma.sql`(EXISTS (SELECT 1 FROM "CscContact" x WHERE x."caseId" = c."id" AND x."stage" = ${stageEnum(stage)})
    OR EXISTS (SELECT 1 FROM "CscStageClosure" y WHERE y."caseId" = c."id" AND y."stage" = ${stageEnum(stage)}))`;
const STAGE_DATE: Record<CscStageName, Prisma.Sql> = {
  FIRST: Prisma.raw('c."followUp1Date"'),
  SECOND: Prisma.raw('c."followUp2Date"'),
  NOT_VISITED: Prisma.raw('c."dueDate"'),
};

const caseInclude = {
  branch: { select: { id: true, name: true } },
  serviceType: { select: { id: true, code: true, description: true } },
  vehicle: {
    select: {
      id: true, registrationNumber: true, vin: true, model: true, trim: true, lastRecordedMileage: true, saleDate: true,
      catalogue: { select: { description: true, parent: { select: { id: true, description: true } } } },
    },
  },
  customer: {
    select: {
      id: true, firstName: true, lastName: true, companyName: true, phoneNumber: true, mobile2: true, email: true, address: true, city: true,
      contactPerson: true, preferredFollowupDay: true, preferredFollowupTime: true, preferredContactMethod: true,
    },
  },
  lastVisitJobCard: { select: { id: true, jobNumber: true, createdAt: true, mileage: true, status: true, serviceType: { select: { code: true, description: true } } } },
  visitJobCard: { select: { id: true, jobNumber: true, createdAt: true, mileage: true } },
  booking: { select: { id: true, bookingNumber: true, scheduledAt: true, status: true, bookingStatus: true } },
  closeReason: { select: { id: true, code: true, description: true, closureType: true } },
  closedBy: person,
  contacts: { orderBy: [{ stage: 'asc' }, { slot: 'asc' }], include: { doneBy: person } },
  stageClosures: { include: { reason: { select: { id: true, code: true, description: true, closureType: true } }, closedBy: person } },
} satisfies Prisma.CscCaseInclude;

type CaseRow = Prisma.CscCaseGetPayload<{ include: typeof caseInclude }>;

function customerName(customer: CaseRow['customer']) {
  if (!customer) return null;
  return customer.companyName?.trim() || `${customer.firstName} ${customer.lastName}`.trim();
}

function vehicleView(vehicle: CaseRow['vehicle']) {
  return {
    id: vehicle.id,
    registration: vehicle.registrationNumber,
    vin: vehicle.vin,
    model: vehicle.catalogue?.parent?.description ?? vehicle.model,
    variant: vehicle.catalogue?.description ?? vehicle.trim,
    lastRecordedMileage: vehicle.lastRecordedMileage,
    saleDate: vehicle.saleDate,
  };
}

function stageDone(row: CaseRow, stage: CscStageName) {
  return row.contacts.some((contact) => contact.stage === stage) || row.stageClosures.some((closure) => closure.stage === stage);
}

function listView(row: CaseRow, stage: CscStageName, today: string) {
  const due = day(row.dueDate);
  const stageContacts = row.contacts.filter((contact) => contact.stage === stage);
  const lastContact = [...row.contacts].sort((a, b) => b.contactDate.getTime() - a.contactDate.getTime())[0];
  return {
    id: row.id,
    status: row.status,
    dueDate: due,
    dueMileage: row.dueMileage,
    followUp1Date: day(row.followUp1Date),
    followUp2Date: day(row.followUp2Date),
    service: row.serviceType,
    vehicle: vehicleView(row.vehicle),
    customer: row.customer ? { id: row.customer.id, name: customerName(row.customer), phone: row.customer.phoneNumber ?? row.customer.mobile2 } : null,
    stageDone: stageDone(row, stage),
    firstDone: stageDone(row, 'FIRST'),
    secondDone: stageDone(row, 'SECOND'),
    stageContacts: stageContacts.length,
    lastContactDate: lastContact ? day(lastContact.contactDate) : null,
    stageClosure: row.stageClosures.find((closure) => closure.stage === stage)?.reason.code ?? null,
    booked: !!row.bookingId,
    bookedFor: row.booking?.scheduledAt ?? null,
    closeReason: row.closeReason,
    visitJobNumber: row.visitJobCard?.jobNumber ?? null,
    daysOverdue: daysOverdue(due, today),
    notVisited: isNotVisited({ status: row.status, dueDate: due, matchDaysAfter: row.matchDaysAfter }, today),
  };
}

function detailView(row: CaseRow, actor: CscActor, today: string) {
  const due = day(row.dueDate);
  const contactsFor = (stage: CscStageName) =>
    row.contacts
      .filter((contact) => contact.stage === stage)
      .map((contact) => ({
        id: contact.id, slot: contact.slot, contactDate: day(contact.contactDate), contactPerson: contact.contactPerson, remarks: contact.remarks,
        doneBy: contact.doneBy ? { id: contact.doneBy.id, name: fullName(contact.doneBy) } : null,
      }));
  const closureFor = (stage: CscStageName) => {
    const closure = row.stageClosures.find((item) => item.stage === stage);
    return closure ? { reason: closure.reason, remarks: closure.remarks, closedAt: closure.closedAt, closedBy: fullName(closure.closedBy) } : null;
  };
  return {
    ...listView(row, 'FIRST', today),
    matchDaysBefore: row.matchDaysBefore,
    matchDaysAfter: row.matchDaysAfter,
    generatedAt: row.generatedAt,
    branch: row.branch,
    customer: row.customer ? { ...row.customer, name: customerName(row.customer) } : null,
    lastVisit: row.lastVisitJobCard
      ? { id: row.lastVisitJobCard.id, jobNumber: row.lastVisitJobCard.jobNumber, date: row.lastVisitJobCard.createdAt, mileage: row.lastVisitJobCard.mileage, status: row.lastVisitJobCard.status, serviceType: row.lastVisitJobCard.serviceType }
      : null,
    visit: row.visitJobCard
      ? { ...row.visitJobCard, date: row.visitJobCard.createdAt, timing: visitTiming(localDateOf(row.visitJobCard.createdAt, REPORT_TZ), due, row.matchDaysAfter) }
      : null,
    booking: row.booking,
    bookedAt: row.bookedAt,
    closure: row.closeReason ? { reason: row.closeReason, remarks: row.closeRemarks, closedAt: row.closedAt, closedBy: fullName(row.closedBy) } : null,
    stages: Object.fromEntries(CSC_STAGES.map((stage) => [stage, { contacts: contactsFor(stage), closure: closureFor(stage) }])),
    canEdit: actor.canFollowUp && row.status === 'OPEN',
  };
}

export class CscService {
  // ── Masters ─────────────────────────────────────────────────────────────────

  /** Every model with its schedule versions, for the master's model list. */
  async ruleModels() {
    const [models, versions] = await Promise.all([
      prisma.workshopMaster.findMany({ where: { kind: 'MODEL' }, select: { id: true, code: true, description: true, active: true }, orderBy: [{ active: 'desc' }, { description: 'asc' }] }),
      prisma.cscRule.groupBy({ by: ['modelId', 'effectiveDate'], _count: { _all: true }, orderBy: { effectiveDate: 'desc' } }),
    ]);
    return models.map((model) => {
      const own = versions.filter((version) => version.modelId === model.id);
      return { ...model, versions: own.map((version) => ({ effectiveDate: day(version.effectiveDate), services: version._count._all })) };
    });
  }

  /** A model's schedule versions, newest first, each with its services. */
  async rulesForModel(modelId: string) {
    const model = await prisma.workshopMaster.findFirst({ where: { id: modelId, kind: 'MODEL' }, select: { id: true, code: true, description: true, active: true } });
    if (!model) throw new NotFoundError('Model not found');
    const rules = await prisma.cscRule.findMany({
      where: { modelId },
      include: { serviceType: { select: { id: true, code: true, description: true } } },
      orderBy: [{ effectiveDate: 'desc' }, { dueDays: 'asc' }],
    });
    const dates = [...new Set(rules.map((rule) => day(rule.effectiveDate)))];
    return {
      model,
      versions: dates.map((effectiveDate) => {
        const own = rules.filter((rule) => day(rule.effectiveDate) === effectiveDate);
        return {
          effectiveDate,
          notVisitedMonths: own[0].notVisitedMonths,
          matchDaysBefore: own[0].matchDaysBefore,
          matchDaysAfter: own[0].matchDaysAfter,
          services: own.map((rule) => ({
            id: rule.id, serviceType: rule.serviceType, serviceTypeId: rule.serviceTypeId, dueDays: rule.dueDays, dueKm: rule.dueKm,
            rotationDays: rule.rotationDays, rotationKm: rule.rotationKm, followUp1Days: rule.followUp1Days, followUp2Days: rule.followUp2Days,
            variationDays: rule.variationDays, variationKm: rule.variationKm, active: rule.active,
          })),
        };
      }),
    };
  }

  async serviceTypes() {
    return prisma.workshopMaster.findMany({ where: { kind: 'SERVICE_TYPE', active: true }, select: { id: true, code: true, description: true }, orderBy: { code: 'asc' } });
  }

  /** Saves one schedule version for one or more models (insert or update per model, service and date). */
  async saveRules(body: SaveRulesBody, actorId: string) {
    for (const service of body.services) {
      const problem = ruleProblem(service);
      if (problem) throw new BadRequestError(problem);
    }
    const [models, types] = await Promise.all([
      prisma.workshopMaster.count({ where: { id: { in: body.modelIds }, kind: 'MODEL' } }),
      prisma.workshopMaster.findMany({ where: { id: { in: body.services.map((service) => service.serviceTypeId) }, kind: 'SERVICE_TYPE' }, select: { code: true } }),
    ]);
    if (models !== body.modelIds.length) throw new BadRequestError('Choose models from the model master');
    if (types.length !== body.services.length) throw new BadRequestError('Choose services from the service type master');
    const effectiveDate = toDate(body.effectiveDate);
    const shared = { notVisitedMonths: body.notVisitedMonths, matchDaysBefore: body.matchDaysBefore, matchDaysAfter: body.matchDaysAfter };
    await prisma.$transaction(async (tx) => {
      for (const modelId of body.modelIds)
        for (const service of body.services) {
          const values = { ...shared, ...service };
          await tx.cscRule.upsert({
            where: { modelId_serviceTypeId_effectiveDate: { modelId, serviceTypeId: service.serviceTypeId, effectiveDate } },
            create: { modelId, effectiveDate, ...values },
            update: values,
          });
        }
      // The window and months apply to the whole version.
      await tx.cscRule.updateMany({ where: { modelId: { in: body.modelIds }, effectiveDate }, data: shared });
      await tx.auditLog.create({
        data: { userId: actorId, action: 'CSC_RULES_SAVED', details: JSON.stringify({ modelIds: body.modelIds, effectiveDate: body.effectiveDate, services: types.map((type) => type.code), ...shared }) },
      });
    });
    return { saved: body.modelIds.length * body.services.length, models: body.modelIds.length, effectiveDate: body.effectiveDate };
  }

  async reasons(includeInactive: boolean) {
    const rows = await prisma.cscCloseReason.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { code: 'asc' },
      include: { _count: { select: { cases: true, stageClosures: true } } },
    });
    // Every use (partial or final) leaves a stage closure; a final one also sits on the case.
    return rows.map(({ _count, ...row }) => ({ ...row, used: Math.max(_count.stageClosures, _count.cases) }));
  }

  async createReason(body: CreateReasonBody, actorId: string) {
    if (await prisma.cscCloseReason.findUnique({ where: { code: body.code }, select: { id: true } }))
      throw new ConflictError(`Reason code ${body.code} already exists`).withCode('FIELD_VALIDATION', { field: 'code' });
    return prisma.$transaction(async (tx) => {
      const reason = await tx.cscCloseReason.create({ data: body });
      await tx.auditLog.create({ data: { userId: actorId, action: 'CSC_REASON_CREATED', details: JSON.stringify({ reasonId: reason.id, code: reason.code, closureType: reason.closureType }) } });
      return reason;
    });
  }

  async updateReason(id: string, body: UpdateReasonBody, actorId: string) {
    const before = await prisma.cscCloseReason.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Reason not found');
    return prisma.$transaction(async (tx) => {
      const reason = await tx.cscCloseReason.update({ where: { id }, data: body });
      await tx.auditLog.create({
        data: { userId: actorId, action: 'CSC_REASON_UPDATED', details: JSON.stringify({ reasonId: id, code: before.code, before: { description: before.description, closureType: before.closureType, active: before.active }, after: body }) },
      });
      return reason;
    });
  }

  /** Only a reason never used on a case can be deleted; a used one is deactivated instead. */
  async deleteReason(id: string, actorId: string) {
    const reason = await prisma.cscCloseReason.findUnique({ where: { id }, include: { _count: { select: { cases: true, stageClosures: true } } } });
    if (!reason) throw new NotFoundError('Reason not found');
    if (reason._count.cases + reason._count.stageClosures > 0)
      throw new ConflictError(`Reason ${reason.code} is used on CSC cases and cannot be deleted. Deactivate it instead.`);
    await prisma.$transaction([
      prisma.cscCloseReason.delete({ where: { id } }),
      prisma.auditLog.create({ data: { userId: actorId, action: 'CSC_REASON_DELETED', details: JSON.stringify({ reasonId: id, code: reason.code }) } }),
    ]);
    return { id };
  }

  // ── Cases ───────────────────────────────────────────────────────────────────

  async generate(body: GenerateBody, actor: CscActor) {
    const branchId = branchScope(actor, body.branchId);
    return generateCases({ branchId, from: body.from, to: body.to, modelIds: body.modelIds, serviceTypeIds: body.serviceTypeIds, actorId: actor.userId });
  }

  /** The follow-up screens' list: cases whose stage date is in the range, with due / done / both counts. */
  async list(query: CaseListQuery, actor: CscActor) {
    const branchId = branchScope(actor, query.branchId);
    await reconcileCases(prisma, branchId ? [branchId] : null);
    const today = localToday(REPORT_TZ);
    const stage = query.stage;
    const dateCol = STAGE_DATE[stage];
    const done = doneSql(stage);
    const conditions: Prisma.Sql[] = [Prisma.sql`${dateCol} BETWEEN ${query.from}::date AND ${query.to}::date`];
    if (branchId) conditions.push(Prisma.sql`c."branchId" = ${branchId}`);
    if (query.modelId?.length) conditions.push(Prisma.sql`var."parentId" IN (${Prisma.join(query.modelId)})`);
    if (query.serviceTypeId?.length) conditions.push(Prisma.sql`c."serviceTypeId" IN (${Prisma.join(query.serviceTypeId)})`);
    if (query.search) {
      const like = `%${query.search}%`;
      conditions.push(Prisma.sql`(v."registrationNumber" ILIKE ${like} OR v."vin" ILIKE ${like} OR cu."phoneNumber" ILIKE ${like}
        OR CONCAT(cu."firstName", ' ', cu."lastName") ILIKE ${like} OR cu."companyName" ILIKE ${like})`);
    }
    if (stage === 'SECOND' && !query.includeFirstNotDone) conditions.push(doneSql('FIRST'));
    if (stage === 'NOT_VISITED') {
      conditions.push(Prisma.sql`c."dueDate" + c."matchDaysAfter" < ${today}::date`);
      if (query.daysNotVisited !== undefined) conditions.push(Prisma.sql`${today}::date - c."dueDate" >= ${query.daysNotVisited}`);
      if (query.onlyFollowedUp) conditions.push(Prisma.sql`(${doneSql('FIRST')} OR ${doneSql('SECOND')})`);
    }
    const dueSql = Prisma.sql`(c."status" = 'OPEN' AND NOT ${done})`;
    // Both = every case in the range; on the not-visited list only those still open (or followed up there).
    const bothSql = stage === 'NOT_VISITED' ? Prisma.sql`(c."status" = 'OPEN' OR ${done})` : Prisma.sql`TRUE`;
    const stateSql = query.state === 'DUE' ? dueSql : query.state === 'DONE' ? done : bothSql;
    const from = Prisma.sql`FROM "CscCase" c
      JOIN "Vehicle" v ON v."id" = c."vehicleId"
      LEFT JOIN "WorkshopMaster" var ON var."id" = v."catalogueId"
      LEFT JOIN "Customer" cu ON cu."id" = c."customerId"
      WHERE ${Prisma.join(conditions, ' AND ')}`;
    const [counts] = await prisma.$queryRaw<{ due: bigint; done: bigint; both: bigint }[]>`
      SELECT COUNT(*) FILTER (WHERE ${dueSql}) AS "due", COUNT(*) FILTER (WHERE ${done}) AS "done", COUNT(*) FILTER (WHERE ${bothSql}) AS "both" ${from}`;
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT c."id" ${from} AND ${stateSql}
      ORDER BY ${dateCol} ASC, c."dueDate" ASC, v."registrationNumber" ASC NULLS LAST, c."id" ASC
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`;
    const rows = await prisma.cscCase.findMany({ where: { id: { in: ids.map((row) => row.id) } }, include: caseInclude });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const stateCounts = { DUE: Number(counts.due), DONE: Number(counts.done), BOTH: Number(counts.both) };
    const total = stateCounts[query.state];
    return {
      items: ids.flatMap(({ id }) => (byId.has(id) ? [listView(byId.get(id)!, stage, today)] : [])),
      stateCounts,
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  async detail(id: string, actor: CscActor) {
    const row = await prisma.cscCase.findUnique({ where: { id }, include: caseInclude });
    if (!row) throw new NotFoundError('CSC case not found');
    assertBranch(actor, row.branchId);
    return detailView(row, actor, localToday(REPORT_TZ));
  }

  /**
   * Saves one stage of a follow-up: its contact lines (replacing the stage's previous lines), an
   * optional booking (a new booking, or the vehicle's active one linked) and an optional closure
   * (a PARTIAL reason closes the stage, a FINAL one closes the case). One transaction, audited.
   */
  async saveFollowUp(id: string, body: FollowUpBody, actor: CscActor) {
    const today = localToday(REPORT_TZ);
    const problem = contactProblem(body.contacts, today);
    if (problem) throw new BadRequestError(problem);
    const stage = body.stage as CscStage;

    const row = await prisma.cscCase.findUnique({ where: { id }, select: { id: true, branchId: true, status: true, bookingId: true, customerId: true, vehicleId: true, serviceTypeId: true, dueDate: true, serviceType: { select: { code: true } } } });
    if (!row) throw new NotFoundError('CSC case not found');
    assertBranch(actor, row.branchId);
    const blocked = followUpBlocked(row.status);
    if (blocked) throw new ConflictError(blocked);

    const doneByIds = [...new Set(body.contacts.flatMap((contact) => (contact.doneById ? [contact.doneById] : [])))];
    if (doneByIds.length && (await prisma.user.count({ where: { id: { in: doneByIds }, isActive: true } })) !== doneByIds.length)
      throw new BadRequestError('Choose "done by" from active staff');
    const reason = body.closure ? await prisma.cscCloseReason.findFirst({ where: { id: body.closure.reasonId, active: true } }) : null;
    if (body.closure && !reason) throw new BadRequestError('Choose an active closure reason');
    const closesCase = reason ? closureEffect(reason.closureType).closesCase : false;
    if (body.booking && closesCase) throw new BadRequestError('A case closed with a final reason cannot also be booked');
    if (body.booking && row.bookingId) throw new ConflictError('This case is already booked. Change the booking in Appointments.');
    if (body.booking && !row.customerId) throw new BadRequestError('The vehicle has no customer to book for');
    const scheduledAt = body.booking ? new Date(body.booking.scheduledAt) : null;
    if (scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) throw new BadRequestError('The booking date cannot be in the past');
    if (scheduledAt) await assertWithinBookingHorizon(row.branchId, scheduledAt);

    const now = new Date();
    return prisma.$transaction(
      async (tx) => {
        await tx.cscContact.deleteMany({ where: { caseId: id, stage, slot: { notIn: body.contacts.map((contact) => contact.slot) } } });
        for (const contact of body.contacts) {
          const values = { contactDate: toDate(contact.contactDate), contactPerson: contact.contactPerson, remarks: contact.remarks, doneById: contact.doneById ?? null };
          await tx.cscContact.upsert({ where: { caseId_stage_slot: { caseId: id, stage, slot: contact.slot } }, create: { caseId: id, stage, slot: contact.slot, ...values }, update: values });
        }

        let booking: { id: string; bookingNumber: string | null; linked: boolean } | null = null;
        if (scheduledAt && row.customerId) {
          const active = await tx.serviceAppointment.findFirst({ where: { vehicleId: row.vehicleId, customerId: row.customerId, ...ACTIVE_BOOKING }, select: { id: true, bookingNumber: true } });
          if (active) booking = { ...active, linked: true };
          else {
            const created = await createBooking(
              {
                customerId: row.customerId, vehicleId: row.vehicleId, branchId: row.branchId, createdById: actor.userId, scheduledAt, serviceTypeId: row.serviceTypeId,
                source: 'CSC', notes: body.booking?.notes ?? undefined,
                requests: [{ description: `${row.serviceType.code} service due ${day(row.dueDate)} (CSC follow-up)` }],
              },
              tx,
            );
            booking = { id: created.id, bookingNumber: created.bookingNumber ?? null, linked: false };
          }
          await tx.cscCase.update({ where: { id }, data: { bookingId: booking.id, bookedAt: now } });
        }

        if (body.closure && reason) {
          const values = { reasonId: reason.id, remarks: body.closure.remarks, closedAt: now, closedById: actor.userId };
          await tx.cscStageClosure.upsert({ where: { caseId_stage: { caseId: id, stage } }, create: { caseId: id, stage, ...values }, update: values });
          if (closesCase)
            await tx.cscCase.update({ where: { id }, data: { status: 'CLOSED', closeReasonId: reason.id, closeRemarks: body.closure.remarks, closedAt: now, closedById: actor.userId } });
        }

        await tx.auditLog.create({
          data: {
            userId: actor.userId,
            action: 'CSC_FOLLOWUP_SAVED',
            details: JSON.stringify({ caseId: id, branchId: row.branchId, stage, contacts: body.contacts.length, booking: booking ? { id: booking.id, linked: booking.linked } : null, closure: reason ? { code: reason.code, type: reason.closureType } : null }),
          },
        });
        return { id, stage, status: closesCase ? 'CLOSED' : row.status, booking, closure: reason ? { code: reason.code, closureType: reason.closureType } : null };
      },
      { timeout: 15000 },
    );
  }

  /** Staff for the "done by" lists: active users of the branch. */
  async staff(actor: CscActor, branchId?: string) {
    const scope = branchScope(actor, branchId);
    const users = await prisma.user.findMany({
      where: { isActive: true, ...(scope ? { branchId: scope } : {}) },
      select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return users.map((user) => ({ id: user.id, name: fullName(user), role: user.role.name }));
  }

  /** Headline counts for the follow-up screens. */
  async summary(actor: CscActor, branchId?: string) {
    const scope = branchScope(actor, branchId);
    const today = localToday(REPORT_TZ);
    const monthStart = `${today.slice(0, 7)}-01`;
    const branchSql = scope ? Prisma.sql`c."branchId" = ${scope}` : Prisma.sql`TRUE`;
    const notOverdue = Prisma.sql`c."dueDate" + c."matchDaysAfter" >= ${today}::date`;
    const [row] = await prisma.$queryRaw<Record<string, bigint>[]>`
      SELECT
        COUNT(*) FILTER (WHERE c."status" = 'OPEN') AS "open",
        COUNT(*) FILTER (WHERE c."status" = 'OPEN' AND c."followUp1Date" <= ${today}::date AND ${notOverdue} AND NOT ${doneSql('FIRST')}) AS "firstDue",
        COUNT(*) FILTER (WHERE c."status" = 'OPEN' AND c."followUp2Date" <= ${today}::date AND ${notOverdue} AND NOT ${doneSql('SECOND')}) AS "secondDue",
        COUNT(*) FILTER (WHERE c."status" = 'OPEN' AND NOT ${notOverdue}) AS "notVisited",
        COUNT(*) FILTER (WHERE c."status" = 'OPEN' AND c."bookingId" IS NOT NULL) AS "booked",
        COUNT(*) FILTER (WHERE c."status" = 'VISITED' AND c."visitedAt" >= ${startOfLocalDay(monthStart, REPORT_TZ)}) AS "visitedThisMonth",
        COUNT(*) FILTER (WHERE c."status" = 'CLOSED' AND c."closedAt" >= ${startOfLocalDay(monthStart, REPORT_TZ)}) AS "closedThisMonth"
      FROM "CscCase" c WHERE ${branchSql}`;
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])) as Record<string, number>;
  }
}
