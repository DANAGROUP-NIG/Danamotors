/**
 * Warranty check demo (job card revamp phase 4): service histories for the vehicles of the
 * stage jobs that stop at the warranty check, so the officer sees the service history rule at
 * work. Runs before the stage jobs are opened. Safe to run again.
 *
 * - KJA-527ST (sold about 600 days ago): four services in year 1, then a 165-day gap in year 2,
 *   so exactly one missed service (year 2, quarter 2). An outside record inside the gap fixes it.
 * - KJA-528ST (sold about 250 days ago): regular, and in the open recall, so the officer can
 *   charge an item to the campaign.
 * - KJA-529ST: no sale date was ever recorded, so the history cannot be checked.
 */
import { WarrantyCoverageStatus } from "@prisma/client";
import prisma from "../../../src/prisma/client";
import { ROLES } from "../../../src/shared/constants/roles";
import { CampaignService } from "../../../src/modules/campaign/campaign.service";
import { JobWarrantyService } from "../../../src/modules/service/job-warranty.service";
import { DemoContext, Reference } from "./context";
import { CAMPAIGNS, DEMO_TAG, jobKey, LABOUR, PARTS, VEHICLES, type FindingFixture, type LabourKey, type PartKey, type VehicleKey } from "./fixtures";
import type { Parties } from "./parties";
import { daysAgo } from "./retime";
import { stageColumns } from "./stage";

/** Earlier periodic services: days before the seed run and the reading then. */
const HISTORY: Partial<Record<VehicleKey, [number, number][]>> = {
  stgWtyIrregular: [
    [515, 4_100],
    [430, 8_600],
    [345, 12_900],
    [260, 17_200],
    [175, 21_500],
    // 165 days after the one before: the year 2, quarter 2 service was missed.
    [10, 26_000],
  ],
  stgWtyRegular: [
    [170, 4_300],
    [85, 8_900],
  ],
};

/** A delivered periodic service written directly, like the other history scenarios. */
async function ensureVisit(ctx: DemoContext, ref: Reference, parties: Parties, vehicle: VehicleKey, index: number, [ago, mileage]: [number, number]) {
  const key = jobKey(`WTY-${vehicle}-V${index + 1}`);
  if (await prisma.jobCard.findFirst({ where: { customField1: key }, select: { id: true } })) return;
  const staff = ctx.staff.main;
  const opened = daysAgo(ago);
  opened.setUTCHours(8, 0, 0, 0);
  const delivered = new Date(opened.getTime() + 8 * 3_600_000);
  const { id: vehicleId, customerId } = parties.vehicles[vehicle];
  await prisma.jobCard.create({
    data: {
      jobNumber: `DM-WTY-${VEHICLES[vehicle].registrationNumber}-${index + 1}`,
      description: `${DEMO_TAG} Periodic service`,
      status: "DELIVERED",
      ...stageColumns("DELIVERED"),
      customField1: key,
      branchId: ctx.branches.main.id,
      customerId,
      vehicleId,
      serviceTypeId: ref.serviceTypes.RG,
      bayId: ref.bayId,
      teamId: ref.teamId,
      serviceAdvisorId: staff.advisor.id,
      deliveryAdvisorId: staff.advisor.id,
      technicianId: staff.technician.id,
      mileage,
      workDone: "Periodic service done.",
      promisedAt: delivered,
      warrantyStatusAtCreation: WarrantyCoverageStatus.ACTIVE,
      createdById: staff.advisor.id,
      createdAt: opened,
      readyAt: delivered,
      billedAt: delivered,
      deliveredAt: delivered,
      completedAt: delivered,
      openingSignatureRequired: false,
      complaints: { create: [{ description: "Periodic service" }] },
    },
  });
}

export async function prepareWarrantyDemo(ctx: DemoContext, ref: Reference, parties: Parties) {
  // RG (paid service) counts as periodic maintenance; keep it so on databases seeded before phase 4.
  await prisma.workshopMaster.updateMany({ where: { id: ref.serviceTypes.RG }, data: { isPeriodicMaintenance: true } });

  for (const [vehicle, visits] of Object.entries(HISTORY) as [VehicleKey, [number, number][]][])
    for (const [index, visit] of visits.entries()) await ensureVisit(ctx, ref, parties, vehicle, index, visit);

  // KJA-528ST joins the open recall before its job opens, so the job is linked to it.
  const recall = await prisma.campaign.findUnique({ where: { code: CAMPAIGNS.recall.code }, select: { id: true, status: true } });
  const vin = VEHICLES.stgWtyRegular.vin;
  if (recall?.status === "ACTIVE" && !(await prisma.campaignVehicle.findUnique({ where: { campaignId_vin: { campaignId: recall.id, vin } } })))
    await new CampaignService().addVehicles(recall.id, { vins: [vin] });

  // KJA-529ST: the sale date was never recorded (only before its job opens, so testers can add it).
  const noSale = parties.vehicles.stgWtyNoSale.id;
  if (!(await prisma.jobCard.findFirst({ where: { vehicleId: noSale }, select: { id: true } })))
    await prisma.vehicle.update({ where: { id: noSale }, data: { saleDate: null } });
}

/**
 * A job passing through the warranty check on its way to the estimate: the warranty officer
 * decides who pays for every item, as on screen. Items the fixture names are warranty; the rest
 * are customer pay.
 */
export async function decideCustomerPay(ctx: DemoContext, jobCardId: string, findings: FindingFixture[] = []) {
  const officer = { id: ctx.warrantyOfficer.id, role: ROLES.WARRANTY_OFFICER };
  const access = { canUpdate: true, canDecide: true };
  const service = new JobWarrantyService();
  // Items carry the catalogue description they were diagnosed with.
  const warranty = new Set(
    findings.flatMap((finding) => (finding.warranty ?? []).map((key) => (key in LABOUR ? LABOUR[key as LabourKey].description : PARTS[key as PartKey].name))),
  );
  const check = await service.get(jobCardId, officer, access);
  const open = check.items.filter((item) => !item.payer);
  if (!open.length) return;
  const items = open.map((item) => ({ itemId: item.id, payer: warranty.has(item.description) ? ("WARRANTY" as const) : ("CUSTOMER" as const) }));
  const reason = items.some((item) => item.payer === "WARRANTY") ? { reason: "Vehicle is new; the first service is not due yet." } : {};
  await service.saveDecisions(jobCardId, { items, ...reason }, officer, access);
}
