import { CampaignVehicleStatus, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { OUTSTANDING_VEHICLE_STATUSES, normalizeVin } from "./campaign.logic";

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
 * The job card was completed: every campaign it was opened for is done for this vehicle.
 * Conditional update, so running it twice changes nothing.
 */
export async function completeCampaignVehiclesForJobCard(tx: Tx, jobCardId: string): Promise<number> {
  const jobCard = await tx.jobCard.findUnique({
    where: { id: jobCardId },
    select: { vehicle: { select: { id: true, vin: true } }, campaigns: { select: { campaignId: true } } },
  });
  if (!jobCard?.vehicle || jobCard.campaigns.length === 0) return 0;
  const result = await tx.campaignVehicle.updateMany({
    where: {
      campaignId: { in: jobCard.campaigns.map((c) => c.campaignId) },
      OR: [{ vehicleId: jobCard.vehicle.id }, { vin: normalizeVin(jobCard.vehicle.vin) }],
      status: { in: OUTSTANDING_VEHICLE_STATUSES },
    },
    data: { status: CampaignVehicleStatus.COMPLETED, completedAt: new Date(), completedJobCardId: jobCardId },
  });
  return result.count;
}
