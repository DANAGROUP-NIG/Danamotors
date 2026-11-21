/**
 * CSC demo data: vehicles at every point of the service due cycle. Earlier visits are finished
 * history written at fixed dates before the run; cases are made by the app's own generation
 * (due from 45 days ago to 30 days ahead), and the follow-ups go through the app's follow-up
 * service. Dates are relative to the day the seed runs. See doc/csc-testing-guide.md.
 *
 *   CSC-1   sold 25 days ago, never serviced          → 1F due in 5 days
 *   CSC-2   sold 80 days ago, 1F done                 → 2F due in 10 days
 *   CSC-3   sold 170 days ago, 1F and 2F done         → 3F due in 10 days
 *   CSC-4   RG 80 days ago at 30,000 km              → RG due in 10 days at 35,000 km
 *   CSC-5   RG 78 days ago                            → RG due in 12 days; 1st call made, booked in 10 days
 *   CSC-6   RG 120 days ago                           → due 30 days ago, 1st call made, not visited
 *   CSC-7   RG 110 days ago                           → due 20 days ago, never called, not visited
 *   CSC-8   RG 85 days ago, running repair 3 days ago → RG due in 5 days, already visited (early)
 *   CSC-9   RG 115 days ago                           → due 25 days ago, closed: R0004 vehicle sold (no-show)
 *   CSC-10  sold 105 days ago, 1F done                → 2F due 15 days ago, closed: R0003 not willing (no-show)
 *   CSC-11  RG 86 days ago                            → due in 4 days; 1st call closed R0001 (partial) → in the 2nd list
 *   CSC-12  RG 83 days ago at the second branch       → due in 7 days, second branch only
 *   CSC-13  RG 82 days ago                            → due in 8 days: open a job card in the UI, the case turns visited
 *   CSC-14  last visit 5 years ago                    → left out (not visited for 48 months)
 */
import { WarrantyCoverageStatus } from "@prisma/client";
import prisma from "../../../src/prisma/client";
import { CustomerService } from "../../../src/modules/customer/customer.service";
import { VehicleService } from "../../../src/modules/vehicle/vehicle.service";
import { CscService, type CscActor } from "../../../src/modules/csc/csc.service";
import { generateCases, type GenerateResult } from "../../../src/modules/csc/csc.generate";
import { addDays, localToday } from "../../../src/modules/reports/core/dates";
import { seedCscReference } from "../csc";
import { DemoContext, Reference } from "./context";
import { DEMO_TAG, jobKey, WorkshopModelKey } from "./fixtures";
import { daysAgo } from "./retime";

const CUSTOMER = {
  code: "DEMO-C41", type: "INDIVIDUAL", salutation: "Mrs.", firstName: "Amaka", lastName: "Nwosu",
  phoneNumber: "+2348099900141", email: "amaka.nwosu@demo.danamotors.test", address: "7 Example Close, Lekki Phase 1", city: "Lagos", state: "Lagos",
} as const;

type ServiceCode = "1F" | "2F" | "3F" | "RG" | "RR";
interface Visit { daysAgo: number; mileage: number; service: ServiceCode; second?: boolean }
interface FollowUp { stage: "FIRST" | "SECOND"; daysAgo: number; person: string; remarks: string; bookInDays?: number; reason?: string }
interface Scenario { key: string; vin: string; registration: string; model: WorkshopModelKey; soldDaysAgo: number | null; visits: Visit[]; followUps?: FollowUp[] }

const SCENARIOS: Scenario[] = [
  { key: "CSC-1", vin: "KNADEMOCSC0000001", registration: "LSC-101CS", model: "RIO", soldDaysAgo: 25, visits: [] },
  { key: "CSC-2", vin: "KNADEMOCSC0000002", registration: "LSC-102CS", model: "SPORTAGE", soldDaysAgo: 80, visits: [{ daysAgo: 52, mileage: 950, service: "1F" }] },
  { key: "CSC-3", vin: "KNADEMOCSC0000003", registration: "LSC-103CS", model: "SORENTO", soldDaysAgo: 170, visits: [{ daysAgo: 142, mileage: 1_020, service: "1F" }, { daysAgo: 85, mileage: 4_900, service: "2F" }] },
  { key: "CSC-4", vin: "KNADEMOCSC0000004", registration: "LSC-104CS", model: "RIO", soldDaysAgo: 1_000, visits: [{ daysAgo: 80, mileage: 30_000, service: "RG" }] },
  {
    key: "CSC-5", vin: "KNADEMOCSC0000005", registration: "LSC-105CS", model: "SPORTAGE", soldDaysAgo: 1_000, visits: [{ daysAgo: 78, mileage: 41_000, service: "RG" }],
    followUps: [{ stage: "FIRST", daysAgo: 0, person: "Owner", remarks: "Will bring the car in for its service", bookInDays: 10 }],
  },
  {
    key: "CSC-6", vin: "KNADEMOCSC0000006", registration: "LSC-106CS", model: "SORENTO", soldDaysAgo: 1_200, visits: [{ daysAgo: 120, mileage: 52_000, service: "RG" }],
    followUps: [{ stage: "FIRST", daysAgo: 44, person: "Owner", remarks: "Promised to come next week" }],
  },
  { key: "CSC-7", vin: "KNADEMOCSC0000007", registration: "LSC-107CS", model: "RIO", soldDaysAgo: 1_100, visits: [{ daysAgo: 110, mileage: 38_500, service: "RG" }] },
  { key: "CSC-8", vin: "KNADEMOCSC0000008", registration: "LSC-108CS", model: "SPORTAGE", soldDaysAgo: 900, visits: [{ daysAgo: 85, mileage: 27_000, service: "RG" }, { daysAgo: 3, mileage: 31_200, service: "RR" }] },
  {
    key: "CSC-9", vin: "KNADEMOCSC0000009", registration: "LSC-109CS", model: "SORENTO", soldDaysAgo: 1_300, visits: [{ daysAgo: 115, mileage: 60_000, service: "RG" }],
    followUps: [{ stage: "FIRST", daysAgo: 38, person: "New owner", remarks: "The car was sold in Kano last month", reason: "R0004" }],
  },
  {
    key: "CSC-10", vin: "KNADEMOCSC0000010", registration: "LSC-110CS", model: "RIO", soldDaysAgo: 105, visits: [{ daysAgo: 75, mileage: 1_100, service: "1F" }],
    followUps: [{ stage: "FIRST", daysAgo: 28, person: "Owner", remarks: "Does not want the free service", reason: "R0003" }],
  },
  {
    key: "CSC-11", vin: "KNADEMOCSC0000011", registration: "LSC-111CS", model: "SPORTAGE", soldDaysAgo: 950, visits: [{ daysAgo: 86, mileage: 33_400, service: "RG" }],
    followUps: [{ stage: "FIRST", daysAgo: 10, person: "Driver", remarks: "Owner travelling, call again", reason: "R0001" }],
  },
  { key: "CSC-12", vin: "KNADEMOCSC0000012", registration: "ABC-112CS", model: "SORENTO", soldDaysAgo: 1_000, visits: [{ daysAgo: 83, mileage: 44_000, service: "RG", second: true }] },
  { key: "CSC-13", vin: "KNADEMOCSC0000013", registration: "LSC-113CS", model: "RIO", soldDaysAgo: 1_000, visits: [{ daysAgo: 82, mileage: 25_500, service: "RG" }] },
  { key: "CSC-14", vin: "KNADEMOCSC0000014", registration: "LSC-114CS", model: "SPORTAGE", soldDaysAgo: 3_000, visits: [{ daysAgo: 1_830, mileage: 20_000, service: "RG" }] },
];

const localAt = (days: number, hour: number) => {
  const date = daysAgo(days);
  date.setUTCHours(hour - 1, 0, 0, 0);
  return date;
};

async function ensureCustomer(ctx: DemoContext) {
  const existing = await prisma.customer.findUnique({ where: { code: CUSTOMER.code }, select: { id: true } });
  if (existing) return existing.id;
  const created = await new CustomerService().createCustomer({ ...CUSTOMER, country: "Nigeria", branchId: ctx.branches.main.id, createdById: ctx.staff.main.advisor.id });
  await prisma.customer.update({ where: { id: created.id }, data: { preferredFollowupDay: "Tuesday", preferredFollowupTime: "10:00", preferredContactMethod: "Phone", contactPerson: "Mrs. Nwosu" } });
  return created.id;
}

async function ensureVehicle(ctx: DemoContext, ref: Reference, scenario: Scenario, customerId: string) {
  const existing = await prisma.vehicle.findUnique({ where: { vin: scenario.vin }, select: { id: true } });
  if (existing) return existing.id;
  const model = ref.workshopModels[scenario.model];
  const created = await new VehicleService().createVehicle(
    {
      customerId, vin: scenario.vin, registrationNumber: scenario.registration, catalogueId: model.variantId, colourId: model.colourId,
      vehicleModelId: ref.warrantyModels[scenario.model], year: new Date().getUTCFullYear() - 3, ownershipStatus: "Owned", createdById: ctx.staff.main.advisor.id,
    },
    { requireRegistration: true },
  );
  if (scenario.soldDaysAgo !== null) await prisma.vehicle.update({ where: { id: created.id }, data: { saleDate: localAt(scenario.soldDaysAgo, 12) } });
  return created.id;
}

/** A finished earlier visit, written as history at its date. */
async function ensureVisit(ctx: DemoContext, ref: Reference, services: Record<ServiceCode, string>, scenario: Scenario, index: number, vehicleId: string, customerId: string) {
  const key = jobKey(`${scenario.key}-V${index + 1}`);
  if (await prisma.jobCard.findFirst({ where: { customField1: key }, select: { id: true } })) return;
  const visit = scenario.visits[index];
  const branch = visit.second ? ctx.branches.second : ctx.branches.main;
  const staff = visit.second ? ctx.staff.second : ctx.staff.main;
  const opened = localAt(visit.daysAgo, 9);
  const billed = new Date(opened.getTime() + 7 * 3_600_000);
  await prisma.jobCard.create({
    data: {
      jobNumber: `DM-${scenario.key}-V${index + 1}`, description: `${DEMO_TAG} ${visit.service} service`, status: "DELIVERED", customField1: key,
      branchId: branch.id, customerId, vehicleId, serviceTypeId: services[visit.service], bayId: ref.bayId, teamId: ref.teamId,
      serviceAdvisorId: staff.advisor.id, deliveryAdvisorId: staff.advisor.id, technicianId: staff.technician.id, mileage: visit.mileage,
      workDone: "Routine service", promisedAt: new Date(opened.getTime() + 8 * 3_600_000), warrantyStatusAtCreation: WarrantyCoverageStatus.NOT_COVERED,
      createdById: staff.advisor.id, createdAt: opened, readyAt: billed, billedAt: billed, deliveredAt: new Date(billed.getTime() + 3_600_000), completedAt: billed,
      complaints: { create: [{ description: `${visit.service} service` }] },
    },
  });
  await prisma.vehicle.update({ where: { id: vehicleId }, data: { lastRecordedMileage: visit.mileage, lastMileageAt: opened } });
}

export interface CscSeedRow { key: string; registration: string; status: string }

export async function seedCsc(ctx: DemoContext, ref: Reference): Promise<{ generated: GenerateResult; rows: CscSeedRow[] }> {
  await seedCscReference(prisma);
  const types = await prisma.workshopMaster.findMany({ where: { kind: "SERVICE_TYPE", code: { in: ["1F", "2F", "3F", "RG", "RR"] } }, select: { id: true, code: true } });
  const services = Object.fromEntries(types.map((type) => [type.code, type.id])) as Record<ServiceCode, string>;
  for (const code of ["1F", "2F", "3F", "RG", "RR"] as ServiceCode[]) if (!services[code]) throw new Error(`Service type ${code} is missing: run the base seed.`);

  const customerId = await ensureCustomer(ctx);
  const vehicles = new Map<string, string>();
  for (const scenario of SCENARIOS) {
    const vehicleId = await ensureVehicle(ctx, ref, scenario, customerId);
    vehicles.set(scenario.key, vehicleId);
    for (let index = 0; index < scenario.visits.length; index++) await ensureVisit(ctx, ref, services, scenario, index, vehicleId, customerId);
  }

  const today = localToday();
  const generated = await generateCases({ branchId: null, from: addDays(today, -45), to: addDays(today, 30), actorId: ctx.admin.id });

  const actor: CscActor = { userId: ctx.admin.id, branchId: ctx.branches.main.id, allBranches: true, canFollowUp: true };
  const csc = new CscService();
  const reasons = new Map((await prisma.cscCloseReason.findMany({ select: { id: true, code: true } })).map((row) => [row.code, row.id]));
  const rows: CscSeedRow[] = [];
  for (const scenario of SCENARIOS) {
    const cases = await prisma.cscCase.findMany({ where: { vehicleId: vehicles.get(scenario.key) }, include: { serviceType: { select: { code: true } }, contacts: { select: { id: true } } }, orderBy: { dueDate: "desc" } });
    const found = cases[0];
    if (!found) {
      rows.push({ key: scenario.key, registration: scenario.registration, status: "no case (left out)" });
      continue;
    }
    for (const followUp of scenario.followUps ?? []) {
      if (found.status !== "OPEN" || found.contacts.length) break;
      await csc.saveFollowUp(found.id, {
        stage: followUp.stage,
        contacts: [{ slot: 1, contactDate: addDays(today, -followUp.daysAgo), contactPerson: followUp.person, remarks: followUp.remarks, doneById: ctx.staff.main.advisor.id }],
        booking: followUp.bookInDays ? { scheduledAt: localAt(-followUp.bookInDays, 10).toISOString(), notes: "Booked from the CSC call" } : null,
        closure: followUp.reason ? { reasonId: reasons.get(followUp.reason)!, remarks: followUp.remarks } : null,
      }, actor);
    }
    const final = await prisma.cscCase.findUniqueOrThrow({ where: { id: found.id }, select: { status: true, dueDate: true, bookingId: true, closeReason: { select: { code: true } } } });
    const extra = [final.bookingId ? "booked" : "", final.closeReason ? `closed ${final.closeReason.code}` : ""].filter(Boolean).join(", ");
    rows.push({ key: scenario.key, registration: scenario.registration, status: `${found.serviceType.code} due ${final.dueDate.toISOString().slice(0, 10)}, ${final.status}${extra ? ` (${extra})` : ""}` });
  }
  return { generated, rows };
}
