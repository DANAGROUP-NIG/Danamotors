import { CampaignStatus, CampaignVehicleStatus, ChargeType, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { ConflictError } from "../../shared/errors/appError";
import {
  OUTSTANDING_VEHICLE_STATUSES,
  REACHED_OUTCOMES,
  VIN_RANGE_PREFIX_LENGTH,
  campaignsMissingAttendance,
  normalizeVin,
  statusAfterNotAttended,
  vinInRange,
} from "./campaign.logic";

type Tx = Prisma.TransactionClient;

// ── Hooks used by other modules ──────────────────────────────────────────────

/** Links campaign rows that were added by VIN before the vehicle existed. */
export async function linkCampaignVehiclesByVin(db: Tx | typeof prisma, vehicle: { id: string; vin: string }) {
  await db.campaignVehicle.updateMany({ where: { vin: normalizeVin(vehicle.vin), vehicleId: null }, data: { vehicleId: vehicle.id } });
}

/** A job card was opened for open campaigns: mark those vehicles scheduled (in the workshop). */
export async function markCampaignVehiclesInWorkshop(tx: Tx, campaignVehicleIds: string[], vehicleId: string) {
  if (campaignVehicleIds.length === 0) return;
  const now = new Date();
  await tx.campaignVehicle.updateMany({
    where: { id: { in: campaignVehicleIds }, status: { in: [CampaignVehicleStatus.PENDING, CampaignVehicleStatus.CONTACTED, CampaignVehicleStatus.NOT_REACHABLE] } },
    data: { status: CampaignVehicleStatus.SCHEDULED, scheduledAt: now },
  });
  await tx.campaignVehicle.updateMany({ where: { id: { in: campaignVehicleIds }, vehicleId: null }, data: { vehicleId } });
}

/**
 * A vehicle was registered: add it to every active campaign with a VIN range that contains its
 * VIN, so the job opening check flags the campaign. Existing rows are left untouched.
 */
export async function addVehicleToRangeCampaigns(db: Tx | typeof prisma, vehicle: { id: string; vin: string }): Promise<number> {
  const vin = normalizeVin(vehicle.vin);
  // Every range shares its first 11 characters, so the prefix narrows the search.
  const ranges = await db.campaignVinRange.findMany({
    where: { vinFrom: { startsWith: vin.slice(0, VIN_RANGE_PREFIX_LENGTH) }, campaign: { status: CampaignStatus.ACTIVE } },
    select: { campaignId: true, vinFrom: true, vinTo: true },
  });
  const campaignIds = [...new Set(ranges.filter((range) => vinInRange(vin, range)).map((range) => range.campaignId))];
  if (campaignIds.length === 0) return 0;
  const created = await db.campaignVehicle.createMany({
    data: campaignIds.map((campaignId) => ({ campaignId, vin, vehicleId: vehicle.id })),
    skipDuplicates: true,
  });
  return created.count;
}

/** Each campaign on the job card with its attended answer, and whether a FREE line is charged to it. */
export async function jobCardCampaignAttendance(tx: Tx, jobCardId: string) {
  const [campaigns, freeLines] = await Promise.all([
    tx.jobCardCampaign.findMany({
      where: { jobCardId },
      select: { campaignId: true, campaignCode: true, campaignTitle: true, attended: true, notAttendedReason: true },
      orderBy: { createdAt: "asc" },
    }),
    tx.jobCardLine.findMany({
      where: { jobCardId, chargeType: ChargeType.FREE, campaignId: { not: null } },
      select: { campaignId: true },
      distinct: ["campaignId"],
    }),
  ]);
  const free = new Set(freeLines.map((line) => line.campaignId));
  return campaigns.map((c) => ({ ...c, hasFreeLine: free.has(c.campaignId) }));
}

/**
 * Before READY every linked campaign needs a done / not done answer. An unanswered campaign
 * with a FREE line charged to it is recorded as done (the answer is pre-set to yes).
 */
export async function assertCampaignAttendance(tx: Tx, jobCardId: string, actorId: string): Promise<void> {
  const campaigns = await jobCardCampaignAttendance(tx, jobCardId);
  const missing = campaignsMissingAttendance(campaigns);
  if (missing.length > 0) {
    throw new ConflictError(
      `Record whether the campaign work was done for ${missing.map((c) => c.campaignCode).join(", ")} before marking the job ready.`,
    ).withCode(
      "CAMPAIGN_ATTENDANCE_REQUIRED",
      missing.map((c) => ({ campaignId: c.campaignId, code: c.campaignCode, title: c.campaignTitle })),
    );
  }
  const preset = campaigns.filter((c) => c.attended === null && c.hasFreeLine).map((c) => c.campaignId);
  if (preset.length > 0) {
    await tx.jobCardCampaign.updateMany({
      where: { jobCardId, campaignId: { in: preset }, attended: null },
      data: { attended: true, attendedAt: new Date(), attendedById: actorId, notAttendedReason: null },
    });
  }
}

/**
 * The job card reached READY (or an answer changed afterwards): campaigns marked attended are
 * completed for this vehicle. For the others the vehicle goes back to outstanding (CONTACTED if
 * the customer was reached, else PENDING), so the next job card flags the campaign again.
 * Conditional updates, so running it twice changes nothing.
 */
export async function completeCampaignVehiclesForJobCard(tx: Tx, jobCardId: string, campaignIds?: string[]): Promise<number> {
  const jobCard = await tx.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      vehicle: { select: { id: true, vin: true } },
      campaigns: { where: campaignIds ? { campaignId: { in: campaignIds } } : {}, select: { campaignId: true, attended: true } },
    },
  });
  if (!jobCard?.vehicle || jobCard.campaigns.length === 0) return 0;
  const vehicleMatch = { OR: [{ vehicleId: jobCard.vehicle.id }, { vin: normalizeVin(jobCard.vehicle.vin) }] };
  const attended = jobCard.campaigns.filter((c) => c.attended === true).map((c) => c.campaignId);
  const notAttended = jobCard.campaigns.filter((c) => c.attended === false).map((c) => c.campaignId);

  let completed = 0;
  if (attended.length > 0) {
    const result = await tx.campaignVehicle.updateMany({
      where: { campaignId: { in: attended }, ...vehicleMatch, status: { in: OUTSTANDING_VEHICLE_STATUSES } },
      data: { status: CampaignVehicleStatus.COMPLETED, completedAt: new Date(), completedJobCardId: jobCardId },
    });
    completed = result.count;
  }
  if (notAttended.length > 0) {
    // Scheduled for this visit, or completed by this job before the answer changed to "not done".
    const rows = await tx.campaignVehicle.findMany({
      where: {
        campaignId: { in: notAttended },
        AND: [
          vehicleMatch,
          { OR: [{ status: CampaignVehicleStatus.SCHEDULED }, { status: CampaignVehicleStatus.COMPLETED, completedJobCardId: jobCardId }] },
        ],
      },
      select: { id: true, contactLogs: { where: { outcome: { in: REACHED_OUTCOMES } }, select: { id: true }, take: 1 } },
    });
    for (const row of rows) {
      await tx.campaignVehicle.update({
        where: { id: row.id },
        data: { status: statusAfterNotAttended(row.contactLogs.length > 0), completedAt: null, completedJobCardId: null },
      });
    }
  }
  return completed;
}
