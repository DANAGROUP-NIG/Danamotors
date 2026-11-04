import prisma from "../../../src/prisma/client";
import { ROLES } from "../../../src/shared/constants/roles";
import { LabourService } from "../../../src/modules/service/labour.service";
import { InventoryService } from "../../../src/modules/inventory/inventory.service";
import { seedServiceTypes } from "../service-type-data";
import { assertDemoBranch } from "./guard";
import {
  BranchKey,
  DEMO_TAG,
  LABOUR,
  LabourKey,
  PARTS,
  PartKey,
  ServiceTypeCode,
  WARRANTY_CODES,
  WARRANTY_MODELS,
  WORKSHOP_MODELS,
  WorkshopModelKey,
} from "./fixtures";

export interface Staff {
  id: string;
  email: string;
}

export interface BranchStaff {
  advisor: Staff;
  technician: Staff;
  /** Issues parts: a store user at the branch, else the general store manager, else the advisor. */
  store: Staff;
  /** Creates bills and receipts: a billing officer at the branch, else the advisor. */
  billing: Staff;
}

export interface DemoContext {
  branches: Record<BranchKey, { id: string; name: string }>;
  staff: Record<BranchKey, BranchStaff>;
  warrantyOfficer: Staff;
  /** Admin who approves delivery on credit. */
  admin: Staff;
}

export interface Reference {
  bayId: string;
  teamId: string;
  serviceTypes: Record<ServiceTypeCode, string>;
  workshopModels: Record<WorkshopModelKey, { modelId: string; variantId: string; colourId: string }>;
  warrantyModels: Record<WorkshopModelKey, string>;
  parts: Record<PartKey, string>;
  labour: Record<LabourKey, string>;
  codes: { complaint: Record<string, string>; defect: Record<string, string>; position: Record<string, string>; reject: Record<string, string> };
}

const staffSelect = { id: true, email: true } as const;

function findStaff(roles: string[], branchId?: string) {
  return prisma.user.findFirst({
    where: { isActive: true, role: { name: { in: roles } }, ...(branchId && { branchId }) },
    orderBy: [{ createdAt: "asc" }, { email: "asc" }],
    select: staffSelect,
  });
}

/**
 * Finds the branches and the existing staff the seed acts as. Read-only: the seed never
 * creates or changes user accounts, so missing roles are reported instead.
 */
export async function loadContext(branchNames: Record<BranchKey, string>): Promise<DemoContext> {
  const branches = {} as DemoContext["branches"];
  for (const key of ["main", "second"] as const) {
    assertDemoBranch({ name: branchNames[key], code: null });
    const branch = await prisma.branch.findFirst({ where: { name: branchNames[key], isActive: true }, select: { id: true, name: true, code: true } });
    if (!branch) throw new Error(`Active branch "${branchNames[key]}" not found. Pass the Demo branch names with --main-branch / --second-branch.`);
    assertDemoBranch(branch);
    branches[key] = { id: branch.id, name: branch.name };
  }
  if (branches.main.id === branches.second.id) throw new Error("The main and second branch must be different.");

  const missing: string[] = [];
  const need = (who: string, user: Staff | null) => {
    if (!user) missing.push(who);
    return user as Staff;
  };
  const staff = {} as DemoContext["staff"];
  for (const key of ["main", "second"] as const) {
    const { id, name } = branches[key];
    const advisor = need(`${ROLES.SERVICE_ADVISOR} at ${name}`, await findStaff([ROLES.SERVICE_ADVISOR], id));
    const technician = need(`${ROLES.TECHNICIAN} at ${name}`, await findStaff([ROLES.TECHNICIAN], id));
    const store =
      (await findStaff([ROLES.BRANCH_STORE_MANAGER, ROLES.GENERAL_STORE_MANAGER], id)) ??
      (await findStaff([ROLES.GENERAL_STORE_MANAGER])) ??
      advisor;
    const billing = (await findStaff([ROLES.BILLING_OFFICER], id)) ?? advisor;
    staff[key] = { advisor, technician, store, billing };
  }
  const warrantyOfficer = need(ROLES.WARRANTY_OFFICER, await findStaff([ROLES.WARRANTY_OFFICER]));
  const admin = need(`${ROLES.ADMIN} or ${ROLES.SUPER_ADMIN}`, (await findStaff([ROLES.ADMIN], branches.main.id)) ?? (await findStaff([ROLES.SUPER_ADMIN])));
  if (missing.length) {
    throw new Error(`The demo seed acts as existing staff and never creates users. Missing active users: ${missing.join("; ")}.`);
  }
  return { branches, staff, warrantyOfficer, admin };
}

/** Records the seed created through a plain upsert are reference data; existing rows are never changed. */
async function master(kind: string, code: string, description: string, extra: Record<string, unknown> = {}) {
  return prisma.workshopMaster.upsert({
    where: { kind_code: { kind, code } },
    update: {},
    create: { kind, code, description, ...extra },
  });
}

async function activeMaster(kind: string, fallback: { code: string; description: string; category?: string }) {
  const existing = await prisma.workshopMaster.findFirst({ where: { kind, active: true }, orderBy: { code: "asc" } });
  return existing ?? master(kind, fallback.code, fallback.description, fallback.category ? { category: fallback.category } : {});
}

async function codeIds<T extends { code: string; id: string }>(
  rows: readonly (readonly [string, string])[],
  upsert: (code: string, description: string) => Promise<T>,
) {
  const ids: Record<string, string> = {};
  for (const [code, description] of rows) ids[code] = (await upsert(code, description)).id;
  return ids;
}

export async function ensureReference(ctx: DemoContext): Promise<Reference> {
  // Workshop catalogue: service charges come from ServiceTypeModelSetting on the MODEL.
  const make = await master("MAKE", "KIA", "Kia");
  const product = await master("PRODUCT", "KIA-P", "Passenger", { parentId: make.id });
  const workshopModels = {} as Reference["workshopModels"];
  for (const [key, m] of Object.entries(WORKSHOP_MODELS) as [WorkshopModelKey, (typeof WORKSHOP_MODELS)[WorkshopModelKey]][]) {
    const model = await master("MODEL", m.model.code, m.model.description, { parentId: product.id });
    const variant = await master("VARIANT", m.variant.code, m.variant.description, { parentId: model.id, fuel: "Petrol", gearbox: "Automatic", acFitted: true });
    const colour = await master("COLOUR", m.colour.code, m.colour.description, { parentId: model.id });
    await seedServiceTypes(prisma, model.id);
    workshopModels[key] = { modelId: model.id, variantId: variant.id, colourId: colour.id };
  }
  const bay = await activeMaster("BAY", { code: "A1", description: "Bay A1", category: "A" });
  const team = await activeMaster("TEAM", { code: "A", description: "Workshop team A" });
  const serviceTypes = {} as Reference["serviceTypes"];
  for (const code of ["RG", "RR"] as const) {
    const row = await prisma.workshopMaster.findFirst({ where: { kind: "SERVICE_TYPE", code, active: true } });
    if (!row) throw new Error(`Service type ${code} is missing or inactive.`);
    serviceTypes[code] = row.id;
  }

  // Warranty policies, matched by code or by make and model name.
  const warrantyModels = {} as Reference["warrantyModels"];
  for (const [key, m] of Object.entries(WARRANTY_MODELS) as [WorkshopModelKey, (typeof WARRANTY_MODELS)[WorkshopModelKey]][]) {
    const existing = await prisma.vehicleModel.findFirst({ where: { OR: [{ code: m.code }, { make: "Kia", name: m.name }] } });
    warrantyModels[key] = (existing ?? (await prisma.vehicleModel.create({ data: { ...m, make: "Kia", warrantyCovered: true } }))).id;
  }

  const codes = {
    complaint: await codeIds(WARRANTY_CODES.complaint, (code, description) => prisma.warrantyComplaintCode.upsert({ where: { code }, update: {}, create: { code, description } })),
    defect: await codeIds(WARRANTY_CODES.defect, (code, description) => prisma.warrantyDefectCode.upsert({ where: { code }, update: {}, create: { code, description } })),
    position: await codeIds(WARRANTY_CODES.position, (code, description) => prisma.warrantyPositionCode.upsert({ where: { code }, update: {}, create: { code, description } })),
    reject: await codeIds(WARRANTY_CODES.reject, (code, description) => prisma.warrantyRejectReason.upsert({ where: { code }, update: {}, create: { code, description } })),
  };

  const labourService = new LabourService();
  const labour = {} as Reference["labour"];
  for (const [key, item] of Object.entries(LABOUR) as [LabourKey, (typeof LABOUR)[LabourKey]][]) {
    const existing = await prisma.labourItem.findUnique({ where: { code: item.code } });
    labour[key] = (existing ?? (await labourService.createItem({ ...item }))).id;
  }

  // Parts and their opening stock. Stock enters through the normal stock movement
  // (a RECEIVED transaction), and only when the branch has no stock row for the part yet.
  const inventory = new InventoryService();
  const parts = {} as Reference["parts"];
  for (const [key, p] of Object.entries(PARTS) as [PartKey, (typeof PARTS)[PartKey]][]) {
    const { stock, warrantyRate, ...fields } = p as (typeof PARTS)[PartKey] & { warrantyRate?: number };
    const part =
      (await prisma.sparePart.findUnique({ where: { partNumber: p.partNumber } })) ??
      (await prisma.sparePart.create({
        data: { ...fields, warrantyRate: warrantyRate ?? null, description: `${p.name} (demo data)`, taxable: true, binLocation: stock.main.rack },
      }));
    parts[key] = part.id;
    for (const branchKey of ["main", "second"] as const) {
      const branchId = ctx.branches[branchKey].id;
      const level = stock[branchKey];
      if (await prisma.inventoryStock.findUnique({ where: { branchId_partId: { branchId, partId: part.id } } })) continue;
      const recordedById = ctx.staff[branchKey].store.id;
      await inventory.adjustStock({ branchId, partId: part.id, quantity: level.quantity, type: "RECEIVED", notes: `${DEMO_TAG} opening stock`, recordedById });
      await inventory.updateStockLocation(branchId, part.id, { minimumStock: level.minimum, rackLocation: level.rack }, recordedById);
    }
  }

  return { bayId: bay.id, teamId: team.id, serviceTypes, workshopModels, warrantyModels, parts, labour, codes };
}

/** The seed's own ledger: one audit row per finished scenario, so a finished scenario is never re-run over testers' changes. */
export const seedLedger = {
  async done(key: string) {
    return Boolean(await prisma.auditLog.findFirst({ where: { action: "DEMO_SEED_COMPLETED", details: key }, select: { id: true } }));
  },
  async mark(key: string, userId: string) {
    await prisma.auditLog.create({ data: { action: "DEMO_SEED_COMPLETED", details: key, userId } });
  },
};
