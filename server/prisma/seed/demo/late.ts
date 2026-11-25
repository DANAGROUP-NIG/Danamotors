/**
 * Late delivery demo data (promised date / time discrepancy): finished jobs written directly as
 * history at fixed dates in January 2026, so the reports give the same figures whenever the seed runs.
 * Times are Lagos local. See doc/late-deliveries-testing-guide.md.
 *
 *   LATE-1  promised 05 Jan 17:00, delivered 06 Jan 10:30  → late by date, 1 day, no reason yet
 *   LATE-2  promised 05 Jan 17:00, delivered 08 Jan 11:00  → late by date, 3 days, reason 2, remark
 *   LATE-3  promised 07 Jan 23:00, delivered 08 Jan 00:30  → late by date (just after midnight), 1 day, reason 3
 *   LATE-4  promised 12 Jan 17:00, delivered 12 Jan 18:15  → late by time, 75 min, no reason yet
 *   LATE-5  promised 12 Jan 12:00, delivered 12 Jan 16:30  → late by time, 270 min, reasons 1 + 6
 *   LATE-6  promised 14 Jan 17:00, delivered 14 Jan 16:00  → on time
 *   LATE-7  promised 14 Jan 17:00, delivered 14 Jan 17:00  → on time (exactly)
 *   LATE-8  promised 20 Jan 17:00, not delivered (ready)   → in no report
 *   LATE-9  promised 21 Jan 17:00, delivered 23 Jan 09:00  → late by date, 2 days, reason 2 (free service)
 *   LATE-10 second branch, promised 06 Jan, delivered 09 Jan → late by date: only that branch sees it
 */
import { stageColumns } from "./stage";
import { WarrantyCoverageStatus } from "@prisma/client";
import prisma from "../../../src/prisma/client";
import { CustomerService } from "../../../src/modules/customer/customer.service";
import { VehicleService } from "../../../src/modules/vehicle/vehicle.service";
import { BranchKey, DEMO_TAG, jobKey, ServiceTypeCode, WorkshopModelKey } from "./fixtures";
import { DemoContext, Reference } from "./context";

const CUSTOMERS: Record<BranchKey, { code: string; firstName: string; lastName: string; phoneNumber: string; email: string; city: string; state: string }> = {
  main: { code: "DEMO-C51", firstName: "Bisi", lastName: "Adeyemi", phoneNumber: "+2348099900151", email: "bisi.adeyemi@demo.danamotors.test", city: "Lagos", state: "Lagos" },
  second: { code: "DEMO-C52", firstName: "Musa", lastName: "Garba", phoneNumber: "+2348099900152", email: "musa.garba@demo.danamotors.test", city: "Abuja", state: "FCT" },
};

interface Scenario {
  key: string;
  branch: BranchKey;
  vin: string;
  registration: string;
  model: WorkshopModelKey;
  serviceType: ServiceTypeCode;
  /** Lagos local "YYYY-MM-DD HH:mm". */
  promised: string;
  delivered: string | null;
  reasonCodes?: string[];
  remarks?: string;
}

const SCENARIOS: Scenario[] = [
  { key: "LATE-1", branch: "main", vin: "KNADEMOLATE000001", registration: "LSL-801LD", model: "RIO", serviceType: "RR", promised: "2026-01-05 17:00", delivered: "2026-01-06 10:30" },
  {
    key: "LATE-2", branch: "main", vin: "KNADEMOLATE000002", registration: "LSL-802LD", model: "SPORTAGE", serviceType: "RR", promised: "2026-01-05 17:00", delivered: "2026-01-08 11:00",
    reasonCodes: ["2"], remarks: "Front shock absorbers came from the main store two days late.",
  },
  { key: "LATE-3", branch: "main", vin: "KNADEMOLATE000003", registration: "LSL-803LD", model: "SORENTO", serviceType: "RR", promised: "2026-01-07 23:00", delivered: "2026-01-08 00:30", reasonCodes: ["3"] },
  { key: "LATE-4", branch: "main", vin: "KNADEMOLATE000004", registration: "LSL-804LD", model: "RIO", serviceType: "RR", promised: "2026-01-12 17:00", delivered: "2026-01-12 18:15" },
  {
    key: "LATE-5", branch: "main", vin: "KNADEMOLATE000005", registration: "LSL-805LD", model: "SPORTAGE", serviceType: "RR", promised: "2026-01-12 12:00", delivered: "2026-01-12 16:30",
    reasonCodes: ["1", "6"], remarks: "Engineer on leave; job waited in the open-time queue.",
  },
  { key: "LATE-6", branch: "main", vin: "KNADEMOLATE000006", registration: "LSL-806LD", model: "SORENTO", serviceType: "RR", promised: "2026-01-14 17:00", delivered: "2026-01-14 16:00" },
  { key: "LATE-7", branch: "main", vin: "KNADEMOLATE000007", registration: "LSL-807LD", model: "RIO", serviceType: "RR", promised: "2026-01-14 17:00", delivered: "2026-01-14 17:00" },
  { key: "LATE-8", branch: "main", vin: "KNADEMOLATE000008", registration: "LSL-808LD", model: "SPORTAGE", serviceType: "RR", promised: "2026-01-20 17:00", delivered: null },
  { key: "LATE-9", branch: "main", vin: "KNADEMOLATE000009", registration: "LSL-809LD", model: "RIO", serviceType: "RG", promised: "2026-01-21 17:00", delivered: "2026-01-23 09:00", reasonCodes: ["2"] },
  { key: "LATE-10", branch: "second", vin: "KNADEMOLATE000010", registration: "ABJ-810LD", model: "SORENTO", serviceType: "RR", promised: "2026-01-06 17:00", delivered: "2026-01-09 12:00", reasonCodes: ["4"] },
];

/** Lagos is UTC+1 all year (no DST). */
const lagos = (value: string) => new Date(`${value.replace(" ", "T")}:00+01:00`);

async function ensureCustomer(ctx: DemoContext, branch: BranchKey) {
  const fixture = CUSTOMERS[branch];
  const existing = await prisma.customer.findUnique({ where: { code: fixture.code }, select: { id: true } });
  if (existing) return existing.id;
  const created = await new CustomerService().createCustomer({
    ...fixture, type: "INDIVIDUAL", salutation: "Mr.", address: "Demo address", country: "Nigeria", branchId: ctx.branches[branch].id, createdById: ctx.staff[branch].advisor.id,
  });
  return created.id;
}

async function ensureVehicle(ctx: DemoContext, ref: Reference, scenario: Scenario, customerId: string) {
  const existing = await prisma.vehicle.findUnique({ where: { vin: scenario.vin }, select: { id: true } });
  if (existing) return existing.id;
  const model = ref.workshopModels[scenario.model];
  const created = await new VehicleService().createVehicle(
    {
      customerId, vin: scenario.vin, registrationNumber: scenario.registration, catalogueId: model.variantId, colourId: model.colourId,
      vehicleModelId: ref.warrantyModels[scenario.model], year: 2022, ownershipStatus: "Owned", createdById: ctx.staff[scenario.branch].advisor.id,
    },
    { requireRegistration: true },
  );
  return created.id;
}

export interface LateSeedRow {
  key: string;
  registration: string;
  jobNumber: string;
  outcome: string;
}

export async function seedLate(ctx: DemoContext, ref: Reference): Promise<LateSeedRow[]> {
  const reasons = new Map((await prisma.workshopMaster.findMany({ where: { kind: "LATE_REASON" }, select: { id: true, code: true } })).map((row) => [row.code, row.id]));
  if (!["1", "2", "3", "4", "5", "6"].every((code) => reasons.has(code)))
    throw new Error("LATE_REASON codes 1-6 are missing: run the migrations (20261122100000_late_deliveries) or the base seed.");

  const customers = { main: await ensureCustomer(ctx, "main"), second: await ensureCustomer(ctx, "second") };
  const rows: LateSeedRow[] = [];
  for (const scenario of SCENARIOS) {
    const vehicleId = await ensureVehicle(ctx, ref, scenario, customers[scenario.branch]);
    const key = jobKey(scenario.key);
    const promisedAt = lagos(scenario.promised);
    const deliveredAt = scenario.delivered ? lagos(scenario.delivered) : null;
    const staff = ctx.staff[scenario.branch];
    const opened = new Date(promisedAt.getTime() - 8 * 3_600_000);
    const billedAt = deliveredAt ? new Date(Math.min(deliveredAt.getTime(), promisedAt.getTime()) - 1_800_000) : null;
    const card =
      (await prisma.jobCard.findFirst({ where: { customField1: key }, select: { jobNumber: true } })) ??
      (await prisma.jobCard.create({
        data: {
          jobNumber: `DM-${scenario.key}`,
          description: `${DEMO_TAG} Late delivery demo (${scenario.key})`,
          status: deliveredAt ? "DELIVERED" : "READY",
          ...stageColumns(deliveredAt ? "DELIVERED" : "READY"),
          customField1: key,
          branchId: ctx.branches[scenario.branch].id,
          customerId: customers[scenario.branch],
          vehicleId,
          serviceTypeId: ref.serviceTypes[scenario.serviceType],
          bayId: ref.bayId,
          teamId: ref.teamId,
          serviceAdvisorId: staff.advisor.id,
          deliveryAdvisorId: deliveredAt ? staff.advisor.id : null,
          technicianId: staff.technician.id,
          mileage: 20_000 + SCENARIOS.indexOf(scenario) * 1_000,
          workDone: "Routine service and checks",
          promisedAt,
          warrantyStatusAtCreation: WarrantyCoverageStatus.NOT_COVERED,
          createdById: staff.advisor.id,
          createdAt: opened,
          readyAt: billedAt ?? new Date(promisedAt.getTime() - 3_600_000),
          billedAt,
          completedAt: billedAt,
          deliveredAt,
          lateReasonIds: (scenario.reasonCodes ?? []).map((code) => reasons.get(code)!),
          lateRemarks: scenario.remarks ?? null,
          complaints: { create: [{ description: "Routine service" }] },
        },
        select: { jobNumber: true },
      }));
    const outcome = !scenario.delivered
      ? "not delivered"
      : scenario.reasonCodes?.length
        ? `delivered ${scenario.delivered}, reasons ${scenario.reasonCodes.join(", ")}`
        : `delivered ${scenario.delivered}`;
    rows.push({ key: scenario.key, registration: scenario.registration, jobNumber: card.jobNumber, outcome: `promised ${scenario.promised}, ${outcome}` });
  }
  return rows;
}
