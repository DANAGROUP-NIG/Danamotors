import { ChargeType, Prisma } from "@prisma/client";
import prisma from "../../../src/prisma/client";
import { ROLES } from "../../../src/shared/constants/roles";
import { CustomerService } from "../../../src/modules/customer/customer.service";
import { VehicleService } from "../../../src/modules/vehicle/vehicle.service";
import { LabourService } from "../../../src/modules/service/labour.service";
import { InventoryService } from "../../../src/modules/inventory/inventory.service";
import { calculateJobBillTotals } from "../../../src/modules/finance/job-bill-calculator";
import { lineAmount } from "../../../src/modules/finance/money";
import { BranchKey, DEMO_TAG, jobKey, LABOUR, WorkshopModelKey } from "./fixtures";
import { DemoContext, Reference, Staff } from "./context";
import { daysAgo } from "./retime";

/**
 * Service MIS demo data (#97): finished job history for the 15 MIS reports. Each job card here is
 * a closed record from the past, so it is written directly with its labour, requisitions, part
 * issues (with their stock movements), a part return, complaints and the bill, at fixed dates
 * before the run. Live workflows (estimates, signatures, billing) are covered by the other demo jobs.
 *
 * Covers: every service category (free, paid, running repair, accidental, PDI), two engineers
 * with labour in two service groups (maintenance and body repair), oil, an accessory, a late
 * delivery, a repeat job, a warranty requisition, a returned part, a coded major complaint and a
 * free-text one, a second-branch job for the all-branches MIR, two vehicles sold 60 and 75 days
 * ago (one did its first free service, one skipped it), an owner change, and customers with a
 * birthday and anniversary this month (and one over the year end).
 */

const VAT_RATE = 7.5;

const MIS_PARTS = {
  oilFilter: { partNumber: "26300-DM035", name: "Oil filter", category: "Filters", partFlag: "O", partType: "S", uom: "PCS", unitPrice: 4_800, retailRate: 6_200, warrantyApplicable: true, warrantyRate: 5_400 },
  engineOil: { partNumber: "LOC-EO5W30-MIS", name: "Engine oil 5W-30, 4 litres", category: "Lubricants", partFlag: "L", partType: "O", uom: "CAN", unitPrice: 21_000, retailRate: 27_500, warrantyApplicable: false },
  brakePads: { partNumber: "58101-DM100", name: "Front brake pad set", category: "Brakes", partFlag: "O", partType: "S", uom: "SET", unitPrice: 18_000, retailRate: 24_000, warrantyApplicable: true, warrantyRate: 21_000 },
  bumper: { partNumber: "86511-DM200", name: "Front bumper cover", category: "Body", partFlag: "O", partType: "S", uom: "PCS", unitPrice: 95_000, retailRate: 128_000, warrantyApplicable: false },
  mudFlaps: { partNumber: "ACC-MUDFLAP-DM", name: "Mud flap set", category: "Accessories", partFlag: "O", partType: "A", uom: "SET", unitPrice: 9_000, retailRate: 12_500, warrantyApplicable: false },
} as const;
type MisPart = keyof typeof MIS_PARTS;

const BODY_LABOUR = { code: "DM-BODY-PNT", description: "Panel beating and paint (per panel)", vehicleSystem: "Body", defaultHours: 3, rate: 15_000 } as const;

const COMPLAINTS = {
  engineNoise: { code: "DM-EN01", description: "ENGINE KNOCKING NOISE", major: true },
  brakeSqueal: { code: "DM-BR02", description: "BRAKE SQUEAL", major: false },
} as const;

/** Day and month in the run's month, so the birthday report's default range (this month) finds them. */
function thisMonth(day: number, year: number) {
  const month = new Date().getUTCMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const MIS_CUSTOMERS = {
  eze: {
    code: "DEMO-C21", type: "INDIVIDUAL", salutation: "Mrs.", firstName: "Ngozi", lastName: "Eze",
    phoneNumber: "+2348099900121", email: "ngozi.eze@demo.danamotors.test", address: "3 Sample Avenue, Lekki", city: "Lagos", state: "Lagos", branch: "main",
    birthday: thisMonth(15, 1986), anniversary: thisMonth(20, 2012),
  },
  bakare: {
    code: "DEMO-C22", type: "INDIVIDUAL", salutation: "Mr.", firstName: "Tunde", lastName: "Bakare",
    phoneNumber: "+2348099900122", email: "tunde.bakare@demo.danamotors.test", address: "21 Example Street, Yaba", city: "Lagos", state: "Lagos", branch: "main",
    // Over the year end: found by 01 Dec – 31 Jan.
    birthday: "1979-12-24", anniversary: "2008-01-05",
  },
  sule: {
    code: "DEMO-C23", type: "INDIVIDUAL", salutation: "Ms.", firstName: "Halima", lastName: "Sule",
    phoneNumber: "+2348099900123", email: "halima.sule@demo.danamotors.test", address: "9 Demo Road, Surulere", city: "Lagos", state: "Lagos", branch: "main",
  },
  ogun: {
    code: "DEMO-C24", type: "INDIVIDUAL", salutation: "Mr.", firstName: "Bayo", lastName: "Ogun",
    phoneNumber: "+2348099900124", email: "bayo.ogun@demo.danamotors.test", address: "5 Model Close, Garki", city: "Abuja", state: "FCT", branch: "second",
  },
} as const;
type MisCustomer = keyof typeof MIS_CUSTOMERS;

const MIS_VEHICLES = {
  // Sold 60 days ago; the first free service was done 25 days after the sale.
  rioServiced: { vin: "KNADN51DMT7000501", registrationNumber: "LSR-501MS", customer: "eze", model: "RIO", saleDaysAgo: 60 },
  // Sold 75 days ago; never had its first free service (due within 30 days / 1,000 km).
  rioSkipped: { vin: "KNADN51DMT7000502", registrationNumber: "LSR-502MS", customer: "bakare", model: "RIO", saleDaysAgo: 75 },
  // Sold to Mr Bakare, then resold to Ms Sule 10 days ago.
  sportage: { vin: "KNAPX81DMT7000503", registrationNumber: "LSR-503MS", customer: "bakare", model: "SPORTAGE", saleDaysAgo: 200 },
  // Unsold stock vehicle: its PDI is the PDI job.
  stock: { vin: "KNAPM81DMT7000504", registrationNumber: null, customer: null, model: "SORENTO", saleDaysAgo: null },
  abuja: { vin: "KNAPX81DMT7000505", registrationNumber: "ABJ-505MS", customer: "ogun", model: "SPORTAGE", saleDaysAgo: 400 },
} as const;
type MisVehicle = keyof typeof MIS_VEHICLES;

interface PartLine {
  part: MisPart;
  quantity: number;
  /** Quantity returned on a return slip after the issue. */
  returned?: number;
  returnReason?: string;
}

interface MisJobFixture {
  id: string;
  branch: BranchKey;
  vehicle: MisVehicle;
  serviceType: string;
  engineer: 0 | 1;
  /** Opened this many days before the run (local 09:00). */
  openedDaysAgo: number;
  mileage: number;
  /** null = still open (not billed or delivered). */
  close: { hoursToDeliver: number; late: boolean } | null;
  labour: { item: keyof typeof LABOUR | "body"; hours: number }[];
  parts?: PartLine[];
  chargeType?: ChargeType;
  serviceCharge?: number;
  labourDiscountPercent?: number;
  complaints?: { code?: keyof typeof COMPLAINTS; text: string }[];
  repeatOf?: string;
  /** Company-paid (free service, PDI): no customer bill. */
  noBill?: boolean;
}

const MIS_JOBS: MisJobFixture[] = [
  {
    id: "MIS-01", branch: "main", vehicle: "rioServiced", serviceType: "1F", engineer: 0, openedDaysAgo: 35, mileage: 850,
    close: { hoursToDeliver: 5, late: false }, labour: [{ item: "service", hours: 1.5 }],
    parts: [{ part: "oilFilter", quantity: 1 }, { part: "engineOil", quantity: 1 }], chargeType: ChargeType.FREE, noBill: true,
  },
  {
    id: "MIS-02", branch: "main", vehicle: "sportage", serviceType: "RG", engineer: 0, openedDaysAgo: 30, mileage: 20_400,
    close: { hoursToDeliver: 26, late: true }, labour: [{ item: "service", hours: 1.5 }, { item: "diagnosis", hours: 0.5 }],
    parts: [{ part: "oilFilter", quantity: 1 }, { part: "engineOil", quantity: 1 }], serviceCharge: 15_100, labourDiscountPercent: 10,
  },
  {
    id: "MIS-03", branch: "main", vehicle: "rioSkipped", serviceType: "RR", engineer: 1, openedDaysAgo: 20, mileage: 1_800,
    close: { hoursToDeliver: 6, late: false }, labour: [{ item: "general", hours: 2 }, { item: "body", hours: 1 }],
    parts: [{ part: "brakePads", quantity: 2, returned: 1, returnReason: "Second set not needed" }],
    complaints: [{ code: "engineNoise", text: "Knocking from the engine at idle" }, { text: "Squeaky rear door" }],
  },
  {
    id: "MIS-04", branch: "main", vehicle: "rioServiced", serviceType: "AC", engineer: 1, openedDaysAgo: 12, mileage: 2_100,
    close: { hoursToDeliver: 30, late: false }, labour: [{ item: "body", hours: 3 }],
    parts: [{ part: "bumper", quantity: 1 }, { part: "mudFlaps", quantity: 1 }],
  },
  {
    id: "MIS-05", branch: "main", vehicle: "rioSkipped", serviceType: "RR", engineer: 1, openedDaysAgo: 8, mileage: 1_950,
    close: { hoursToDeliver: 4, late: false }, labour: [{ item: "general", hours: 1 }],
    parts: [{ part: "brakePads", quantity: 1 }], chargeType: ChargeType.WARRANTY, repeatOf: "MIS-03",
    complaints: [{ code: "brakeSqueal", text: "Brake noise came back" }],
  },
  {
    id: "MIS-06", branch: "main", vehicle: "stock", serviceType: "PD", engineer: 0, openedDaysAgo: 5, mileage: 12,
    close: { hoursToDeliver: 3, late: false }, labour: [{ item: "general", hours: 1 }], noBill: true,
  },
  {
    id: "MIS-07", branch: "second", vehicle: "abuja", serviceType: "RG", engineer: 0, openedDaysAgo: 15, mileage: 41_000,
    close: { hoursToDeliver: 5, late: false }, labour: [{ item: "service", hours: 1.5 }], parts: [{ part: "engineOil", quantity: 1 }], serviceCharge: 15_100,
  },
  {
    id: "MIS-08", branch: "main", vehicle: "sportage", serviceType: "RG", engineer: 0, openedDaysAgo: 2, mileage: 21_050,
    close: null, labour: [{ item: "diagnosis", hours: 0.5 }],
  },
];

/** A local (WAT) time `days` before the run. */
function localAt(days: number, hour: number) {
  const date = daysAgo(days);
  date.setUTCHours(hour - 1, 0, 0, 0);
  return date;
}

async function master(kind: string, code: string, description: string, extra: Partial<Prisma.WorkshopMasterUncheckedCreateInput> = {}) {
  return prisma.workshopMaster.upsert({ where: { kind_code: { kind, code } }, update: {}, create: { kind, code, description, ...extra } });
}

async function engineersAt(ctx: DemoContext, branch: BranchKey): Promise<Staff[]> {
  const engineers = await prisma.user.findMany({
    where: { isActive: true, branchId: ctx.branches[branch].id, role: { name: ROLES.ENGINEER } },
    orderBy: [{ createdAt: "asc" }, { email: "asc" }],
    select: { id: true, email: true },
    take: 2,
  });
  if (engineers.length === 0) {
    console.log(`  No ${ROLES.ENGINEER} user at ${ctx.branches[branch].name}: MIS jobs name the technician as engineer (run the staff seed to add engineers).`);
    return [ctx.staff[branch].technician, ctx.staff[branch].technician];
  }
  return [engineers[0], engineers[1] ?? engineers[0]];
}

async function ensureMisReference(ctx: DemoContext, ref: Reference) {
  // Service groups: the migration creates MAINT, SERV and BODY when a database has none.
  const groups = await prisma.workshopMaster.findMany({ where: { kind: "VEHICLE_GROUP", active: true }, select: { id: true, code: true, attributes: true } });
  const body = groups.find((group) => (group.attributes as { bodyRepair?: boolean } | null)?.bodyRepair) ?? groups.find((group) => group.code === "BODY");
  const maintenance = groups.find((group) => group.code === "MAINT") ?? groups.find((group) => group.id !== body?.id);
  if (!body || !maintenance) throw new Error("Service groups (VEHICLE_GROUP masters) are missing: run the database migrations first.");

  // The demo labour operations belong to maintenance; panel work to body repair.
  await prisma.labourItem.updateMany({ where: { code: { in: Object.values(LABOUR).map((item) => item.code) }, serviceGroupId: null }, data: { serviceGroupId: maintenance.id } });
  const bodyLabour =
    (await prisma.labourItem.findUnique({ where: { code: BODY_LABOUR.code } })) ??
    (await new LabourService().createItem({ ...BODY_LABOUR, group: undefined, serviceGroupId: body.id }));
  const labour = { ...ref.labour, body: bodyLabour.id } as Record<keyof typeof LABOUR | "body", string>;

  const complaints = {} as Record<keyof typeof COMPLAINTS, string>;
  for (const [key, complaint] of Object.entries(COMPLAINTS) as [keyof typeof COMPLAINTS, (typeof COMPLAINTS)[keyof typeof COMPLAINTS]][]) {
    complaints[key] = (await master("COMPLAINT", complaint.code, complaint.description, { parentId: maintenance.id, attributes: { majorDefect: complaint.major } })).id;
  }

  const inventory = new InventoryService();
  const parts = {} as Record<MisPart, { id: string; partFlag: string; retailRate: number; warrantyRate: number | null; name: string }>;
  for (const [key, p] of Object.entries(MIS_PARTS) as [MisPart, (typeof MIS_PARTS)[MisPart]][]) {
    const fields = { ...p, warrantyRate: "warrantyRate" in p ? p.warrantyRate : null };
    const part =
      (await prisma.sparePart.findUnique({ where: { partNumber: p.partNumber } })) ??
      (await prisma.sparePart.create({ data: { ...fields, description: `${p.name} (demo data)`, taxable: true, binLocation: "MIS-01" } }));
    parts[key] = { id: part.id, partFlag: part.partFlag, retailRate: part.retailRate ?? part.unitPrice, warrantyRate: part.warrantyRate, name: part.name };
    for (const branchKey of ["main", "second"] as const) {
      const branchId = ctx.branches[branchKey].id;
      if (await prisma.inventoryStock.findUnique({ where: { branchId_partId: { branchId, partId: part.id } } })) continue;
      await inventory.adjustStock({ branchId, partId: part.id, quantity: branchKey === "main" ? 30 : 10, type: "RECEIVED", notes: `${DEMO_TAG} MIS opening stock`, recordedById: ctx.staff[branchKey].store.id });
    }
  }

  const serviceTypes: Record<string, string> = {};
  for (const code of new Set(MIS_JOBS.map((job) => job.serviceType))) {
    const row = await prisma.workshopMaster.findFirst({ where: { kind: "SERVICE_TYPE", code }, select: { id: true } });
    if (!row) throw new Error(`Service type ${code} is missing.`);
    serviceTypes[code] = row.id;
  }
  const engineers = { main: await engineersAt(ctx, "main"), second: await engineersAt(ctx, "second") };
  return { labour, complaints, parts, serviceTypes, engineers };
}

async function ensureMisParties(ctx: DemoContext, ref: Reference) {
  const customerService = new CustomerService();
  const customers = {} as Record<MisCustomer, string>;
  for (const [key, c] of Object.entries(MIS_CUSTOMERS) as [MisCustomer, (typeof MIS_CUSTOMERS)[MisCustomer]][]) {
    const existing = await prisma.customer.findUnique({ where: { code: c.code }, select: { id: true } });
    const { branch, ...rest } = c;
    const { birthday, anniversary, ...fields } = { birthday: undefined, anniversary: undefined, ...rest } as typeof rest & { birthday?: string; anniversary?: string };
    customers[key] =
      existing?.id ??
      (
        await customerService.createCustomer({
          ...fields,
          country: "Nigeria",
          branchId: ctx.branches[branch].id,
          createdById: ctx.staff[branch].advisor.id,
          ...(birthday && { dateOfBirth: `${birthday}T00:00:00.000Z` }),
          ...(anniversary && { anniversaryDate: anniversary }),
        })
      ).id;
  }

  const vehicleService = new VehicleService();
  const vehicles = {} as Record<MisVehicle, { id: string; customerId: string | null }>;
  for (const [key, v] of Object.entries(MIS_VEHICLES) as [MisVehicle, (typeof MIS_VEHICLES)[MisVehicle]][]) {
    const existing = await prisma.vehicle.findUnique({ where: { vin: v.vin }, select: { id: true } });
    const customerId = v.customer ? customers[v.customer] : null;
    if (existing) {
      vehicles[key] = { id: existing.id, customerId };
      continue;
    }
    const model = ref.workshopModels[v.model as WorkshopModelKey];
    const saleDate = v.saleDaysAgo === null ? null : localAt(v.saleDaysAgo, 1);
    const created = await vehicleService.createVehicle({
      customerId,
      vin: v.vin,
      registrationNumber: v.registrationNumber,
      catalogueId: model.variantId,
      colourId: model.colourId,
      vehicleModelId: ref.warrantyModels[v.model as WorkshopModelKey],
      year: new Date().getUTCFullYear(),
      saleDate: saleDate?.toISOString() ?? null,
      pdiDone: saleDate !== null,
      pdiDate: v.saleDaysAgo === null ? undefined : localAt(v.saleDaysAgo + 3, 10).toISOString(),
      sellingDealer: saleDate ? "Dana Motors (demo)" : undefined,
      ownershipStatus: customerId ? "Owned" : undefined,
      createdById: ctx.staff.main.advisor.id,
    });
    vehicles[key] = { id: created.id, customerId };
  }
  return { customers, vehicles };
}

type MisReference = Awaited<ReturnType<typeof ensureMisReference>>;
type MisParties = Awaited<ReturnType<typeof ensureMisParties>>;

/** One finished (or open) job card with all its records, in one transaction. */
async function seedMisJob(ctx: DemoContext, ref: Reference, mis: MisReference, parties: MisParties, fx: MisJobFixture, done: Map<string, string>) {
  const key = jobKey(fx.id);
  const existing = await prisma.jobCard.findFirst({ where: { customField1: key }, select: { id: true, jobNumber: true } });
  if (existing) return existing;

  const branchId = ctx.branches[fx.branch].id;
  const staff = ctx.staff[fx.branch];
  const engineer = mis.engineers[fx.branch][fx.engineer];
  const vehicle = parties.vehicles[fx.vehicle];
  const opened = localAt(fx.openedDaysAgo, 9);
  const promised = fx.close ? new Date(opened.getTime() + (fx.close.hoursToDeliver - (fx.close.late ? 20 : -1)) * 3_600_000) : new Date(opened.getTime() + 48 * 3_600_000);
  const delivered = fx.close ? new Date(opened.getTime() + fx.close.hoursToDeliver * 3_600_000) : null;
  const billed = delivered ? new Date(delivered.getTime() - 3_600_000) : null;
  const chargeType = fx.chargeType ?? ChargeType.CUSTOMER;
  const inWarranty = MIS_VEHICLES[fx.vehicle].saleDaysAgo !== null;

  const job = await prisma.$transaction(async (tx) => {
    const card = await tx.jobCard.create({
      data: {
        jobNumber: `DM-${fx.id}`,
        description: `${DEMO_TAG} MIS demo job ${fx.id}`,
        status: fx.close ? "DELIVERED" : "IN_PROGRESS",
        customField1: key,
        branchId,
        customerId: vehicle.customerId,
        vehicleId: vehicle.id,
        serviceTypeId: mis.serviceTypes[fx.serviceType],
        bayId: ref.bayId,
        teamId: ref.teamId,
        serviceAdvisorId: staff.advisor.id,
        deliveryAdvisorId: fx.close ? staff.advisor.id : null,
        technicianId: staff.technician.id,
        engineerId: engineer.id,
        mileage: fx.mileage,
        promisedAt: promised,
        isRepeat: Boolean(fx.repeatOf),
        previousJobId: fx.repeatOf ? done.get(fx.repeatOf) : null,
        repeatReason: fx.repeatOf ? "Same complaint within 30 days" : null,
        warrantyStatusAtCreation: inWarranty ? "ACTIVE" : "NOT_COVERED",
        serviceCharge: fx.serviceCharge ?? null,
        createdById: staff.advisor.id,
        createdAt: opened,
        readyAt: billed,
        billedAt: billed,
        deliveredAt: delivered,
        completedAt: billed,
      },
    });

    for (const complaint of fx.complaints ?? [])
      await tx.jobComplaint.create({ data: { jobCardId: card.id, complaintCodeId: complaint.code ? mis.complaints[complaint.code] : null, description: complaint.text } });

    let labourTotal = new Prisma.Decimal(0);
    for (const line of fx.labour) {
      const labourItem = await tx.labourItem.findUniqueOrThrow({ where: { id: mis.labour[line.item] } });
      const amount = lineAmount(line.hours, labourItem.rate);
      labourTotal = labourTotal.plus(amount);
      await tx.jobCardLabour.create({
        data: { jobCardId: card.id, labourItemId: labourItem.id, description: labourItem.description, hours: line.hours, standardHours: line.hours, rate: labourItem.rate, amount, technicianId: staff.technician.id, createdAt: opened },
      });
    }

    let customerParts = new Prisma.Decimal(0);
    if (fx.parts?.length) {
      const requisitionAt = new Date(opened.getTime() + 3_600_000);
      const requisition = await tx.partRequisition.create({
        data: { requisitionNumber: `DM-RQ-${fx.id}`, requisitionDate: requisitionAt, branchId, jobCardId: card.id, chargeType, engineerId: engineer.id, status: "ISSUED", createdById: staff.store.id, createdAt: requisitionAt },
      });
      for (const line of fx.parts) {
        const part = mis.parts[line.part];
        const rate = chargeType === ChargeType.WARRANTY ? part.warrantyRate ?? part.retailRate : part.retailRate;
        const issuance = await tx.partIssuance.create({ data: { branchId, sparePartId: part.id, jobCardId: card.id, issuedById: staff.store.id, quantity: line.quantity, partSource: part.partFlag, issuedAt: requisitionAt, notes: `${DEMO_TAG} ${fx.id}` } });
        const amount = lineAmount(line.quantity, rate);
        const customerAmount = chargeType === ChargeType.CUSTOMER ? amount : 0;
        const requisitionLine = await tx.partRequisitionLine.create({
          data: {
            requisitionId: requisition.id, sparePartId: part.id, partIssuanceId: issuance.id, partSource: part.partFlag, description: part.name,
            quantityRequired: line.quantity, quantityIssued: line.quantity, rate, amount, approvedAmount: amount - customerAmount, customerAmount,
          },
        });
        const net = line.quantity - (line.returned ?? 0);
        const netAmount = lineAmount(net, rate);
        await tx.jobCardLine.create({
          data: { jobCardId: card.id, kind: "PART", sparePartId: part.id, requisitionLineId: requisitionLine.id, description: part.name, partSource: part.partFlag, quantity: net, rate, amount: netAmount, taxable: true, chargeType, createdById: staff.store.id },
        });
        if (chargeType === ChargeType.CUSTOMER) customerParts = customerParts.plus(netAmount);
        await tx.inventoryStock.update({ where: { branchId_partId: { branchId, partId: part.id } }, data: { quantity: { decrement: net } } });
        await tx.stockTransaction.create({ data: { branchId, partId: part.id, type: "ISSUED", quantity: -line.quantity, referenceId: issuance.id, recordedById: staff.store.id, notes: `${DEMO_TAG} requisition DM-RQ-${fx.id}`, createdAt: requisitionAt } });

        if (line.returned) {
          const returnedAt = new Date(requisitionAt.getTime() + 2 * 3_600_000);
          const slip = await tx.partReturnSlip.create({ data: { returnNumber: `DM-RT-${fx.id}`, returnDate: returnedAt, branchId, jobCardId: card.id, requisitionId: requisition.id, status: "COMPLETED", createdById: staff.store.id, createdAt: returnedAt } });
          const returned = await tx.partReturn.create({
            data: { returnSlipId: slip.id, requisitionLineId: requisitionLine.id, partIssuanceId: issuance.id, returnedById: staff.store.id, quantity: line.returned, reason: line.returnReason, returnedAt, status: "Completed", rate, amount: lineAmount(line.returned, rate) },
          });
          await tx.stockTransaction.create({ data: { branchId, partId: part.id, type: "RETURNED", quantity: line.returned, referenceId: returned.id, recordedById: staff.store.id, notes: `${DEMO_TAG} return slip DM-RT-${fx.id}`, createdAt: returnedAt } });
        }
      }
    }

    if (billed && !fx.noBill && vehicle.customerId) {
      const totals = calculateJobBillTotals({
        partsTotal: customerParts.toNumber(),
        labourTotal: labourTotal.toNumber(),
        serviceTotal: fx.serviceCharge ?? 0,
        partsDiscountPercent: 0,
        labourDiscountPercent: fx.labourDiscountPercent ?? 0,
        vatRate: VAT_RATE,
      });
      await tx.invoice.create({
        data: {
          invoiceNumber: `DM-INV-${fx.id}`,
          customerId: vehicle.customerId,
          jobCardId: card.id,
          reportBranchId: branchId,
          billType: "CASH",
          issuedDate: billed,
          dueDate: billed,
          subtotal: totals.partsTotal + totals.labourTotal + totals.serviceTotal - totals.partsDiscountAmount - totals.labourDiscountAmount,
          tax: totals.vatAmount,
          total: totals.total,
          partsTotal: totals.partsTotal,
          labourTotal: totals.labourTotal,
          serviceTotal: totals.serviceTotal,
          partsDiscountPercent: 0,
          labourDiscountPercent: fx.labourDiscountPercent ?? 0,
          partsDiscountAmount: totals.partsDiscountAmount,
          labourDiscountAmount: totals.labourDiscountAmount,
          vatRate: VAT_RATE,
          vatAmount: totals.vatAmount,
          roundOff: totals.roundOff,
          outstandingAmount: totals.total,
          serviceAdvisorId: staff.advisor.id,
          status: "Unpaid",
          notes: `${DEMO_TAG} MIS demo bill`,
          createdAt: billed,
        },
      });
    }
    return card;
  });
  return { id: job.id, jobNumber: job.jobNumber };
}

export async function seedMis(ctx: DemoContext, ref: Reference) {
  const mis = await ensureMisReference(ctx, ref);
  const parties = await ensureMisParties(ctx, ref);
  console.log("MIS reference data ready: service groups, body labour, complaint codes, parts, customers and vehicles");

  const done = new Map<string, string>();
  for (const fx of MIS_JOBS) {
    const job = await seedMisJob(ctx, ref, mis, parties, fx, done);
    done.set(fx.id, job.id);
    console.log(`  ${fx.id} ... job card ${job.jobNumber}`);
  }

  // Owner change 10 days ago (vehicle resale history), recorded by the main branch admin.
  const sportage = parties.vehicles.sportage.id;
  const newOwner = parties.customers.sule;
  if (!(await prisma.vehicleOwnership.findFirst({ where: { vehicleId: sportage, customerId: newOwner } }))) {
    await new VehicleService().addVehicleOwnership(sportage, { customerId: newOwner, ownershipType: "Resale", purchaseDate: localAt(10, 12).toISOString() }, ctx.admin.id);
    console.log("  Owner change: LSR-503MS resold to Halima Sule");
  }
}
