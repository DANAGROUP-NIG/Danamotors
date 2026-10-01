import { Prisma, WarrantyOverrideType } from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { checkVehicleWarranty } from "./warranty.coverage";

export type CodeType = "complaint" | "defect" | "position" | "reject";

export interface CodeInput {
  code: string;
  description: string;
  isActive?: boolean;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export class WarrantySettingsService {
  // ── Vehicle models ───────────────────────────────────────────────────────

  async listModels(params: { search?: string; includeInactive?: boolean } = {}) {
    const q = params.search ? { contains: params.search, mode: "insensitive" as const } : undefined;
    const models = await prisma.vehicleModel.findMany({
      where: {
        ...(params.includeInactive ? {} : { isActive: true }),
        ...(q && { OR: [{ code: q }, { name: q }, { make: q }] }),
      },
      orderBy: [{ make: "asc" }, { name: "asc" }],
      include: { _count: { select: { vehicles: true } } },
    });
    return models.map(({ _count, ...m }) => ({ ...m, vehiclesLinked: _count.vehicles }));
  }

  async createModel(data: {
    code: string;
    make?: string;
    name: string;
    warrantyDays?: number | null;
    warrantyKm?: number | null;
    warrantyCovered?: boolean;
  }) {
    try {
      return await prisma.vehicleModel.create({
        data: { ...data, code: data.code.trim().toUpperCase(), make: data.make?.trim() || "Kia", name: data.name.trim() },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("A model with this code or name already exists");
      throw error;
    }
  }

  async updateModel(
    id: string,
    data: {
      code?: string;
      make?: string;
      name?: string;
      warrantyDays?: number | null;
      warrantyKm?: number | null;
      warrantyCovered?: boolean;
      isActive?: boolean;
    },
  ) {
    const existing = await prisma.vehicleModel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Vehicle model not found");
    try {
      return await prisma.vehicleModel.update({
        where: { id },
        data: { ...data, ...(data.code && { code: data.code.trim().toUpperCase() }), ...(data.name && { name: data.name.trim() }) },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("A model with this code or name already exists");
      throw error;
    }
  }

  // ── Claim codes ──────────────────────────────────────────────────────────

  async listCodes(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };
    const orderBy = { code: "asc" as const };
    const [complaint, defect, position, reject] = await Promise.all([
      prisma.warrantyComplaintCode.findMany({ where, orderBy }),
      prisma.warrantyDefectCode.findMany({ where, orderBy }),
      prisma.warrantyPositionCode.findMany({ where, orderBy }),
      prisma.warrantyRejectReason.findMany({ where, orderBy }),
    ]);
    return { complaint, defect, position, reject };
  }

  async createCode(type: CodeType, input: CodeInput) {
    const data = { code: input.code.trim().toUpperCase(), description: input.description.trim(), isActive: input.isActive ?? true };
    try {
      switch (type) {
        case "complaint":
          return await prisma.warrantyComplaintCode.create({ data });
        case "defect":
          return await prisma.warrantyDefectCode.create({ data });
        case "position":
          return await prisma.warrantyPositionCode.create({ data });
        case "reject":
          return await prisma.warrantyRejectReason.create({ data });
      }
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(`Code ${data.code} already exists`);
      throw error;
    }
  }

  async updateCode(type: CodeType, id: string, input: Partial<CodeInput>) {
    const data = {
      ...(input.code !== undefined && { code: input.code.trim().toUpperCase() }),
      ...(input.description !== undefined && { description: input.description.trim() }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    };
    try {
      switch (type) {
        case "complaint":
          return await prisma.warrantyComplaintCode.update({ where: { id }, data });
        case "defect":
          return await prisma.warrantyDefectCode.update({ where: { id }, data });
        case "position":
          return await prisma.warrantyPositionCode.update({ where: { id }, data });
        case "reject":
          return await prisma.warrantyRejectReason.update({ where: { id }, data });
      }
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("That code already exists");
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new NotFoundError("Code not found");
      throw error;
    }
  }

  // ── Part search for claim lines ───────────────────────────────────────────

  async searchParts(search: string, applicableOnly: boolean) {
    const q = { contains: search.trim(), mode: "insensitive" as const };
    return prisma.sparePart.findMany({
      where: {
        partStatus: "ACTIVE",
        ...(applicableOnly && { warrantyApplicable: true }),
        OR: [{ partNumber: q }, { name: q }, { partCode: q }],
      },
      select: { id: true, partNumber: true, name: true, warrantyApplicable: true, warrantyRate: true, retailRate: true, unitPrice: true },
      orderBy: [{ warrantyApplicable: "desc" }, { partNumber: "asc" }],
      take: 20,
    });
  }

  // ── Vehicle warranty data ────────────────────────────────────────────────

  /**
   * Updates a vehicle's warranty inputs. `override: null` removes an extended
   * warranty or goodwill. Permission checks (warranty:update vs warranty:settings)
   * are done by the controller.
   */
  async updateVehicleWarranty(
    vehicleId: string,
    data: {
      vehicleModelId?: string | null;
      warrantyStartDate?: Date | null;
      override?: { type: WarrantyOverrideType; until?: Date | null; km?: number | null; reason: string } | null;
    },
  ) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
    if (!vehicle) throw new NotFoundError("Vehicle not found");
    if (data.vehicleModelId) {
      const model = await prisma.vehicleModel.findUnique({ where: { id: data.vehicleModelId }, select: { isActive: true } });
      if (!model?.isActive) throw new BadRequestError("Choose an active vehicle model");
    }
    if (data.warrantyStartDate && data.warrantyStartDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new BadRequestError("The warranty start date cannot be in the future");
    }
    const update: Prisma.VehicleUncheckedUpdateInput = {};
    if (data.vehicleModelId !== undefined) update.vehicleModelId = data.vehicleModelId;
    if (data.warrantyStartDate !== undefined) update.warrantyStartDate = data.warrantyStartDate;
    if (data.override === null) {
      Object.assign(update, { warrantyOverrideType: null, warrantyOverrideUntil: null, warrantyOverrideKm: null, warrantyOverrideReason: null });
    } else if (data.override) {
      const o = data.override;
      if (o.type === "GOODWILL" && !o.until) throw new BadRequestError("Goodwill needs an end date");
      if (o.type === "EXTENDED" && !o.until && o.km == null) throw new BadRequestError("An extended warranty needs an end date or a km limit");
      Object.assign(update, {
        warrantyOverrideType: o.type,
        warrantyOverrideUntil: o.until ?? null,
        warrantyOverrideKm: o.km ?? null,
        warrantyOverrideReason: o.reason.trim(),
      });
    }
    await prisma.vehicle.update({ where: { id: vehicleId }, data: update });
    return checkVehicleWarranty(vehicleId);
  }
}
