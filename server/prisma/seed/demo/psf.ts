/**
 * Post-service follow-up (PSF) demo data: delivered jobs written directly as history at fixed dates in
 * February 2026, with follow-up calls at fixed times, so the PSF screens and reports give the same
 * figures whenever the seed runs. Times are Lagos local. See doc/psf-testing-guide.md.
 *
 *   PSF-1   Rio (LSL-901PF)       RR, AC regas + car wash   delivered 02 Feb → not followed up
 *   PSF-2   Sportage (LSL-902PF)  RR, engine overhaul + AC  delivered 03 Feb → not available, then satisfied
 *   PSF-3   Sorento (LSL-903PF)   RR, AC regas              delivered 04 Feb → dissatisfied (AC line)
 *   PSF-4   Rio (LSL-904PF)       RG                        delivered 05 Feb → dissatisfied, then closed
 *   PSF-5   Sportage (LSL-905PF)  RR, AC regas              delivered 06 Feb → no phone (customer has no phone)
 *   PSF-6   Sorento (LSL-906PF)   AC (accidental)           delivered 09 Feb → not followed up
 *   PSF-7   Rio (LSL-901PF)       RR, engine overhaul       delivered 10 Feb → not available (same Rio as PSF-1)
 *   PSF-8   Sportage (LSL-902PF)  RR                        not delivered    → never followed up
 *   PSF-9   second branch Sorento RR                        delivered 03 Feb → satisfied (only that branch sees it)
 *   PSF-10  Sportage (LSL-902PF)  RG, AC regas              delivered 12 Feb → satisfied
 *   PSF-11  Rio (LSL-911PF)       RR                        delivered 13 Feb → not followed up (no phone, no address)
 */
import { stageColumns } from "./stage";
import type { PsfStatus } from "@prisma/client";
import { WarrantyCoverageStatus } from "@prisma/client";
import prisma from "../../../src/prisma/client";
import { VehicleService } from "../../../src/modules/vehicle/vehicle.service";
import { BranchKey, DEMO_TAG, jobKey, WorkshopModelKey } from "./fixtures";
import { DemoContext, Reference } from "./context";

type CustomerKey = "C61" | "C62" | "C63" | "C64" | "C65";

/** C62 and C65 have no phone; C65 has no address either. */
const CUSTOMERS: Record<CustomerKey, { branch: BranchKey; firstName: string; lastName: string; phoneNumber: string | null; mobile2?: string; address: string | null; city: string; state: string }> = {
  C61: { branch: "main", firstName: "Ifeoma", lastName: "Nwosu", phoneNumber: "+2348099900161", mobile2: "+2348099900261", address: "14 Allen Avenue", city: "Ikeja", state: "Lagos" },
  C62: { branch: "main", firstName: "Tunde", lastName: "Bakare", phoneNumber: null, address: "3 Admiralty Way", city: "Lekki", state: "Lagos" },
  C63: { branch: "main", firstName: "Halima", lastName: "Sani", phoneNumber: "+2348099900163", address: "22 Bode Thomas Street", city: "Surulere", state: "Lagos" },
  C64: { branch: "second", firstName: "Emeka", lastName: "Obi", phoneNumber: "+2348099900164", address: "5 Aminu Kano Crescent", city: "Wuse", state: "FCT" },
  C65: { branch: "main", firstName: "Grace", lastName: "Udo", phoneNumber: null, address: null, city: "Ikeja", state: "Lagos" },
};

type LabourKey = "ac" | "engine" | "wash";

/** Labour for the PSF demo: AC regas (followed up), engine overhaul (major), car wash (not followed up). */
const LABOUR: Record<LabourKey, { code: string; description: string; followUpAnalysis: boolean; majorLabour: boolean; rate: number }> = {
  ac: { code: "DM-PSF-AC", description: "AC regas and leak test", followUpAnalysis: true, majorLabour: false, rate: 15_000 },
  engine: { code: "DM-PSF-ENG", description: "Engine overhaul", followUpAnalysis: true, majorLabour: true, rate: 120_000 },
  wash: { code: "DM-PSF-WASH", description: "Car wash", followUpAnalysis: false, majorLabour: false, rate: 3_000 },
};

interface Call {
  /** Lagos local "YYYY-MM-DD HH:mm". */
  at: string;
  status: PsfStatus;
  remark: string;
  /** Line statuses by labour key (the service line is "service"); default = the call status. */
  lines?: Partial<Record<LabourKey | "service", PsfStatus>>;
}

interface Scenario {
  key: string;
  branch: BranchKey;
  customer: CustomerKey;
  vin: string;
  registration: string;
  model: WorkshopModelKey;
  serviceType: "RG" | "RR" | "AC";
  labour: LabourKey[];
  delivered: string | null;
  calls: Call[];
}

const SCENARIOS: Scenario[] = [
  { key: "PSF-1", branch: "main", customer: "C61", vin: "KNADEMOPSF0000001", registration: "LSL-901PF", model: "RIO", serviceType: "RR", labour: ["ac", "wash"], delivered: "2026-02-02 10:00", calls: [] },
  {
    key: "PSF-2", branch: "main", customer: "C61", vin: "KNADEMOPSF0000002", registration: "LSL-902PF", model: "SPORTAGE", serviceType: "RR", labour: ["engine", "ac"], delivered: "2026-02-03 11:00",
    calls: [
      { at: "2026-02-04 10:00", status: "NOT_AVAILABLE", remark: "Customer not available" },
      { at: "2026-02-05 09:30", status: "SATISFIED", remark: "Customer satisfied" },
    ],
  },
  {
    key: "PSF-3", branch: "main", customer: "C63", vin: "KNADEMOPSF0000003", registration: "LSL-903PF", model: "SORENTO", serviceType: "RR", labour: ["ac"], delivered: "2026-02-04 15:00",
    calls: [{ at: "2026-02-05 11:00", status: "DISSATISFIED", remark: "AC still blowing warm air after the regas", lines: { service: "SATISFIED", ac: "DISSATISFIED" } }],
  },
  {
    key: "PSF-4", branch: "main", customer: "C61", vin: "KNADEMOPSF0000004", registration: "LSL-904PF", model: "RIO", serviceType: "RG", labour: [], delivered: "2026-02-05 12:00",
    calls: [
      { at: "2026-02-06 10:00", status: "DISSATISFIED", remark: "Car was returned dirty inside" },
      { at: "2026-02-09 14:00", status: "CLOSED", remark: "Service manager apologised; free valet at the next visit" },
    ],
  },
  {
    key: "PSF-5", branch: "main", customer: "C62", vin: "KNADEMOPSF0000005", registration: "LSL-905PF", model: "SPORTAGE", serviceType: "RR", labour: ["ac"], delivered: "2026-02-06 16:00",
    calls: [{ at: "2026-02-07 10:00", status: "NO_PHONE", remark: "No phone number on the customer record" }],
  },
  { key: "PSF-6", branch: "main", customer: "C61", vin: "KNADEMOPSF0000006", registration: "LSL-906PF", model: "SORENTO", serviceType: "AC", labour: [], delivered: "2026-02-09 12:00", calls: [] },
  {
    key: "PSF-7", branch: "main", customer: "C61", vin: "KNADEMOPSF0000001", registration: "LSL-901PF", model: "RIO", serviceType: "RR", labour: ["engine"], delivered: "2026-02-10 17:00",
    calls: [{ at: "2026-02-11 10:00", status: "NOT_AVAILABLE", remark: "Rang twice, no answer" }],
  },
  { key: "PSF-8", branch: "main", customer: "C61", vin: "KNADEMOPSF0000002", registration: "LSL-902PF", model: "SPORTAGE", serviceType: "RR", labour: [], delivered: null, calls: [] },
  {
    key: "PSF-9", branch: "second", customer: "C64", vin: "KNADEMOPSF0000009", registration: "ABJ-909PF", model: "SORENTO", serviceType: "RR", labour: [], delivered: "2026-02-03 13:00",
    calls: [{ at: "2026-02-04 12:00", status: "SATISFIED", remark: "Customer satisfied" }],
  },
  {
    key: "PSF-10", branch: "main", customer: "C61", vin: "KNADEMOPSF0000002", registration: "LSL-902PF", model: "SPORTAGE", serviceType: "RG", labour: ["ac"], delivered: "2026-02-12 10:00",
    calls: [{ at: "2026-02-13 09:00", status: "SATISFIED", remark: "Customer satisfied" }],
  },
  { key: "PSF-11", branch: "main", customer: "C65", vin: "KNADEMOPSF0000011", registration: "LSL-911PF", model: "RIO", serviceType: "RR", labour: [], delivered: "2026-02-13 11:00", calls: [] },
];

/** Lagos is UTC+1 all year (no DST). */
const lagos = (value: string) => new Date(`${value.replace(" ", "T")}:00+01:00`);

async function ensureCustomer(ctx: DemoContext, key: CustomerKey) {
  const code = `DEMO-${key}`;
  const existing = await prisma.customer.findUnique({ where: { code }, select: { id: true } });
  if (existing) return existing.id;
  const { branch, ...fixture } = CUSTOMERS[key];
  // Written directly: the customer service asks for a phone, and two of these customers deliberately have none.
  const created = await prisma.customer.create({
    data: {
      ...fixture, code, type: "INDIVIDUAL", salutation: "Mx.", country: "Nigeria", email: `${key.toLowerCase()}.psf@demo.danamotors.test`,
      preferredFollowupDay: key === "C61" ? "Monday" : null, preferredFollowupTime: key === "C61" ? "Morning (9 to 12)" : null, preferredContactMethod: key === "C61" ? "Phone" : null,
      branchId: ctx.branches[branch].id, createdById: ctx.staff[branch].advisor.id,
    },
    select: { id: true },
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

/** The labour items and the accidental service type (AC, category ACCIDENTAL), created when missing; existing ones are not changed. */
async function ensurePsfReference() {
  const labour = {} as Record<LabourKey, string>;
  for (const [key, item] of Object.entries(LABOUR) as [LabourKey, (typeof LABOUR)[LabourKey]][]) {
    const row = await prisma.labourItem.upsert({
      where: { code: item.code },
      update: {},
      create: { ...item, defaultHours: 1, vehicleSystem: "General", group: "General" },
      select: { id: true },
    });
    labour[key] = row.id;
  }
  const accidental =
    (await prisma.workshopMaster.findFirst({ where: { kind: "SERVICE_TYPE", code: "AC" }, select: { id: true } })) ??
    (await prisma.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: "AC", description: "Accidental repair", category: "ACCIDENTAL", active: true }, select: { id: true } }));
  return { labour, accidental: accidental.id };
}

export interface PsfSeedRow {
  key: string;
  registration: string;
  jobNumber: string;
  outcome: string;
}

export async function seedPsf(ctx: DemoContext, ref: Reference): Promise<PsfSeedRow[]> {
  const psfRef = await ensurePsfReference();
  const customers = {} as Record<CustomerKey, string>;
  for (const key of Object.keys(CUSTOMERS) as CustomerKey[]) customers[key] = await ensureCustomer(ctx, key);

  const rows: PsfSeedRow[] = [];
  for (const [index, scenario] of SCENARIOS.entries()) {
    const vehicleId = await ensureVehicle(ctx, ref, scenario, customers[scenario.customer]);
    const key = jobKey(scenario.key);
    const deliveredAt = scenario.delivered ? lagos(scenario.delivered) : null;
    const opened = deliveredAt ? new Date(deliveredAt.getTime() - 9 * 3_600_000) : lagos("2026-02-13 08:00");
    const staff = ctx.staff[scenario.branch];
    const serviceTypeId = scenario.serviceType === "AC" ? psfRef.accidental : ref.serviceTypes[scenario.serviceType];
    const card =
      (await prisma.jobCard.findFirst({ where: { customField1: key }, select: { id: true, jobNumber: true } })) ??
      (await prisma.jobCard.create({
        data: {
          jobNumber: `DM-${scenario.key}`,
          description: `${DEMO_TAG} Post-service follow-up demo (${scenario.key})`,
          status: deliveredAt ? "DELIVERED" : "READY",
          ...stageColumns(deliveredAt ? "DELIVERED" : "READY"),
          customField1: key,
          branchId: ctx.branches[scenario.branch].id,
          customerId: customers[scenario.customer],
          vehicleId,
          serviceTypeId,
          bayId: ref.bayId,
          teamId: ref.teamId,
          serviceAdvisorId: staff.advisor.id,
          deliveryAdvisorId: deliveredAt ? staff.advisor.id : null,
          technicianId: staff.technician.id,
          mileage: 30_000 + index * 1_500,
          workDone: "Work as listed",
          promisedAt: deliveredAt ?? lagos("2026-02-13 17:00"),
          warrantyStatusAtCreation: WarrantyCoverageStatus.NOT_COVERED,
          createdById: staff.advisor.id,
          createdAt: opened,
          readyAt: deliveredAt ? new Date(deliveredAt.getTime() - 3_600_000) : lagos("2026-02-13 16:00"),
          billedAt: deliveredAt ? new Date(deliveredAt.getTime() - 1_800_000) : null,
          completedAt: deliveredAt ? new Date(deliveredAt.getTime() - 1_800_000) : null,
          deliveredAt,
          complaints: { create: [{ description: "Customer request" }] },
          labourLines: {
            create: scenario.labour.map((labourKey, position) => ({
              labourItemId: psfRef.labour[labourKey],
              description: LABOUR[labourKey].description,
              hours: 1,
              rate: LABOUR[labourKey].rate,
              amount: LABOUR[labourKey].rate,
              createdAt: new Date(opened.getTime() + position * 60_000),
            })),
          },
        },
        select: { id: true, jobNumber: true },
      }));
    await seedCalls(card.id, scenario, ctx.staff[scenario.branch].advisor.id);
    const outcome = !deliveredAt ? "not delivered" : scenario.calls.length ? scenario.calls.map((call) => call.status.toLowerCase().replace("_", " ")).join(", then ") : "not followed up";
    rows.push({ key: scenario.key, registration: scenario.registration, jobNumber: card.jobNumber, outcome: `${scenario.delivered ? `delivered ${scenario.delivered}, ` : ""}${outcome}` });
  }
  return rows;
}

/** Writes the scenario's calls once (a job that already has a follow-up is left as the tester changed it). */
async function seedCalls(jobCardId: string, scenario: Scenario, callerId: string) {
  if (!scenario.calls.length || (await prisma.psfFollowUp.findUnique({ where: { jobCardId }, select: { id: true } }))) return;
  const job = await prisma.jobCard.findUniqueOrThrow({
    where: { id: jobCardId },
    select: {
      branchId: true, customerId: true, vehicleId: true,
      serviceType: { select: { code: true, description: true } },
      labourLines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, description: true, labourItem: { select: { code: true, followUpAnalysis: true } } } },
    },
  });
  const labourKeyOf = (code: string) => (Object.entries(LABOUR) as [LabourKey, (typeof LABOUR)[LabourKey]][]).find(([, item]) => item.code === code)?.[0];
  const lines = [
    ...(job.serviceType ? [{ kind: "SERVICE" as const, jobCardLabourId: null, code: job.serviceType.code, description: job.serviceType.description, key: "service" as const }] : []),
    ...job.labourLines
      .filter((line) => line.labourItem.followUpAnalysis)
      .map((line) => ({ kind: "LABOUR" as const, jobCardLabourId: line.id, code: line.labourItem.code, description: line.description, key: labourKeyOf(line.labourItem.code) })),
  ];
  const last = scenario.calls[scenario.calls.length - 1];
  await prisma.$transaction(async (tx) => {
    const followUp = await tx.psfFollowUp.create({
      data: { jobCardId, branchId: job.branchId, customerId: job.customerId, vehicleId: job.vehicleId, status: last.status, remark: last.remark, lastCalledAt: lagos(last.at), lastCalledById: callerId, callCount: scenario.calls.length },
      select: { id: true },
    });
    let lastCallId = "";
    for (const call of scenario.calls) {
      const created = await tx.psfCall.create({
        data: {
          followUpId: followUp.id, status: call.status, remark: call.remark, calledAt: lagos(call.at), createdAt: lagos(call.at), calledById: callerId,
          lines: { create: lines.map((line, position) => ({ kind: line.kind, jobCardLabourId: line.jobCardLabourId, code: line.code, description: line.description, status: (line.key && call.lines?.[line.key]) || call.status, position })) },
        },
        select: { id: true },
      });
      lastCallId = created.id;
    }
    await tx.psfFollowUp.update({
      where: { id: followUp.id },
      data: { lastCallId, ...(last.status === "CLOSED" ? { closedAt: lagos(last.at), closedById: callerId } : {}) },
    });
  });
}
