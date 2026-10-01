/**
 * Loads what coverage needs from the database and answers "is this vehicle
 * under warranty, and which campaigns are open for it?".
 */
import { CampaignVehicleStatus, Prisma, PrismaClient, WarrantyCoverageStatus } from "@prisma/client";
import prisma from "../../prisma/client";
import { NotFoundError } from "../../shared/errors/appError";
import { isCampaignOpen } from "../campaign/campaign.logic";
import { COVERAGE_REASON_TEXT, Coverage, CoverageOverride, CoveragePolicy, computeCoverage } from "./warranty.logic";

type Db = PrismaClient | Prisma.TransactionClient;

export const vehicleWarrantySelect = {
  id: true,
  vin: true,
  registrationNumber: true,
  make: true,
  model: true,
  year: true,
  trim: true,
  customerId: true,
  warrantyStartDate: true,
  lastRecordedMileage: true,
  lastMileageAt: true,
  warrantyOverrideType: true,
  warrantyOverrideUntil: true,
  warrantyOverrideKm: true,
  warrantyOverrideReason: true,
  vehicleModel: {
    select: { id: true, code: true, make: true, name: true, warrantyDays: true, warrantyKm: true, warrantyCovered: true },
  },
} satisfies Prisma.VehicleSelect;

export type VehicleForWarranty = Prisma.VehicleGetPayload<{ select: typeof vehicleWarrantySelect }>;

export function policyOf(vehicle: VehicleForWarranty): CoveragePolicy | null {
  const m = vehicle.vehicleModel;
  if (!m) return null;
  return { code: m.code, name: m.name, warrantyDays: m.warrantyDays, warrantyKm: m.warrantyKm, warrantyCovered: m.warrantyCovered };
}

export function overrideOf(vehicle: VehicleForWarranty): CoverageOverride | null {
  if (!vehicle.warrantyOverrideType) return null;
  return { type: vehicle.warrantyOverrideType, until: vehicle.warrantyOverrideUntil, km: vehicle.warrantyOverrideKm };
}

/** Coverage for a vehicle at a given odometer reading (defaults to the last recorded reading). */
export function coverageFor(vehicle: VehicleForWarranty, mileage?: number | null, today = new Date()): Coverage {
  return computeCoverage({
    startDate: vehicle.warrantyStartDate,
    policy: policyOf(vehicle),
    override: overrideOf(vehicle),
    mileage: mileage ?? vehicle.lastRecordedMileage ?? null,
    today,
  });
}

export interface OpenCampaign {
  campaignId: string;
  campaignVehicleId: string;
  code: string;
  title: string;
  type: "RECALL" | "FREE_FIX" | "SERVICE_CAMPAIGN";
  description: string | null;
  defectDescription: string | null;
  startDate: Date;
  endDate: Date | null;
  vehicleStatus: CampaignVehicleStatus;
  scheduledAt: Date | null;
}

/** Statuses where the campaign work is still to be done for the vehicle. */
const OPEN_FOR_VEHICLE: CampaignVehicleStatus[] = [
  CampaignVehicleStatus.PENDING,
  CampaignVehicleStatus.CONTACTED,
  CampaignVehicleStatus.SCHEDULED,
  CampaignVehicleStatus.NOT_REACHABLE,
];

/** Active, in-date campaigns in which the vehicle (by id or VIN) still needs the work. */
export async function findOpenCampaigns(db: Db, vehicle: { id: string; vin: string }, today = new Date()): Promise<OpenCampaign[]> {
  const rows = await db.campaignVehicle.findMany({
    where: {
      OR: [{ vehicleId: vehicle.id }, { vin: vehicle.vin.toUpperCase() }],
      status: { in: OPEN_FOR_VEHICLE },
      campaign: { status: "ACTIVE" },
    },
    include: {
      campaign: {
        select: { id: true, code: true, title: true, type: true, status: true, description: true, defectDescription: true, startDate: true, endDate: true },
      },
    },
    orderBy: { campaign: { startDate: "asc" } },
  });
  return rows
    .filter((row) => isCampaignOpen(row.campaign, today))
    .map((row) => ({
      campaignId: row.campaign.id,
      campaignVehicleId: row.id,
      code: row.campaign.code,
      title: row.campaign.title,
      type: row.campaign.type,
      description: row.campaign.description,
      defectDescription: row.campaign.defectDescription,
      startDate: row.campaign.startDate,
      endDate: row.campaign.endDate,
      vehicleStatus: row.status,
      scheduledAt: row.scheduledAt,
    }));
}

export async function loadVehicleForWarranty(db: Db, vehicleId: string): Promise<VehicleForWarranty> {
  const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId }, select: vehicleWarrantySelect });
  if (!vehicle) throw new NotFoundError("Vehicle not found");
  return vehicle;
}

export interface WarrantyCheck {
  vehicle: {
    id: string;
    vin: string;
    registrationNumber: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    trim: string | null;
    lastRecordedMileage: number | null;
    lastMileageAt: Date | null;
  };
  policy: (CoveragePolicy & { id: string }) | null;
  override: (CoverageOverride & { reason: string | null }) | null;
  coverage: Coverage;
  /** Human-readable reasons, in the same order as coverage.reasons. */
  reasonText: string[];
  openCampaigns: OpenCampaign[];
  /** The adviser must acknowledge before the job card can be created. */
  requiresAcknowledgement: boolean;
  /** Set when the supplied reading is lower than the last recorded one. */
  mileageWarning: string | null;
}

export function buildCheck(vehicle: VehicleForWarranty, mileage: number | null | undefined, openCampaigns: OpenCampaign[], today = new Date()): WarrantyCheck {
  const coverage = coverageFor(vehicle, mileage, today);
  const last = vehicle.lastRecordedMileage;
  return {
    vehicle: {
      id: vehicle.id,
      vin: vehicle.vin,
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      trim: vehicle.trim,
      lastRecordedMileage: last,
      lastMileageAt: vehicle.lastMileageAt,
    },
    policy: vehicle.vehicleModel ? { id: vehicle.vehicleModel.id, ...policyOf(vehicle)! } : null,
    override: vehicle.warrantyOverrideType
      ? { ...overrideOf(vehicle)!, reason: vehicle.warrantyOverrideReason }
      : null,
    coverage,
    reasonText: coverage.reasons.map((r) => COVERAGE_REASON_TEXT[r]),
    openCampaigns,
    requiresAcknowledgement: coverage.status === WarrantyCoverageStatus.ACTIVE || openCampaigns.length > 0,
    mileageWarning:
      mileage != null && last != null && mileage < last
        ? `Lower than the last recorded reading of ${last.toLocaleString("en-NG")} km`
        : null,
  };
}

/** Coverage plus open campaigns for a vehicle — the pre-check shown before a job card is created. */
export async function checkVehicleWarranty(vehicleId: string, mileage?: number | null, db: Db = prisma): Promise<WarrantyCheck> {
  const vehicle = await loadVehicleForWarranty(db, vehicleId);
  const openCampaigns = await findOpenCampaigns(db, vehicle);
  return buildCheck(vehicle, mileage, openCampaigns);
}
