import {
  CampaignStatus,
  CampaignType,
  CampaignVehicleStatus,
  ContactChannel,
  ContactOutcome,
  JobCardLineKind,
  Prisma,
} from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { ROLES } from "../../shared/constants/roles";
import { NOTIFICATION_TYPES, NotificationService } from "../notification/notification.service";
import { ServiceService } from "../service/service.service";
import {
  CAMPAIGN_TRANSITIONS,
  assertVehicleTransition,
  buildProgress,
  normalizeVin,
  parseVinList,
  statusAfterContact,
  vinError,
} from "./campaign.logic";

/** Upper bound on vehicles added in one request, to keep the transaction short. */
export const MAX_VEHICLES_PER_REQUEST = 20_000;

const TYPE_LABEL: Record<CampaignType, string> = { RECALL: "Recall", FREE_FIX: "Free fix", SERVICE_CAMPAIGN: "Service campaign" };

export interface CampaignInput {
  code: string;
  title: string;
  type: CampaignType;
  description?: string | null;
  defectDescription?: string | null;
  startDate: Date;
  endDate?: Date | null;
  labourCovered?: boolean;
  partsCovered?: boolean;
  models?: { vehicleModelId: string; yearFrom?: number | null; yearTo?: number | null }[];
  coveredItems?: { kind: JobCardLineKind; partNumber?: string | null; operationCode?: string | null; description: string; maxQuantity?: number | null }[];
}

export type AddVehiclesInput =
  | { vins: string[]; dryRun?: boolean }
  | { criteria: { vehicleModelIds: string[]; yearFrom?: number | null; yearTo?: number | null; vinFrom?: string | null; vinTo?: string | null }; dryRun?: boolean };

async function statusCounts(where: Prisma.CampaignVehicleWhereInput) {
  const rows = await prisma.campaignVehicle.groupBy({ by: ["status"], where, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<Record<CampaignVehicleStatus, number>>;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class CampaignService {
  async list(params: { type?: CampaignType; status?: CampaignStatus; search?: string; page?: number; limit?: number }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const q = params.search ? { contains: params.search, mode: "insensitive" as const } : undefined;
    const where: Prisma.CampaignWhereInput = {
      ...(params.type && { type: params.type }),
      ...(params.status && { status: params.status }),
      ...(q && { OR: [{ code: q }, { title: q }, { models: { some: { vehicleModel: { name: q } } } }] }),
    };
    const [items, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: [{ status: "asc" }, { startDate: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: { models: { include: { vehicleModel: { select: { id: true, name: true } } } } },
      }),
      prisma.campaign.count({ where }),
    ]);
    const counts = await prisma.campaignVehicle.groupBy({
      by: ["campaignId", "status"],
      where: { campaignId: { in: items.map((c) => c.id) } },
      _count: { _all: true },
    });
    return {
      items: items.map((c) => {
        const mine = Object.fromEntries(counts.filter((r) => r.campaignId === c.id).map((r) => [r.status, r._count._all]));
        return { ...c, progress: buildProgress(mine) };
      }),
      total,
      page,
      limit,
    };
  }

  /** KPIs across active campaigns. */
  async summary() {
    const [activeCampaigns, counts] = await Promise.all([
      prisma.campaign.count({ where: { status: CampaignStatus.ACTIVE } }),
      statusCounts({ campaign: { status: CampaignStatus.ACTIVE } }),
    ]);
    return { activeCampaigns, ...buildProgress(counts) };
  }

  async get(id: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        models: { include: { vehicleModel: { select: { id: true, code: true, name: true, make: true } } } },
        coveredItems: { orderBy: { createdAt: "asc" } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!campaign) throw new NotFoundError("Campaign not found");
    const [counts, byBranch, unmatched] = await Promise.all([
      statusCounts({ campaignId: id }),
      this.progressByBranch(id),
      prisma.campaignVehicle.count({ where: { campaignId: id, vehicleId: null } }),
    ]);
    return { ...campaign, progress: buildProgress(counts), byBranch, unmatchedVins: unmatched };
  }

  private async progressByBranch(campaignId: string) {
    const rows = await prisma.$queryRaw<{ branchId: string | null; branchName: string | null; status: CampaignVehicleStatus; count: bigint }[]>`
      SELECT b."id" AS "branchId", b."name" AS "branchName", cv."status", COUNT(*) AS "count"
      FROM "CampaignVehicle" cv
      LEFT JOIN "Vehicle" v ON v."id" = cv."vehicleId"
      LEFT JOIN "Customer" c ON c."id" = v."customerId"
      LEFT JOIN "Branch" b ON b."id" = c."branchId"
      WHERE cv."campaignId" = ${campaignId}
      GROUP BY b."id", b."name", cv."status"`;
    const branches = new Map<string, { branchId: string | null; branchName: string; counts: Partial<Record<CampaignVehicleStatus, number>> }>();
    for (const row of rows) {
      const key = row.branchId ?? "unmatched";
      const entry = branches.get(key) ?? { branchId: row.branchId, branchName: row.branchName ?? "Not in system", counts: {} };
      entry.counts[row.status] = Number(row.count);
      branches.set(key, entry);
    }
    return [...branches.values()]
      .map((b) => ({ branchId: b.branchId, branchName: b.branchName, ...buildProgress(b.counts) }))
      .sort((a, b) => (a.branchId === null ? 1 : b.branchId === null ? -1 : a.branchName.localeCompare(b.branchName)));
  }

  async create(input: CampaignInput, actorId: string) {
    this.assertDates(input.startDate, input.endDate ?? null);
    const code = input.code.trim().toUpperCase();
    if (await prisma.campaign.findUnique({ where: { code }, select: { id: true } })) {
      throw new ConflictError(`Campaign code ${code} is already used`);
    }
    await this.assertModels(input.models);
    const campaign = await prisma.campaign.create({
      data: {
        code,
        title: input.title.trim(),
        type: input.type,
        description: input.description ?? null,
        defectDescription: input.defectDescription ?? null,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        labourCovered: input.labourCovered ?? true,
        partsCovered: input.partsCovered ?? true,
        createdById: actorId,
        models: { create: (input.models ?? []).map((m) => ({ vehicleModelId: m.vehicleModelId, yearFrom: m.yearFrom ?? null, yearTo: m.yearTo ?? null })) },
        coveredItems: { create: (input.coveredItems ?? []).map((i) => this.itemData(i)) },
      },
    });
    return this.get(campaign.id);
  }

  async update(id: string, input: Partial<CampaignInput>) {
    const current = await prisma.campaign.findUnique({ where: { id } });
    if (!current) throw new NotFoundError("Campaign not found");
    if (current.status === CampaignStatus.CLOSED) throw new BadRequestError("A closed campaign cannot be edited");
    if (input.type && input.type !== current.type && current.status !== CampaignStatus.DRAFT) {
      throw new BadRequestError("The campaign type can only change while it is a draft");
    }
    this.assertDates(input.startDate ?? current.startDate, input.endDate === undefined ? current.endDate : input.endDate);
    await this.assertModels(input.models);
    const code = input.code?.trim().toUpperCase();
    if (code && code !== current.code && (await prisma.campaign.findUnique({ where: { code }, select: { id: true } }))) {
      throw new ConflictError(`Campaign code ${code} is already used`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { id },
        data: {
          ...(code && { code }),
          ...(input.title !== undefined && { title: input.title.trim() }),
          ...(input.type && { type: input.type }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.defectDescription !== undefined && { defectDescription: input.defectDescription }),
          ...(input.startDate && { startDate: input.startDate }),
          ...(input.endDate !== undefined && { endDate: input.endDate }),
          ...(input.labourCovered !== undefined && { labourCovered: input.labourCovered }),
          ...(input.partsCovered !== undefined && { partsCovered: input.partsCovered }),
        },
      });
      if (input.models) {
        await tx.campaignModel.deleteMany({ where: { campaignId: id } });
        await tx.campaignModel.createMany({
          data: input.models.map((m) => ({ campaignId: id, vehicleModelId: m.vehicleModelId, yearFrom: m.yearFrom ?? null, yearTo: m.yearTo ?? null })),
        });
      }
      if (input.coveredItems) {
        await tx.campaignCoveredItem.deleteMany({ where: { campaignId: id } });
        await tx.campaignCoveredItem.createMany({ data: input.coveredItems.map((i) => ({ ...this.itemData(i), campaignId: id })) });
      }
    });
    return this.get(id);
  }

  async activate(id: string) {
    const affected = await prisma.campaignVehicle.count({ where: { campaignId: id } });
    if (affected === 0) throw new BadRequestError("Add the affected vehicles before activating the campaign");
    const result = await prisma.campaign.updateMany({
      where: { id, status: { in: CAMPAIGN_TRANSITIONS.ACTIVATE } },
      data: { status: CampaignStatus.ACTIVE, activatedAt: new Date() },
    });
    if (result.count !== 1) throw new ConflictError("Only a draft campaign can be activated");
    await this.notifyActivated(id);
    return this.get(id);
  }

  async close(id: string) {
    const result = await prisma.campaign.updateMany({
      where: { id, status: { in: CAMPAIGN_TRANSITIONS.CLOSE } },
      data: { status: CampaignStatus.CLOSED, closedAt: new Date() },
    });
    if (result.count !== 1) throw new ConflictError("This campaign is already closed");
    return this.get(id);
  }

  private async notifyActivated(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id }, select: { code: true, title: true, type: true } });
    if (!campaign) return;
    const branches = await prisma.$queryRaw<{ branchId: string; count: bigint }[]>`
      SELECT c."branchId", COUNT(*) AS "count"
      FROM "CampaignVehicle" cv
      JOIN "Vehicle" v ON v."id" = cv."vehicleId"
      JOIN "Customer" c ON c."id" = v."customerId"
      WHERE cv."campaignId" = ${id}
      GROUP BY c."branchId"`;
    const notifications = new NotificationService();
    await Promise.all(
      branches.flatMap(({ branchId, count }) => {
        const payload = {
          type: NOTIFICATION_TYPES.CAMPAIGN_ACTIVATED,
          title: `${TYPE_LABEL[campaign.type]} campaign activated`,
          message: `${campaign.code} — ${campaign.title}: ${Number(count)} affected vehicle(s) at your branch.`,
          link: `/campaigns/${id}`,
          branchId,
        };
        return [
          notifications.notifyRole(ROLES.SERVICE_ADVISOR, branchId, payload),
          notifications.notifyRole(ROLES.RECEPTION_MANAGER, branchId, payload),
        ];
      }),
    );
  }

  // ── Affected vehicles ────────────────────────────────────────────────────

  /**
   * Adds affected vehicles by VIN list or by criteria. With `dryRun` nothing is saved and the
   * response is the validation summary shown before confirming. Existing rows are left untouched.
   */
  async addVehicles(id: string, input: AddVehiclesInput) {
    const campaign = await prisma.campaign.findUnique({ where: { id }, select: { status: true } });
    if (!campaign) throw new NotFoundError("Campaign not found");
    if (campaign.status === CampaignStatus.CLOSED) throw new BadRequestError("Vehicles cannot be added to a closed campaign");

    let vins: string[];
    let invalid: { line: number; value: string; error: string }[] = [];
    let duplicatesInInput = 0;
    if ("vins" in input) {
      const parsed = parseVinList(input.vins);
      vins = parsed.valid;
      invalid = parsed.invalid;
      duplicatesInInput = parsed.duplicatesInInput;
    } else {
      vins = await this.vinsByCriteria(input.criteria);
    }
    if (vins.length > MAX_VEHICLES_PER_REQUEST) {
      throw new BadRequestError(`Add at most ${MAX_VEHICLES_PER_REQUEST.toLocaleString("en-NG")} vehicles at a time`);
    }

    const [existing, vehicles] = await Promise.all([
      prisma.campaignVehicle.findMany({ where: { campaignId: id, vin: { in: vins } }, select: { vin: true } }),
      prisma.vehicle.findMany({ where: { vin: { in: vins } }, select: { id: true, vin: true } }),
    ]);
    const already = new Set(existing.map((e) => e.vin));
    const vehicleByVin = new Map(vehicles.map((v) => [v.vin.toUpperCase(), v.id]));
    const toAdd = vins.filter((v) => !already.has(v));
    const summary = {
      valid: vins.length,
      invalid,
      duplicatesInInput,
      alreadyInCampaign: already.size,
      notInSystem: toAdd.filter((v) => !vehicleByVin.has(v)).length,
      toAdd: toAdd.length,
      added: 0,
    };
    if (input.dryRun || toAdd.length === 0) return summary;

    const created = await prisma.campaignVehicle.createMany({
      data: toAdd.map((vin) => ({ campaignId: id, vin, vehicleId: vehicleByVin.get(vin) ?? null })),
      skipDuplicates: true,
    });
    return { ...summary, added: created.count };
  }

  private async vinsByCriteria(c: { vehicleModelIds: string[]; yearFrom?: number | null; yearTo?: number | null; vinFrom?: string | null; vinTo?: string | null }) {
    const vinFrom = c.vinFrom ? normalizeVin(c.vinFrom) : null;
    const vinTo = c.vinTo ? normalizeVin(c.vinTo) : null;
    for (const v of [vinFrom, vinTo]) {
      if (v && vinError(v)) throw new BadRequestError(`VIN range bound ${v} ${vinError(v)}`);
    }
    const vehicles = await prisma.vehicle.findMany({
      where: {
        vehicleModelId: { in: c.vehicleModelIds },
        ...((c.yearFrom || c.yearTo) && { year: { ...(c.yearFrom && { gte: c.yearFrom }), ...(c.yearTo && { lte: c.yearTo }) } }),
        ...((vinFrom || vinTo) && { vin: { ...(vinFrom && { gte: vinFrom }), ...(vinTo && { lte: vinTo }) } }),
      },
      select: { vin: true },
      take: MAX_VEHICLES_PER_REQUEST + 1,
    });
    return [...new Set(vehicles.map((v) => normalizeVin(v.vin)))];
  }

  async listVehicles(
    id: string,
    params: { status?: CampaignVehicleStatus; branchId?: string; search?: string; page?: number; limit?: number },
  ) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const q = params.search ? { contains: params.search, mode: "insensitive" as const } : undefined;
    const base: Prisma.CampaignVehicleWhereInput = {
      campaignId: id,
      ...(params.branchId && { vehicle: { customer: { branchId: params.branchId } } }),
      ...(q && {
        OR: [
          { vin: q },
          { vehicle: { registrationNumber: q } },
          { vehicle: { customer: { firstName: q } } },
          { vehicle: { customer: { lastName: q } } },
          { vehicle: { customer: { phoneNumber: q } } },
        ],
      }),
    };
    const where = { ...base, ...(params.status && { status: params.status }) };
    const [items, total, counts] = await Promise.all([
      prisma.campaignVehicle.findMany({
        where,
        orderBy: [{ status: "asc" }, { vin: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          vehicle: {
            select: {
              id: true,
              model: true,
              make: true,
              year: true,
              registrationNumber: true,
              customer: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true, branch: { select: { id: true, name: true } } } },
            },
          },
          appointment: { select: { id: true, scheduledAt: true, status: true } },
          completedJobCard: { select: { id: true, jobNumber: true } },
        },
      }),
      prisma.campaignVehicle.count({ where }),
      statusCounts(base),
    ]);
    return { items, total, page, limit, counts: buildProgress(counts) };
  }

  async getVehicle(id: string, campaignVehicleId: string) {
    const row = await prisma.campaignVehicle.findFirst({
      where: { id: campaignVehicleId, campaignId: id },
      include: {
        campaign: { select: { id: true, code: true, title: true, type: true } },
        vehicle: {
          select: {
            id: true,
            model: true,
            make: true,
            registrationNumber: true,
            customer: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true, branch: { select: { id: true, name: true } } } },
          },
        },
        appointment: { select: { id: true, scheduledAt: true, status: true } },
        completedJobCard: { select: { id: true, jobNumber: true } },
        contactLogs: { orderBy: { createdAt: "desc" }, include: { actor: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!row) throw new NotFoundError("Vehicle is not in this campaign");
    return row;
  }

  async updateVehicleStatus(
    id: string,
    campaignVehicleIds: string[],
    input: { status: CampaignVehicleStatus; notes?: string | null; jobCardId?: string | null },
  ) {
    return prisma.$transaction(async (tx) => {
      const rows = await tx.campaignVehicle.findMany({ where: { id: { in: campaignVehicleIds }, campaignId: id } });
      if (rows.length !== campaignVehicleIds.length) throw new NotFoundError("One or more vehicles are not in this campaign");
      if (input.jobCardId) {
        const jc = await tx.jobCard.findUnique({ where: { id: input.jobCardId }, select: { id: true } });
        if (!jc) throw new NotFoundError("Job card not found");
      }
      const now = new Date();
      for (const row of rows) {
        assertVehicleTransition(row.status, input.status, { jobCardId: input.jobCardId });
        const data: Prisma.CampaignVehicleUncheckedUpdateManyInput = { status: input.status };
        if (input.notes !== undefined) data.notes = input.notes;
        if (input.status === "CONTACTED" && !row.contactedAt) data.contactedAt = now;
        if (input.status === "SCHEDULED") data.scheduledAt = now;
        if (input.status === "COMPLETED") Object.assign(data, { completedAt: now, completedJobCardId: input.jobCardId });
        const updated = await tx.campaignVehicle.updateMany({ where: { id: row.id, status: row.status }, data });
        if (updated.count !== 1) throw new ConflictError("A vehicle was changed by someone else. Refresh and try again.");
      }
      return { updated: rows.length };
    });
  }

  async addContact(
    id: string,
    campaignVehicleId: string,
    input: { channel: ContactChannel; outcome: ContactOutcome; notes?: string | null; nextFollowUpAt?: Date | null },
    actorId: string,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CampaignVehicle" WHERE "id" = ${campaignVehicleId} FOR UPDATE`;
      const row = await tx.campaignVehicle.findFirst({ where: { id: campaignVehicleId, campaignId: id } });
      if (!row) throw new NotFoundError("Vehicle is not in this campaign");
      if (row.status === "COMPLETED") throw new BadRequestError("The campaign work is already completed for this vehicle");
      const now = new Date();
      const next = statusAfterContact(row.status, input.outcome);
      await tx.campaignContactLog.create({ data: { campaignVehicleId, ...input, actorId } });
      await tx.campaignVehicle.update({
        where: { id: campaignVehicleId },
        data: {
          contactAttempts: { increment: 1 },
          lastContactAt: now,
          lastContactOutcome: input.outcome,
          nextFollowUpAt: input.nextFollowUpAt ?? null,
          status: next,
          ...(next === "CONTACTED" && !row.contactedAt && { contactedAt: now }),
        },
      });
    });
    return this.getVehicle(id, campaignVehicleId);
  }

  /** Books a service appointment for the campaign work and marks the vehicle scheduled. */
  async schedule(
    id: string,
    campaignVehicleId: string,
    input: { scheduledAt: Date; branchId: string; notes?: string | null; serviceId?: string | null },
    actorId: string,
  ) {
    const row = await prisma.campaignVehicle.findFirst({
      where: { id: campaignVehicleId, campaignId: id },
      include: { campaign: { select: { code: true, title: true, status: true } }, vehicle: { select: { id: true, customerId: true } } },
    });
    if (!row) throw new NotFoundError("Vehicle is not in this campaign");
    if (row.campaign.status !== CampaignStatus.ACTIVE) throw new BadRequestError("Only active campaigns can schedule work");
    if (!row.vehicle) throw new BadRequestError("This VIN is not in the system yet. Register the vehicle and customer first.");
    if (row.status !== "SCHEDULED") assertVehicleTransition(row.status, "SCHEDULED");
    const branch = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { name: true } });
    if (!branch) throw new NotFoundError("Branch not found");

    const appointment = await new ServiceService().createAppointment({
      customerId: row.vehicle.customerId,
      vehicleId: row.vehicle.id,
      branchName: branch.name,
      scheduledAt: input.scheduledAt.toISOString(),
      serviceId: input.serviceId ?? undefined,
      notes: input.notes?.trim() || `${row.campaign.code} — ${row.campaign.title}`,
      createdById: actorId,
    });
    await prisma.campaignVehicle.update({
      where: { id: campaignVehicleId },
      data: { status: "SCHEDULED", scheduledAt: input.scheduledAt, appointmentId: appointment.id },
    });
    return { appointment, vehicle: await this.getVehicle(id, campaignVehicleId) };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private assertDates(start: Date, end: Date | null) {
    if (end && end.getTime() < start.getTime()) throw new BadRequestError("The end date must be on or after the start date");
  }

  private async assertModels(models?: CampaignInput["models"]) {
    if (!models?.length) return;
    const found = await prisma.vehicleModel.count({ where: { id: { in: models.map((m) => m.vehicleModelId) } } });
    if (found !== new Set(models.map((m) => m.vehicleModelId)).size) throw new BadRequestError("One or more vehicle models were not found");
    for (const m of models) {
      if (m.yearFrom && m.yearTo && m.yearTo < m.yearFrom) throw new BadRequestError("A model's year range is reversed");
    }
  }

  private itemData(i: NonNullable<CampaignInput["coveredItems"]>[number]) {
    if (i.kind === "PART" && !i.partNumber?.trim()) throw new BadRequestError("Covered parts need a part number (a trailing x matches a prefix)");
    return {
      kind: i.kind,
      partNumber: i.partNumber?.trim().toUpperCase() || null,
      operationCode: i.operationCode?.trim() || null,
      description: i.description.trim(),
      maxQuantity: i.maxQuantity ?? null,
    };
  }
}
