/**
 * PDI demo data: new vehicles (no plates) and PDI job cards at every step, built through the
 * app's own services. See doc/pdi-testing-guide.md.
 *
 *   PDI-1  open, two defect lines and tyres                  → continue it in the UI
 *   PDI-2  parts (non-warranty + warranty), a partial return,
 *          labour (FOC + paid), vehicle ready               → bill it CASH or INVOICE
 *   PDI-3  FOC parts and warranty labour, vehicle ready      → bill it ZERO
 *   PDI-4  like PDI-3 and billed ZERO                         → vehicle shows PDI done
 *   PDI-5  a new vehicle with no PDI yet                      → open a PDI from scratch
 */
import { ChargeType } from "@prisma/client";
import prisma from "../../../src/prisma/client";
import { ROLES } from "../../../src/shared/constants/roles";
import { PdiService, type PdiActor } from "../../../src/modules/pdi/pdi.service";
import { PdiBillService } from "../../../src/modules/pdi/pdi-bill.service";
import { RequisitionService } from "../../../src/modules/requisition/requisition.service";
import { ReturnSlipService } from "../../../src/modules/requisition/return-slip.service";
import { LabourSlipService } from "../../../src/modules/service/labour-slip.service";
import { LabourService } from "../../../src/modules/service/labour.service";
import { InventoryService } from "../../../src/modules/inventory/inventory.service";
import { seedPdiReference } from "../pdi";
import { DemoContext, Reference, seedLedger } from "./context";
import { DEMO_TAG, WorkshopModelKey } from "./fixtures";

const PDI_PARTS = {
  bulb: { partNumber: "DM-PDI-BULB-H4", name: "Headlamp bulb H4", partFlag: "O", partType: "S", uom: "PCS", unitPrice: 3_200, retailRate: 4_500, warrantyApplicable: true, warrantyRate: 3_800 },
  wiper: { partNumber: "DM-PDI-WIPER-24", name: "Wiper blade 24 inch", partFlag: "O", partType: "S", uom: "PCS", unitPrice: 4_100, retailRate: 6_000, warrantyApplicable: true, warrantyRate: 5_000 },
  mat: { partNumber: "DM-PDI-MAT-SET", name: "Floor mat set", partFlag: "L", partType: "A", uom: "SET", unitPrice: 12_000, retailRate: 18_000, warrantyApplicable: false, warrantyRate: null },
} as const;
const PDI_STOCK = 20;

const PDI_LABOUR = {
  inspection: { code: "DM-PDI-INSP", description: "Pre-delivery inspection", vehicleSystem: "General", group: "Maintenance", defaultHours: 1, rate: 8_000 },
  polish: { code: "DM-PDI-POLISH", description: "Paint touch-up and polish", vehicleSystem: "Body", group: "Repair", defaultHours: 1.5, rate: 6_000 },
} as const;

/** Synthetic VINs; the PDI registration is their last 6 characters. */
const VEHICLES: { key: string; vin: string; model: WorkshopModelKey; engine: string }[] = [
  { key: "PDI-1", vin: "KNADEMOPDI0000001", model: "RIO", engine: "DEMO-PDI-E1" },
  { key: "PDI-2", vin: "KNADEMOPDI0000002", model: "SPORTAGE", engine: "DEMO-PDI-E2" },
  { key: "PDI-3", vin: "KNADEMOPDI0000003", model: "SORENTO", engine: "DEMO-PDI-E3" },
  { key: "PDI-4", vin: "KNADEMOPDI0000004", model: "RIO", engine: "DEMO-PDI-E4" },
  { key: "PDI-5", vin: "KNADEMOPDI0000005", model: "SPORTAGE", engine: "DEMO-PDI-E5" },
];

async function master(kind: string, code: string) {
  const row = await prisma.workshopMaster.findUnique({ where: { kind_code: { kind, code } }, select: { id: true } });
  if (!row) throw new Error(`${kind} ${code} is missing; run the PDI reference seed`);
  return row.id;
}

export async function seedPdi(ctx: DemoContext, ref: Reference) {
  await seedPdiReference(prisma);
  const branchId = ctx.branches.main.id;
  const advisor = ctx.staff.main.advisor;
  const engineer = await prisma.user.findFirst({ where: { isActive: true, branchId, role: { name: ROLES.ENGINEER } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!engineer) throw new Error(`PDI demo needs an active ${ROLES.ENGINEER} at ${ctx.branches.main.name} (the staff seed adds engineers).`);

  // Parts and labour used only by the PDI demo, so the other demo stock figures do not move.
  const inventory = new InventoryService();
  const parts = {} as Record<keyof typeof PDI_PARTS, string>;
  for (const [key, p] of Object.entries(PDI_PARTS) as [keyof typeof PDI_PARTS, (typeof PDI_PARTS)[keyof typeof PDI_PARTS]][]) {
    const part = (await prisma.sparePart.findUnique({ where: { partNumber: p.partNumber } }))
      ?? (await prisma.sparePart.create({ data: { ...p, taxable: true } }));
    parts[key] = part.id;
    if (!(await prisma.inventoryStock.findUnique({ where: { branchId_partId: { branchId, partId: part.id } } }))) {
      await inventory.adjustStock({ branchId, partId: part.id, quantity: PDI_STOCK, type: "RECEIVED", notes: `${DEMO_TAG} PDI opening stock`, recordedById: ctx.staff.main.store.id });
      await inventory.updateStockLocation(branchId, part.id, { minimumStock: 4, rackLocation: "PDI-01" }, ctx.staff.main.store.id);
    }
  }
  const labourService = new LabourService();
  const labour = {} as Record<keyof typeof PDI_LABOUR, string>;
  for (const [key, item] of Object.entries(PDI_LABOUR) as [keyof typeof PDI_LABOUR, (typeof PDI_LABOUR)[keyof typeof PDI_LABOUR]][])
    labour[key] = ((await prisma.labourItem.findUnique({ where: { code: item.code } })) ?? (await labourService.createItem({ ...item }))).id;

  const serviceTypeId = await master("SERVICE_TYPE", "PD");
  const defects = { paint: await master("PDI_DEFECT", "PDI-PAINT"), bulb: await master("PDI_DEFECT", "PDI-BULB"), wiper: await master("PDI_DEFECT", "PDI-WIPER"), acc: await master("PDI_DEFECT", "PDI-ACC") };
  const tyreMake = await master("TYRE_MAKE", "MICHELIN");
  const batteryMakeId = await master("BATTERY_MAKE", "VARTA");

  const actor: PdiActor = { userId: advisor.id, branchId, allBranches: false };
  const docActor = { ...actor, goodwill: false, pdi: true, pdiOnly: true };
  const storeActor = { ...docActor, userId: ctx.staff.main.store.id };
  const pdi = new PdiService();
  const requisitions = new RequisitionService();
  const returns = new ReturnSlipService();
  const slips = new LabourSlipService();

  const results: { key: string; vin: string; jobNumber?: string; status?: string; bill?: string }[] = [];
  for (const v of VEHICLES) {
    const vehicle = (await prisma.vehicle.findUnique({ where: { vin: v.vin }, select: { id: true } }))
      ?? (await pdi.createVehicle({ vin: v.vin, catalogueId: ref.workshopModels[v.model].variantId, colourId: ref.workshopModels[v.model].colourId, engineNumber: v.engine, acType: "FACTORY" }, advisor.id));
    const ledgerKey = `PDI:${v.key}`;
    const existing = await prisma.jobCard.findFirst({ where: { vehicleId: vehicle.id, jobType: "PDI" }, orderBy: { createdAt: "asc" }, select: { jobNumber: true, status: true } });
    if (v.key === "PDI-5" || (await seedLedger.done(ledgerKey)) || existing) {
      results.push({ key: v.key, vin: v.vin, jobNumber: existing?.jobNumber, status: existing?.status });
      continue;
    }

    const job = await pdi.open({
      branchId, vehicleId: vehicle.id, serviceTypeId, mileage: 8 + results.length, bayId: ref.bayId, serviceAdvisorId: advisor.id, engineerId: engineer.id, teamId: ref.teamId,
      promisedAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), remarks: `${DEMO_TAG} ${v.key}`,
      defects: v.key === "PDI-1"
        ? [{ defectId: defects.paint, labour: 6_000 }, { defectId: defects.bulb, spare: 4_500, labour: 1_500 }]
        : [{ defectId: defects.bulb, spare: 4_500, labour: 1_500 }, { defectId: defects.wiper, spare: 6_000 }, { defectId: defects.acc, spare: 18_000 }],
      tyres: Array.from({ length: 4 }, (_, index) => ({ makeId: tyreMake, number: `${v.key}-T${index + 1}` })),
      batteryMakeId, batteryNumber: `${v.key}-BAT`,
    }, actor);

    if (v.key !== "PDI-1") {
      if (v.key === "PDI-2") {
        await requisitions.create({ branchId, jobCardId: job.id, chargeType: ChargeType.CUSTOMER, engineerId: engineer.id, lines: [{ sparePartId: parts.mat, quantityRequired: 1, quantityIssued: 1 }] }, storeActor);
        const warranty = await requisitions.create({ branchId, jobCardId: job.id, chargeType: ChargeType.WARRANTY, engineerId: engineer.id, pickingListNumber: "PL-DEMO-1", lines: [{ sparePartId: parts.bulb, quantityRequired: 2, quantityIssued: 2 }] }, storeActor);
        await returns.create({ requisitionId: warranty.id, lines: [{ requisitionLineId: warranty.lines[0].id, quantity: 1 }] }, storeActor);
        await slips.create({ branchId, jobCardId: job.id, groupId: ref.teamId, engineerId: engineer.id, lines: [
          { labourItemId: labour.inspection, chargeType: ChargeType.FREE, technicianId: ctx.staff.main.technician.id },
          { labourItemId: labour.polish, chargeType: ChargeType.CUSTOMER, technicianId: ctx.staff.main.technician.id },
        ] }, docActor);
      } else {
        await requisitions.create({ branchId, jobCardId: job.id, chargeType: ChargeType.FREE, engineerId: engineer.id, lines: [{ sparePartId: parts.wiper, quantityRequired: 2, quantityIssued: 2 }] }, storeActor);
        await slips.create({ branchId, jobCardId: job.id, groupId: ref.teamId, engineerId: engineer.id, lines: [{ labourItemId: labour.inspection, chargeType: ChargeType.WARRANTY, technicianId: ctx.staff.main.technician.id }] }, docActor);
      }
      await pdi.workDone(job.id, "PDI defects rectified", actor);
      await pdi.vehicleReady(job.id, "Inspection passed", actor);
    }
    let bill: string | undefined;
    if (v.key === "PDI-4") {
      const created = await new PdiBillService().create({ jobCardId: job.id, billType: "ZERO", deliveryAdvisorId: advisor.id, partsDiscountPercent: 0, labourDiscountPercent: 0, remarks: `${DEMO_TAG} zero bill` }, { ...actor, userId: ctx.staff.main.billing.id });
      bill = created.invoiceNumber;
    }
    await seedLedger.mark(ledgerKey, advisor.id);
    const after = await prisma.jobCard.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } });
    results.push({ key: v.key, vin: v.vin, jobNumber: job.jobNumber, status: after.status, bill });
  }
  return results;
}
