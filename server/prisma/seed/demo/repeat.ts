/**
 * Repeat job demo data: vehicles back soon after a billed job, at every review step. Previous
 * visits are finished history written directly at fixed dates before the run; the repeat visits are
 * opened today through the app's own opening service, so automatic detection really runs.
 * See doc/repeat-jobs-testing-guide.md.
 *
 *   RPT-1  back after 9 days / 410 km         → flagged automatically (days and km), pending review
 *   RPT-2  back after 40 days / 320 km        → flagged automatically by km only, pending review
 *   RPT-3  back after 6 days / 150 km         → flagged, reviewed: 2 wrong diagnosis + 3 no road test
 *   RPT-4  back after 12 days / 1,900 km      → flagged by days, reviewed: 0 not a repeat job
 *   RPT-5  back after 120 days / 7,500 km     → outside the window, flagged by hand (manual)
 *   RPT-6  billed 5 days ago, no new job      → open a job in the UI: the repeat warning appears
 *   RPT-7  billed 60 days ago at 10,000 km    → open with 10,300 km (within km) or 12,000 km (no repeat)
 *   RPT-8  last job cancelled 3 days ago      → open a job: no repeat (the older billed job is 90 days back)
 */
import { WarrantyCoverageStatus } from "@prisma/client";
import prisma from "../../../src/prisma/client";
import { ROLES } from "../../../src/shared/constants/roles";
import { CustomerService } from "../../../src/modules/customer/customer.service";
import { VehicleService } from "../../../src/modules/vehicle/vehicle.service";
import { ServiceService } from "../../../src/modules/service/service.service";
import { RepeatJobService, type RepeatActor } from "../../../src/modules/repeat-job/repeat-job.service";
import { checkVehicleWarranty } from "../../../src/modules/warranty/warranty.coverage";
import { DemoContext, Reference } from "./context";
import { DEMO_TAG, jobKey, WorkshopModelKey } from "./fixtures";
import { daysAgo } from "./retime";

const CUSTOMER = {
  code: "DEMO-C31", type: "INDIVIDUAL", salutation: "Mr.", firstName: "Chidi", lastName: "Okafor",
  phoneNumber: "+2348099900131", email: "chidi.okafor@demo.danamotors.test", address: "14 Sample Crescent, Ikeja", city: "Lagos", state: "Lagos",
} as const;

interface Visit {
  daysAgo: number;
  mileage: number;
  complaint: string;
  workDone: string;
  status?: "DELIVERED" | "CANCELLED";
}

interface Scenario {
  key: string;
  vin: string;
  registration: string;
  model: WorkshopModelKey;
  /** Finished visits, oldest first. */
  history: Visit[];
  /** The visit opened today, when the scenario has one. */
  repeat?: { mileage: number; complaint: string; manualOf?: number; note?: string };
  review?: { codes: string[]; remarks: string };
}

const SCENARIOS: Scenario[] = [
  {
    key: "RPT-1", vin: "KNADEMORPT0000001", registration: "LSR-701RP", model: "RIO",
    history: [{ daysAgo: 9, mileage: 45_200, complaint: "AC not cooling", workDone: "Recharged AC gas, cleaned condenser" }],
    repeat: { mileage: 45_610, complaint: "AC still not cooling", note: "Customer says the AC is warm again after two days" },
  },
  {
    key: "RPT-2", vin: "KNADEMORPT0000002", registration: "LSR-702RP", model: "SPORTAGE",
    history: [{ daysAgo: 40, mileage: 30_000, complaint: "Brake squeal at low speed", workDone: "Cleaned and greased front brake pads" }],
    repeat: { mileage: 30_320, complaint: "Brake squeal again" },
  },
  {
    key: "RPT-3", vin: "KNADEMORPT0000003", registration: "LSR-703RP", model: "SORENTO",
    history: [{ daysAgo: 6, mileage: 61_000, complaint: "Engine check light on", workDone: "Replaced oxygen sensor, cleared fault codes" }],
    repeat: { mileage: 61_150, complaint: "Engine check light back on" },
    review: { codes: ["2", "3"], remarks: "Fault was the MAF sensor, not the oxygen sensor; no road test recorded before delivery." },
  },
  {
    key: "RPT-4", vin: "KNADEMORPT0000004", registration: "LSR-704RP", model: "RIO",
    history: [{ daysAgo: 12, mileage: 18_000, complaint: "10,000 km service", workDone: "Routine service: oil, filter, inspection" }],
    repeat: { mileage: 19_900, complaint: "Front windscreen chipped by a stone" },
    review: { codes: ["0"], remarks: "Different complaint: stone chip on the windscreen, unrelated to the service." },
  },
  {
    key: "RPT-5", vin: "KNADEMORPT0000005", registration: "LSR-705RP", model: "SPORTAGE",
    history: [{ daysAgo: 120, mileage: 22_000, complaint: "Rattle from rear suspension", workDone: "Tightened rear stabiliser link" }],
    repeat: { mileage: 29_500, complaint: "Same rattle from the rear", manualOf: 0, note: "Same rattle as the stabiliser link job in the summer" },
  },
  {
    key: "RPT-6", vin: "KNADEMORPT0000006", registration: "LSR-706RP", model: "SORENTO",
    history: [{ daysAgo: 5, mileage: 40_000, complaint: "Steering wheel vibration", workDone: "Wheel balancing and alignment" }],
  },
  {
    key: "RPT-7", vin: "KNADEMORPT0000007", registration: "LSR-707RP", model: "RIO",
    history: [{ daysAgo: 60, mileage: 10_000, complaint: "Battery not holding charge", workDone: "Replaced battery" }],
  },
  {
    key: "RPT-8", vin: "KNADEMORPT0000008", registration: "LSR-708RP", model: "SPORTAGE",
    history: [
      { daysAgo: 90, mileage: 50_000, complaint: "Paid service", workDone: "Routine service" },
      { daysAgo: 3, mileage: 51_200, complaint: "Door lock fault", workDone: "", status: "CANCELLED" },
    ],
  },
];

function localAt(days: number, hour: number) {
  const date = daysAgo(days);
  date.setUTCHours(hour - 1, 0, 0, 0);
  return date;
}

async function ensureCustomer(ctx: DemoContext) {
  const existing = await prisma.customer.findUnique({ where: { code: CUSTOMER.code }, select: { id: true } });
  if (existing) return existing.id;
  const created = await new CustomerService().createCustomer({ ...CUSTOMER, country: "Nigeria", branchId: ctx.branches.main.id, createdById: ctx.staff.main.advisor.id });
  return created.id;
}

async function ensureVehicle(ctx: DemoContext, ref: Reference, scenario: Scenario, customerId: string) {
  const existing = await prisma.vehicle.findUnique({ where: { vin: scenario.vin }, select: { id: true } });
  if (existing) return existing.id;
  const model = ref.workshopModels[scenario.model];
  const created = await new VehicleService().createVehicle(
    {
      customerId,
      vin: scenario.vin,
      registrationNumber: scenario.registration,
      catalogueId: model.variantId,
      colourId: model.colourId,
      vehicleModelId: ref.warrantyModels[scenario.model],
      year: new Date().getUTCFullYear() - 4,
      ownershipStatus: "Owned",
      createdById: ctx.staff.main.advisor.id,
    },
    { requireRegistration: true },
  );
  return created.id;
}

async function engineerAtMain(ctx: DemoContext) {
  const engineer = await prisma.user.findFirst({ where: { isActive: true, branchId: ctx.branches.main.id, role: { name: ROLES.ENGINEER } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return engineer?.id ?? null;
}

/** A finished (or cancelled) earlier visit, written as history at its date. */
async function ensureVisit(ctx: DemoContext, ref: Reference, scenario: Scenario, index: number, vehicleId: string, customerId: string, engineerId: string | null) {
  const key = jobKey(`${scenario.key}-V${index + 1}`);
  const existing = await prisma.jobCard.findFirst({ where: { customField1: key }, select: { id: true } });
  if (existing) return existing.id;
  const visit = scenario.history[index];
  const staff = ctx.staff.main;
  const opened = localAt(visit.daysAgo, 9);
  const billed = visit.status === "CANCELLED" ? null : new Date(opened.getTime() + 7 * 3_600_000);
  const card = await prisma.jobCard.create({
    data: {
      jobNumber: `DM-${scenario.key}-V${index + 1}`,
      description: `${DEMO_TAG} ${visit.complaint}`,
      status: visit.status ?? "DELIVERED",
      customField1: key,
      branchId: ctx.branches.main.id,
      customerId,
      vehicleId,
      serviceTypeId: ref.serviceTypes.RR,
      bayId: ref.bayId,
      teamId: ref.teamId,
      serviceAdvisorId: staff.advisor.id,
      deliveryAdvisorId: billed ? staff.advisor.id : null,
      technicianId: staff.technician.id,
      engineerId,
      mileage: visit.mileage,
      workDone: visit.workDone || null,
      promisedAt: new Date(opened.getTime() + 8 * 3_600_000),
      warrantyStatusAtCreation: WarrantyCoverageStatus.NOT_COVERED,
      createdById: staff.advisor.id,
      createdAt: opened,
      readyAt: billed,
      billedAt: billed,
      deliveredAt: billed ? new Date(billed.getTime() + 3_600_000) : null,
      completedAt: billed,
      complaints: { create: [{ description: visit.complaint }] },
    },
  });
  await prisma.vehicle.update({ where: { id: vehicleId }, data: { lastRecordedMileage: visit.mileage, lastMileageAt: opened } });
  return card.id;
}

async function reviewer(ctx: DemoContext): Promise<RepeatActor> {
  const manager = await prisma.user.findFirst({ where: { isActive: true, branchId: ctx.branches.main.id, role: { name: ROLES.WORKSHOP_MANAGER } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return manager
    ? { userId: manager.id, role: ROLES.WORKSHOP_MANAGER, branchId: ctx.branches.main.id, allBranches: false, canReview: true }
    : { userId: ctx.admin.id, role: ROLES.ADMIN, branchId: ctx.branches.main.id, allBranches: true, canReview: true };
}

export interface RepeatSeedRow {
  key: string;
  registration: string;
  jobNumber: string | null;
  status: string;
}

export async function seedRepeat(ctx: DemoContext, ref: Reference): Promise<RepeatSeedRow[]> {
  // Legacy windows: the main branch 15 days / 500 km, Abuja 45 days / 4,000 km.
  await prisma.branchSettings.upsert({ where: { branchId: ctx.branches.main.id }, update: { repeatWindowDays: 15, repeatWindowKm: 500 }, create: { branchId: ctx.branches.main.id, repeatWindowDays: 15, repeatWindowKm: 500 } });
  await prisma.branchSettings.upsert({ where: { branchId: ctx.branches.second.id }, update: { repeatWindowDays: 45, repeatWindowKm: 4_000 }, create: { branchId: ctx.branches.second.id, repeatWindowDays: 45, repeatWindowKm: 4_000 } });

  const reasons = new Map((await prisma.workshopMaster.findMany({ where: { kind: "REPEAT_REASON" }, select: { id: true, code: true } })).map((row) => [row.code, row.id]));
  if (!reasons.has("0")) throw new Error("REPEAT_REASON codes 0–6 are missing: run the migrations (20261120100000_repeat_jobs) or the base seed.");

  const customerId = await ensureCustomer(ctx);
  const engineerId = await engineerAtMain(ctx);
  const repeats = new RepeatJobService();
  const actor = await reviewer(ctx);
  const rows: RepeatSeedRow[] = [];

  for (const scenario of SCENARIOS) {
    const vehicleId = await ensureVehicle(ctx, ref, scenario, customerId);
    const visits: string[] = [];
    for (let index = 0; index < scenario.history.length; index++) visits.push(await ensureVisit(ctx, ref, scenario, index, vehicleId, customerId, engineerId));

    if (!scenario.repeat) {
      rows.push({ key: scenario.key, registration: scenario.registration, jobNumber: null, status: "no new job: open one in the UI" });
      continue;
    }

    const key = jobKey(scenario.key);
    let card = await prisma.jobCard.findFirst({ where: { customField1: key }, select: { id: true, jobNumber: true } });
    if (!card) {
      const staff = ctx.staff.main;
      const check = await checkVehicleWarranty(vehicleId, scenario.repeat.mileage);
      const manual = scenario.repeat.manualOf !== undefined ? visits[scenario.repeat.manualOf] : undefined;
      card = await new ServiceService().createJobCard({
        serviceTypeId: ref.serviceTypes.RR,
        customerId,
        vehicleId,
        branchName: ctx.branches.main.name,
        description: scenario.repeat.complaint,
        mileage: scenario.repeat.mileage,
        bayId: ref.bayId,
        serviceAdvisorId: staff.advisor.id,
        ...(engineerId ? { engineerId } : {}),
        technicianId: staff.technician.id,
        promisedAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        complaints: [{ description: scenario.repeat.complaint }],
        warrantyAcknowledged: check.requiresAcknowledgement,
        acknowledgedCampaignIds: check.openCampaigns.map((c) => c.campaignId),
        ...(manual ? { isRepeat: true, previousJobId: manual } : {}),
        ...(scenario.repeat.note ? { repeatReason: scenario.repeat.note, ...(manual ? {} : { isRepeat: true, previousJobId: visits[visits.length - 1] }) } : {}),
        customField1: key,
        createdById: staff.advisor.id,
      });
    }

    const record = await prisma.repeatJob.findUnique({ where: { jobCardId: card.id }, select: { id: true, status: true } });
    if (record && scenario.review && record.status === "PENDING_REVIEW") {
      await repeats.review(record.id, { reasonIds: scenario.review.codes.map((code) => reasons.get(code)!), remarks: scenario.review.remarks }, actor);
    }
    const final = record ? await prisma.repeatJob.findUniqueOrThrow({ where: { id: record.id }, select: { status: true, source: true } }) : null;
    rows.push({ key: scenario.key, registration: scenario.registration, jobNumber: card.jobNumber, status: final ? `${final.source.toLowerCase()} repeat, ${final.status}` : "not flagged" });
  }
  return rows;
}
