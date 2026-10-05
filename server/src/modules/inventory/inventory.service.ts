import { assertApprovedOperation } from '../service/estimate-approval';
import prisma from "../../prisma/client";
import { InventoryRepository } from "./inventory.repository";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "../../shared/errors/appError";
import { ROLES } from "../../shared/constants/roles";
import { NotificationService } from "../notification/notification.service";
import { SparePart, PartStatus, PartRole, Prisma } from "@prisma/client";
import { buildPartQuery } from "./partQuery";

const INHERITABLE_FIELDS = [
  "category",
  "uom",
  "taxCategory",
  "taxForm",
  "minLevel",
  "maxLevel",
  "reorderQty",
  "unitPrice",
  "retailRate",
  "taxable",
  "partFlag",
  "priceCategoryCode",
  "storeLocation",
] as const;

type InheritableField = (typeof INHERITABLE_FIELDS)[number];
type InheritedDefaults = Pick<SparePart, InheritableField>;

interface CreateMainPartInput {
  partNumber: string;
  name: string;
  description?: string;
  category?: string;
  uom?: string;
  taxCategory?: string;
  taxForm?: string;
  minLevel?: number;
  maxLevel?: number;
  mainPartId?: string;
  reorderQty?: number;
  unitPrice?: number;
  binLocation?: string;
  storeLocation?: string;
  branchStock?: {
    branchId: string;
    quantity: number;
    minimumStock?: number;
    rackLocation?: string;
  }[];
  recordedById?: string;
}

interface CreateAlternatePartInput {
  mainPartId: string;
  partNumber: string;
  name: string;
  description?: string;
  binLocation?: string;
  // Any of these, if provided, OVERRIDE the inherited value from main.
  overrides?: Partial<InheritedDefaults>;
}

interface ListPartsQuery {
  branchId?: string | null;
  partCode?: string;
  partNumber?: string;
  name?: string;
  category?: string;
  partStatus?: PartStatus | string;
  role?: PartRole | string;
  mainPartId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
}
/** Prisma reports RESTRICT violations as P2003 or as a raw Postgres 23001/23503 error. */
function isForeignKeyViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  )
    return true;
  const message = error instanceof Error ? error.message : "";
  return /violates (RESTRICT setting of )?foreign key constraint|23001|23503/.test(
    message,
  );
}

export class InventoryService {
  private inventoryRepository: InventoryRepository;

  constructor() {
    this.inventoryRepository = new InventoryRepository();
  }

  /**
   * Parts created without an explicit code use their part number, which is
   * already unique; a numbered suffix covers the rare clash with another code.
   */
  private async generatePartCode(partNumber: string): Promise<string> {
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? partNumber : `${partNumber}-${i + 1}`;
      const taken = await prisma.sparePart.findUnique({
        where: { partCode: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new ConflictError(`Could not generate a part code for ${partNumber}`);
  }

  /** Legacy retail rate: dealer rate x the price category's multiplier, rounded to kobo. */
  private async retailFromCategory(
    dealerRate: number,
    code: string | null | undefined,
  ): Promise<number | null> {
    if (!code) return null;
    const category = await prisma.partCategory.findUnique({ where: { code } });
    if (!category) throw new BadRequestError(`Unknown price category ${code}`);
    if (!category.isActive)
      throw new BadRequestError(`Price category ${code} is inactive`);
    return Math.round(dealerRate * category.markupMultiplier * 100) / 100;
  }

  async listPartCategories() {
    return prisma.partCategory.findMany({ orderBy: { code: "asc" } });
  }

  private withAvailableQuantity<
    T extends { quantity: number; reservedQuantity: number },
  >(stock: T): T & { availableQuantity: number } {
    return {
      ...stock,
      availableQuantity: stock.quantity - stock.reservedQuantity,
    };
  }

  private async notifyLowStock(
    branchId: string,
    part: { id: string; name: string },
    quantity: number,
    minimumStock: number,
  ) {
    if (minimumStock <= 0 || quantity > minimumStock) return;
    const notificationService = new NotificationService();
    const payload = {
      type: "LOW_STOCK",
      title: "Low stock alert",
      message: `Stock for ${part.name} is low (${quantity} remaining, minimum ${minimumStock}).`,
      link: `/inventory/${part.id}`,
    };
    await notificationService.notifyRole(
      ROLES.BRANCH_STORE_MANAGER,
      branchId,
      payload,
    );
    await notificationService.notifyRole(
      ROLES.GENERAL_STORE_MANAGER,
      undefined,
      payload,
    );
  }

  private async getBranchNames(ids: string[]) {
    const branches = await prisma.branch.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const map: Record<string, string> = {};
    for (const branch of branches) map[branch.id] = branch.name;
    return map;
  }

  async listSpareParts(branchId?: string) {
    return this.inventoryRepository.listSpareParts(branchId);
  }

  async getSparePart(id: string, branchId?: string) {
    const part = await this.inventoryRepository.findSparePartById(id, branchId);
    if (!part) {
      throw new NotFoundError("Spare part not found");
    }
    return part;
  }

  async createSparePart(data: CreateMainPartInput) {
    const existing = await prisma.sparePart.findUnique({
      where: { partNumber: data.partNumber },
    });
    if (existing) {
      throw new ConflictError(
        "A spare part with this part number already exists",
      );
    }

    const { branchStock, recordedById, ...rest } = data;
    const partData = {
      ...rest,
      partCode: await this.generatePartCode(rest.partNumber),
    };

    if (!branchStock || branchStock.length === 0) {
      return this.inventoryRepository.createSparePart(partData);
    }

    const branchIds = branchStock.map((b) => b.branchId);
    if (new Set(branchIds).size !== branchIds.length) {
      throw new BadRequestError(
        "Each branch can only be stocked once per part",
      );
    }

    const branches = await prisma.branch.findMany({
      where: { id: { in: branchIds } },
    });
    if (branches.length !== branchIds.length) {
      throw new NotFoundError("One or more branches not found");
    }

    return prisma.$transaction(async (tx) => {
      const part = await tx.sparePart.create({ data: partData });
      for (const stock of branchStock) {
        await tx.inventoryStock.create({
          data: {
            branchId: stock.branchId,
            partId: part.id,
            quantity: stock.quantity,
            minimumStock: stock.minimumStock ?? 0,
            rackLocation: stock.rackLocation ?? null,
          },
        });
        await tx.stockTransaction.create({
          data: {
            branchId: stock.branchId,
            partId: part.id,
            type: "STOCKED",
            quantity: stock.quantity,
            notes: "Initial stock across branches",
            recordedById,
          },
        });
      }
      return part;
    });
  }

  async updateSparePart(
    id: string,
    data: {
      name?: string;
      description?: string;
      category?: string;
      unitPrice?: number;
    },
  ) {
    const part = await this.inventoryRepository.findSparePartById(id);
    if (!part) {
      throw new NotFoundError("Spare part not found");
    }

    return this.inventoryRepository.updateSparePart(id, data);
  }

  async deleteSparePart(id: string) {
    const alternatePartsCount = await prisma.sparePart.count({
      where: { mainPartId: id },
    });
    if (alternatePartsCount > 0) {
      throw new Error("Cannot delete a main part that has alternate parts");
    }

    const part = await this.inventoryRepository.findSparePartById(id);
    if (!part) {
      throw new NotFoundError("Spare part not found");
    }

    return this.inventoryRepository.deleteSparePart(id);
  }

  async createAlternatePart(data: CreateAlternatePartInput) {
    const mainPart = await prisma.sparePart.findUnique({
      where: { id: data.mainPartId },
    });

    if (!mainPart) {
      throw new NotFoundError("Main part not found");
    }

    if (mainPart.role !== PartRole.MAIN) {
      // Prevents alternates being chained off other alternates —
      // keeps the hierarchy exactly one level deep, matching one-to-many.
      throw new Error(
        `Part ${data.mainPartId} is not a MAIN part and cannot have alternates`,
      );
    }

    const inherited: InheritedDefaults = INHERITABLE_FIELDS.reduce(
      (acc, field) => {
        acc[field] = mainPart[field] as never;
        return acc;
      },
      {} as InheritedDefaults,
    );

    const {
      mainPartId,
      partNumber,
      name,
      description,
      binLocation,
      overrides,
    } = data;

    return prisma.sparePart.create({
      data: {
        mainPartId,
        partNumber,
        name,
        description,
        binLocation,
        role: PartRole.ALTERNATE,
        ...inherited,
        ...overrides,
      },
    });
  }

  // ---------- GET /inventory/parts/:id/alternates ----------
  async listAlternates(mainPartId: string, branchId?: string | null) {
    const mainPart = await prisma.sparePart.findUnique({
      where: { id: mainPartId },
    });
    if (!mainPart) throw new NotFoundError(`Part ${mainPartId} not found`);

    return prisma.sparePart.findMany({
      where: {
        mainPartId,
        ...(branchId && { inventoryStocks: { some: { branchId } } }),
      },
      orderBy: { createdAt: "asc" },
    });
  }

  // ---------- GET /inventory/parts?role=ALTERNATE&... ----------
  async listPartsWithFilters(query: ListPartsQuery) {
    const {
      branchId,
      role,
      name,
      partCode,
      partNumber,
      category,
      partStatus,
      mainPartId,
      search,
    } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? query.pageSize ?? 25;

    const where: Prisma.SparePartWhereInput = {
      ...(partCode && { partCode }),
      ...(partNumber && { partNumber }),
      ...(name && { name: { contains: name, mode: "insensitive" } }),
      ...(category && {
        category: { contains: category, mode: "insensitive" },
      }),
      ...(partStatus && { partStatus: partStatus as PartStatus }),
      ...(role && { role: role as PartRole }),
      ...(mainPartId && { mainPartId }),
      ...(branchId && { inventoryStocks: { some: { branchId } } }),
      ...(search && {
        OR: [
          { partNumber: { contains: search, mode: "insensitive" } },
          { partCode: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.sparePart.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.sparePart.count({ where }),
    ]);

    return { items, total, page: page, pageSize: limit };
  }

  // ---------- GET /inventory/parts/:id/replacement-options ----------
  async getReplacementOptions(mainPartId: string, branchId?: string | null) {
    const mainPart = await prisma.sparePart.findUnique({
      where: { id: mainPartId },
    });
    if (!mainPart) throw new NotFoundError(`Part ${mainPartId} not found`);

    const alternates = await prisma.sparePart.findMany({
      where: {
        mainPartId,
        partStatus: "ACTIVE" as never,
        ...(branchId && { inventoryStocks: { some: { branchId } } }),
      },
      include: {
        inventoryStocks: true,
      },
    });

    // Only surface alternates that actually have usable stock right now.
    return alternates
      .map((alt) => ({
        ...alt,
        totalAvailableQty: alt.inventoryStocks.reduce(
          (sum, s) => sum + (s.quantity ?? 0),
          0,
        ),
      }))
      .filter((alt) => alt.totalAvailableQty > 0)
      .sort((a, b) => b.totalAvailableQty - a.totalAvailableQty);
  }

  // ── Part Master ────────────────────────────────────────────────────────

  private mapToPartMasterDto(part: SparePart) {
    const { unitPrice, ...rest } = part;
    return { ...rest, unitRate: unitPrice };
  }

  async createPart(data: {
    partCode?: string;
    partNumber: string;
    name: string;
    category: string;
    uom: string;
    taxCategory?: string;
    taxForm?: string;
    minLevel?: number;
    maxLevel?: number;
    reorderQty?: number;
    unitRate: number;
    retailRate?: number;
    taxable?: boolean;
    partFlag?: string;
    priceCategoryCode?: string;
    binLocation?: string;
    storeLocation?: string;
    partStatus?: PartStatus;
  }) {
    if (data.retailRate === undefined && data.priceCategoryCode) {
      data = {
        ...data,
        retailRate:
          (await this.retailFromCategory(
            data.unitRate,
            data.priceCategoryCode,
          )) ?? undefined,
      };
    } else if (data.priceCategoryCode) {
      await this.retailFromCategory(data.unitRate, data.priceCategoryCode); // validates the code
    }
    if (data.partCode) {
      const existing = await this.inventoryRepository.findPartByCode(
        data.partCode,
      );
      if (existing) {
        throw new ConflictError("A part with this part code already exists");
      }
    }

    const { unitRate, ...rest } = data;
    const part = await this.inventoryRepository.createPart({
      ...rest,
      unitPrice: unitRate,
    });

    return this.mapToPartMasterDto(part);
  }

  async getAllParts(filters?: {
    partCode?: string;
    partNumber?: string;
    name?: string;
    category?: string;
    partStatus?: PartStatus;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const { parts, total } = await this.inventoryRepository.findAllParts({
      partCode: filters?.partCode,
      partNumber: filters?.partNumber,
      name: filters?.name,
      category: filters?.category,
      partStatus: filters?.partStatus,
      skip,
      take: limit,
    });

    return {
      parts: parts.map((part) => this.mapToPartMasterDto(part)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPartById(id: string) {
    const part = await this.inventoryRepository.findPartById(id);
    if (!part) {
      throw new NotFoundError("Part not found");
    }

    return this.mapToPartMasterDto(part);
  }

  async updatePart(
    id: string,
    data: {
      partCode?: string;
      partNumber?: string;
      name?: string;
      category?: string;
      uom?: string;
      taxCategory?: string;
      taxForm?: string;
      minLevel?: number;
      maxLevel?: number;
      reorderQty?: number;
      unitRate?: number;
      retailRate?: number;
      taxable?: boolean;
      partFlag?: string;
      priceCategoryCode?: string | null;
      binLocation?: string;
      storeLocation?: string;
      partStatus?: PartStatus;
    },
  ) {
    const part = await this.inventoryRepository.findPartById(id);
    if (!part) {
      throw new NotFoundError("Part not found");
    }

    if (data.partCode && data.partCode !== part.partCode) {
      const existing = await this.inventoryRepository.findPartByCode(
        data.partCode,
      );
      if (existing && existing.id !== id) {
        throw new ConflictError("A part with this part code already exists");
      }
    }

    const { unitRate, ...rest } = data;
    const updateData: Partial<SparePart> = { ...rest };
    if (unitRate !== undefined) {
      updateData.unitPrice = unitRate;
    }

    // Keep the retail rate in step with the dealer rate and price category unless it was sent explicitly.
    const category =
      data.priceCategoryCode !== undefined
        ? data.priceCategoryCode
        : part.priceCategoryCode;
    const dealer = unitRate ?? part.unitPrice;
    if (data.priceCategoryCode)
      await this.retailFromCategory(dealer, data.priceCategoryCode);
    if (
      data.retailRate === undefined &&
      (unitRate !== undefined || data.priceCategoryCode !== undefined) &&
      category
    ) {
      updateData.retailRate = await this.retailFromCategory(dealer, category);
    }

    const updated = await this.inventoryRepository.updatePart(id, updateData);
    return this.mapToPartMasterDto(updated);
  }

  async deletePart(id: string) {
    const part = await this.inventoryRepository.findPartById(id);
    if (!part) {
      throw new NotFoundError("Part not found");
    }

    const alternates = await prisma.sparePart.count({
      where: { mainPartId: id },
    });
    if (alternates > 0) {
      throw new ConflictError(
        `This part has ${alternates} alternate part(s). Delete or reassign them first, or block the part instead.`,
      );
    }

    try {
      await this.inventoryRepository.deletePart(id);
    } catch (error) {
      // Stock transactions, transfers, issuances and similar records keep the part (onDelete: Restrict).
      if (isForeignKeyViolation(error)) {
        throw new ConflictError(
          "This part is used by stock transactions, transfers, issuances or purchase requests, so it cannot be deleted. Block it instead.",
        );
      }
      throw error;
    }
    return { message: "Part deleted successfully" };
  }

  // ── Inventory Stock ────────────────────────────────────────────────────

  async getBranchStock(branchId: string, partId: string) {
    const stock = await this.inventoryRepository.findInventoryStock(
      branchId,
      partId,
    );
    if (!stock) {
      throw new NotFoundError(
        "Stock record not found for this branch and part",
      );
    }
    return this.withAvailableQuantity(stock);
  }

  async listBranchStock(branchId: string) {
    const stock =
      await this.inventoryRepository.listInventoryStockByBranch(branchId);
    return stock.map((item) => this.withAvailableQuantity(item));
  }

  async listAllStock(filters?: {
    branchId?: string;
    partId?: string;
    search?: string;
    limit?: number;
  }) {
    const stock = await this.inventoryRepository.listAllInventoryStock(filters);
    return stock.map((item) => this.withAvailableQuantity(item));
  }

  async adjustStock(data: {
    branchId: string;
    partId: string;
    quantity: number;
    type: string;
    notes?: string;
    recordedById?: string;
  }) {
    const part = await this.inventoryRepository.findSparePartById(data.partId);
    if (!part) {
      throw new NotFoundError("Spare part not found");
    }

    const branch = await prisma.branch.findUnique({
      where: { id: data.branchId },
    });
    if (!branch) {
      throw new NotFoundError("Branch not found");
    }

    const stock = await this.inventoryRepository.upsertInventoryStock({
      branchId: data.branchId,
      partId: data.partId,
      quantity: data.quantity,
    });

    await this.inventoryRepository.createStockTransaction({
      branchId: data.branchId,
      partId: data.partId,
      type: data.type,
      quantity: data.quantity,
      notes: data.notes,
      recordedById: data.recordedById,
    });

    return this.withAvailableQuantity(stock);
  }

  /** Sets where a part is kept at one branch (rack, bin card) and its branch stock levels. */
  async updateStockLocation(
    branchId: string,
    partId: string,
    data: {
      rackLocation?: string | null;
      binCard?: string | null;
      minimumStock?: number;
      maximumStock?: number | null;
    },
  ) {
    const [branch, part] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true },
      }),
      prisma.sparePart.findUnique({
        where: { id: partId },
        select: { id: true },
      }),
    ]);
    if (!branch) throw new NotFoundError("Branch not found");
    if (!part) throw new NotFoundError("Part not found");
    if (
      data.maximumStock != null &&
      data.minimumStock != null &&
      data.maximumStock < data.minimumStock
    ) {
      throw new BadRequestError(
        "Maximum stock must be greater than or equal to minimum stock",
      );
    }
    const stock = await prisma.inventoryStock.upsert({
      where: { branchId_partId: { branchId, partId } },
      create: {
        branchId,
        partId,
        quantity: 0,
        ...data,
        minimumStock: data.minimumStock ?? 0,
      },
      update: data,
      include: { branch: true, part: true },
    });
    return this.withAvailableQuantity(stock);
  }

  /** Legacy Part Query: stock at the home premises, alternates, and other branches. */
  async partQuery(partNumber: string, homeBranchId?: string | null) {
    const part = await prisma.sparePart.findFirst({
      where: { partNumber: { equals: partNumber, mode: "insensitive" } },
    });
    if (!part) throw new NotFoundError(`Part ${partNumber} not found`);

    const rootId = part.mainPartId ?? part.id;
    const alternates = await prisma.sparePart.findMany({
      where: {
        id: { not: part.id },
        OR: [{ id: rootId }, { mainPartId: rootId }],
      },
      orderBy: { partNumber: "asc" },
    });
    const [branches, stocks] = await Promise.all([
      prisma.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true, parentBranchId: true },
      }),
      prisma.inventoryStock.findMany({
        where: { partId: { in: [part.id, ...alternates.map((a) => a.id)] } },
        select: {
          branchId: true,
          partId: true,
          quantity: true,
          reservedQuantity: true,
          rackLocation: true,
          binCard: true,
        },
      }),
    ]);
    return buildPartQuery({ part, alternates, branches, stocks, homeBranchId });
  }

  async listStockTransactions(branchId?: string, partId?: string) {
    return this.inventoryRepository.listStockTransactions(branchId, partId);
  }

  // ── Purchase Requests ──────────────────────────────────────────────────

  async createPurchaseRequest(data: {
    sparePartId: string;
    requestedById: string;
    quantity: number;
    status?: string;
    approvalNotes?: string;
  }) {
    const sparePart = await this.inventoryRepository.findSparePartById(
      data.sparePartId,
    );
    if (!sparePart) {
      throw new NotFoundError("Spare part not found");
    }

    const user = await prisma.user.findUnique({
      where: { id: data.requestedById },
    });
    if (!user) {
      throw new NotFoundError("Requesting user not found");
    }

    const purchaseRequest =
      await this.inventoryRepository.createPurchaseRequest({
        sparePartId: data.sparePartId,
        requestedById: data.requestedById,
        quantity: data.quantity,
        status: data.status,
        approvalNotes: data.approvalNotes,
      });

    const notificationService = new NotificationService();
    await notificationService.notifyRole(
      ROLES.GENERAL_STORE_MANAGER,
      undefined,
      {
        type: "PURCHASE_REQUEST_CREATED",
        title: "New purchase request",
        message: `${sparePart.name} (${data.quantity}) has been requested for purchase.`,
        link: `/purchase-requests`,
      },
    );

    return purchaseRequest;
  }

  async listPurchaseRequests(branchId?: string) {
    return this.inventoryRepository.listPurchaseRequests(branchId);
  }

  async getPurchaseRequest(id: string) {
    const request = await this.inventoryRepository.findPurchaseRequestById(id);
    if (!request) {
      throw new NotFoundError("Purchase request not found");
    }

    return request;
  }

  async updatePurchaseRequestStatus(
    id: string,
    data: { status: string; approvalNotes?: string },
  ) {
    const request = await this.inventoryRepository.findPurchaseRequestById(id);
    if (!request) {
      throw new NotFoundError("Purchase request not found");
    }

    return this.inventoryRepository.updatePurchaseRequestStatus(id, {
      status: data.status,
      approvalNotes: data.approvalNotes,
    });
  }

  // ── Part Issuances ─────────────────────────────────────────────────────

  async createPartIssuance(data: {
    sparePartId: string;
    branchId: string;
    jobCardId?: string;
    issuedById: string;
    quantity: number;
    notes?: string;
  }) {
    const sparePart = await this.inventoryRepository.findSparePartById(
      data.sparePartId,
    );
    if (!sparePart) {
      throw new NotFoundError("Spare part not found");
    }
    if (sparePart.partStatus !== PartStatus.ACTIVE) {
      throw new BadRequestError("Blocked parts cannot be issued");
    }

    if (data.quantity <= 0) {
      throw new BadRequestError("Issued quantity must be greater than zero");
    }

    const stock = await this.inventoryRepository.findInventoryStock(
      data.branchId,
      data.sparePartId,
    );
    // Reserved stock is held for picked transfers and cannot be issued.
    if (!stock || stock.quantity - stock.reservedQuantity < data.quantity) {
      throw new BadRequestError("Insufficient available stock at this branch");
    }

    const user = await prisma.user.findUnique({
      where: { id: data.issuedById },
    });
    if (!user) {
      throw new NotFoundError("Issuing user not found");
    }

    if (data.jobCardId) {
      const jobCard = await prisma.jobCard.findUnique({
        where: { id: data.jobCardId },
      });
      if (!jobCard) {
        throw new NotFoundError("Job card not found");
      }
      if (jobCard.branchId !== data.branchId) {
        throw new BadRequestError("Job card belongs to a different branch");
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      if (data.jobCardId) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${data.jobCardId} FOR UPDATE`);
        const card = await tx.jobCard.findUniqueOrThrow({ where: { id: data.jobCardId } });
        if (card.branchId !== data.branchId || card.billedAt || ['READY', 'COMPLETED', 'BILLED', 'DELIVERED', 'CLOSED', 'CANCELLED'].includes(card.status.toUpperCase())) throw new BadRequestError('Parts can only be issued to an open job in this branch');
        const previous = await tx.partIssuance.findMany({ where: { jobCardId: data.jobCardId, sparePartId: data.sparePartId }, include: { returns: true } });
        const quantity = data.quantity + previous.reduce((sum, row) => sum + row.quantity - row.returns.filter(r => r.status.toUpperCase() !== 'REJECTED').reduce((n, r) => n + r.quantity, 0), 0);
        if (sparePart.retailRate == null) throw new BadRequestError('Set the part retail rate before issuing');
        await assertApprovedOperation(tx, card.id, card.customerId, [{ type: 'PART', referenceId: sparePart.id, description: sparePart.name, quantity, rate: sparePart.retailRate, amount: Math.round(quantity * sparePart.retailRate * 100) / 100 }]);
      }
      const updated = await tx.inventoryStock.updateMany({
        where: {
          branchId: data.branchId,
          partId: data.sparePartId,
          quantity: { gte: data.quantity },
        },
        data: { quantity: { decrement: data.quantity } },
      });
      if (updated.count !== 1) {
        throw new BadRequestError("Insufficient stock at this branch");
      }

      if (data.jobCardId) await tx.jobCard.update({ where: { id: data.jobCardId }, data: { qcStatus: 'PENDING' } });
      const issuance = await tx.partIssuance.create({ data });
      await tx.stockTransaction.create({
        data: {
          branchId: data.branchId,
          partId: data.sparePartId,
          type: "ISSUED",
          quantity: -data.quantity,
          referenceId: issuance.id,
          notes: data.notes,
          recordedById: data.issuedById,
        },
      });
      const stock = await tx.inventoryStock.findUniqueOrThrow({
        where: {
          branchId_partId: {
            branchId: data.branchId,
            partId: data.sparePartId,
          },
        },
        include: { part: { select: { id: true, name: true } } },
      });
      return { issuance, stock };
    }, { maxWait: 5000, timeout: 15000 });

    // The stock mutation has committed; notification failure must not invite a duplicate issue.
    await this.notifyLowStock(
      data.branchId,
      result.stock.part,
      result.stock.quantity,
      result.stock.minimumStock,
    ).catch(() =>
      console.error("Low-stock notification could not be recorded"),
    );
    return result.issuance;
  }

  async listPartIssuances(branchId?: string) {
    return this.inventoryRepository.listPartIssuances(branchId);
  }

  async getPartIssuance(id: string) {
    const issuance = await this.inventoryRepository.findPartIssuanceById(id);
    if (!issuance) {
      throw new NotFoundError("Part issuance not found");
    }

    return issuance;
  }

  async createPartReturn(data: {
    partIssuanceId: string;
    branchId: string;
    returnedById: string;
    quantity: number;
    reason?: string;
    status?: string;
  }) {
    if (!Number.isInteger(data.quantity) || data.quantity <= 0)
      throw new BadRequestError("Returned quantity must be a positive integer");
    return prisma.$transaction(async (tx) => {
      const initial = await tx.partIssuance.findUnique({
        where: { id: data.partIssuanceId },
      });
      if (!initial) throw new NotFoundError("Part issuance not found");
      if (initial.jobCardId) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${initial.jobCardId} FOR UPDATE`,
        );
        const card = await tx.jobCard.findUniqueOrThrow({
          where: { id: initial.jobCardId },
        });
        if (
          card.billedAt ||
          ["BILLED", "DELIVERED", "CANCELLED", "Closed", "Cancelled"].includes(
            card.status,
          )
        )
          throw new BadRequestError(
            "Cannot return parts on a billed or closed job",
          );
      }
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "PartIssuance" WHERE id = ${initial.id} FOR UPDATE`,
      );
      if (initial.branchId !== data.branchId)
        throw new BadRequestError("Return branch must match issuance");
      const returned = await tx.partReturn.aggregate({
        where: {
          partIssuanceId: initial.id,
          status: { notIn: ["Rejected", "REJECTED"] },
        },
        _sum: { quantity: true },
      });
      if ((returned._sum.quantity ?? 0) + data.quantity > initial.quantity)
        throw new BadRequestError("Returned quantity exceeds issued quantity");
      await tx.inventoryStock.updateMany({
        where: { branchId: data.branchId, partId: initial.sparePartId },
        data: { quantity: { increment: data.quantity } },
      });
      await tx.stockTransaction.create({
        data: {
          branchId: data.branchId,
          partId: initial.sparePartId,
          type: "RETURNED",
          quantity: data.quantity,
          referenceId: initial.id,
          notes: data.reason,
          recordedById: data.returnedById,
        },
      });
      return tx.partReturn.create({
        data: {
          partIssuanceId: initial.id,
          returnedById: data.returnedById,
          quantity: data.quantity,
          reason: data.reason,
          status: "Completed",
        },
      });
    });
  }

  async listPartReturns(branchId?: string) {
    return this.inventoryRepository.listPartReturns(branchId);
  }

  async getPartReturn(id: string) {
    const partReturn = await this.inventoryRepository.findPartReturnById(id);
    if (!partReturn) {
      throw new NotFoundError("Part return not found");
    }

    return partReturn;
  }

  // ── Inter-Branch Transfers ─────────────────────────────────────────────

  async createTransfer(data: {
    requestingBranchId: string;
    sourceBranchId: string;
    requestedById: string;
    notes?: string;
    items: { partId: string; requestedQuantity: number }[];
  }) {
    if (data.requestingBranchId === data.sourceBranchId) {
      throw new BadRequestError(
        "Source and requesting branch cannot be the same",
      );
    }

    if (!data.items || data.items.length === 0) {
      throw new BadRequestError("At least one item is required for a transfer");
    }

    const sourceBranch = await prisma.branch.findUnique({
      where: { id: data.sourceBranchId },
    });
    if (!sourceBranch) throw new NotFoundError("Source branch not found");

    const reqBranch = await prisma.branch.findUnique({
      where: { id: data.requestingBranchId },
    });
    if (!reqBranch) throw new NotFoundError("Requesting branch not found");

    // Validate all parts exist
    for (const item of data.items) {
      const part = await this.inventoryRepository.findSparePartById(
        item.partId,
      );
      if (!part) throw new NotFoundError(`Spare part ${item.partId} not found`);
      if (item.requestedQuantity <= 0) {
        throw new BadRequestError(
          `Invalid requested quantity for part ${item.partId}`,
        );
      }
    }

    const transferNumber =
      await this.inventoryRepository.getNextTransferNumber();

    const transfer = await this.inventoryRepository.createTransfer({
      transferNumber,
      requestingBranchId: data.requestingBranchId,
      sourceBranchId: data.sourceBranchId,
      requestedById: data.requestedById,
      notes: data.notes,
    });

    // Add items
    for (const item of data.items) {
      await this.inventoryRepository.createTransferItem({
        transferId: transfer.id,
        partId: item.partId,
        requestedQuantity: item.requestedQuantity,
      });
    }

    const createdTransfer = await this.inventoryRepository.findTransferById(
      transfer.id,
    );

    const notificationService = new NotificationService();
    await notificationService.notifyRole(
      ROLES.GENERAL_STORE_MANAGER,
      undefined,
      {
        type: "TRANSFER_REQUESTED",
        title: "New transfer request",
        message: `Transfer ${transfer.transferNumber} requested from ${sourceBranch.name} to ${reqBranch.name}.`,
        link: `/transfers`,
      },
    );

    return createdTransfer;
  }

  async getTransfer(id: string) {
    const transfer = await this.inventoryRepository.findTransferById(id);
    if (!transfer) {
      throw new NotFoundError("Transfer not found");
    }
    return transfer;
  }

  async listTransfers(filters?: {
    status?: string;
    requestingBranchId?: string;
    sourceBranchId?: string;
    branchId?: string;
  }) {
    return this.inventoryRepository.listTransfers(filters);
  }

  async approveTransfer(id: string, approvedById: string) {
    const transfer = await this.inventoryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError("Transfer not found");
    if (transfer.status !== "Pending")
      throw new BadRequestError(
        "Transfer can only be approved from Pending status",
      );

    const updated = await this.inventoryRepository.updateTransferStatus(id, {
      status: "Approved",
      approvedById,
      approvedAt: new Date(),
    });

    const branchNames = await this.getBranchNames([
      transfer.sourceBranchId,
      transfer.requestingBranchId,
    ]);
    const notificationService = new NotificationService();
    const payload = {
      type: "TRANSFER_APPROVED",
      title: "Transfer approved",
      message: `Transfer ${transfer.transferNumber} (${branchNames[transfer.sourceBranchId] ?? transfer.sourceBranchId} → ${branchNames[transfer.requestingBranchId] ?? transfer.requestingBranchId}) was approved.`,
      link: `/transfers`,
    };
    await notificationService.notifyUsers([transfer.requestedById], {
      ...payload,
      branchId: transfer.requestingBranchId,
    });
    await notificationService.notifyRole(
      ROLES.BRANCH_STORE_MANAGER,
      transfer.requestingBranchId,
      payload,
    );

    return updated;
  }

  async dispatchTransfer(
    id: string,
    dispatchedById: string,
    items?: { id: string; dispatchedQuantity: number }[],
  ) {
    const transfer = await this.inventoryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError("Transfer not found");
    if (transfer.status !== "Approved")
      throw new BadRequestError(
        "Transfer can only be dispatched from Approved status",
      );

    const transferItems = await this.inventoryRepository.findTransferItems(id);
    if (
      items?.some(
        (item) =>
          !transferItems.some((transferItem) => transferItem.id === item.id),
      )
    ) {
      throw new BadRequestError(
        "One or more transfer items do not belong to this transfer",
      );
    }
    const parts = await prisma.sparePart.findMany({
      where: { id: { in: transferItems.map((i) => i.partId) } },
      select: { id: true, name: true },
    });
    const partMap: Record<string, string> = {};
    for (const part of parts) partMap[part.id] = part.name;

    for (const item of transferItems) {
      const dispatchedQty =
        items?.find((i) => i.id === item.id)?.dispatchedQuantity ??
        item.requestedQuantity;
      const stock = await this.inventoryRepository.findInventoryStock(
        transfer.sourceBranchId,
        item.partId,
      );
      if (!stock || stock.quantity - stock.reservedQuantity < dispatchedQty) {
        throw new BadRequestError(
          `Insufficient stock for part ${item.partId} at source branch`,
        );
      }
      const updatedStock =
        await this.inventoryRepository.decrementInventoryStock(
          transfer.sourceBranchId,
          item.partId,
          dispatchedQty,
        );
      await this.inventoryRepository.createStockTransaction({
        branchId: transfer.sourceBranchId,
        partId: item.partId,
        type: "TRANSFER_OUT",
        quantity: -dispatchedQty,
        referenceId: id,
        recordedById: dispatchedById,
      });
      await this.notifyLowStock(
        transfer.sourceBranchId,
        { id: item.partId, name: partMap[item.partId] ?? item.partId },
        updatedStock.quantity,
        updatedStock.minimumStock,
      );
    }

    if (items) {
      await this.inventoryRepository.updateTransferItemsDispatched(items);
    }

    const updated = await this.inventoryRepository.updateTransferStatus(id, {
      status: "Dispatched",
      dispatchedById,
      dispatchedAt: new Date(),
    });

    const branchNames = await this.getBranchNames([
      transfer.sourceBranchId,
      transfer.requestingBranchId,
    ]);
    const notificationService = new NotificationService();
    const payload = {
      type: "TRANSFER_DISPATCHED",
      title: "Transfer dispatched",
      message: `Transfer ${transfer.transferNumber} (${branchNames[transfer.sourceBranchId] ?? transfer.sourceBranchId} → ${branchNames[transfer.requestingBranchId] ?? transfer.requestingBranchId}) has been dispatched.`,
      link: `/transfers`,
    };
    await notificationService.notifyUsers([transfer.requestedById], {
      ...payload,
      branchId: transfer.requestingBranchId,
    });
    await notificationService.notifyRole(
      ROLES.BRANCH_STORE_MANAGER,
      transfer.requestingBranchId,
      payload,
    );

    return updated;
  }

  async receiveTransfer(
    id: string,
    receivedById: string,
    items?: { id: string; receivedQuantity: number }[],
  ) {
    const transfer = await this.inventoryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError("Transfer not found");
    if (transfer.status !== "Dispatched")
      throw new BadRequestError(
        "Transfer can only be received from Dispatched status",
      );

    const transferItems = await this.inventoryRepository.findTransferItems(id);
    if (
      items?.some(
        (item) =>
          !transferItems.some((transferItem) => transferItem.id === item.id),
      )
    ) {
      throw new BadRequestError(
        "One or more transfer items do not belong to this transfer",
      );
    }
    for (const item of transferItems) {
      const receivedQty =
        items?.find((i) => i.id === item.id)?.receivedQuantity ??
        item.requestedQuantity;
      await this.inventoryRepository.upsertInventoryStock({
        branchId: transfer.requestingBranchId,
        partId: item.partId,
        quantity: receivedQty,
      });
      await this.inventoryRepository.createStockTransaction({
        branchId: transfer.requestingBranchId,
        partId: item.partId,
        type: "TRANSFER_IN",
        quantity: receivedQty,
        referenceId: id,
        recordedById: receivedById,
      });
    }

    if (items) {
      await this.inventoryRepository.updateTransferItemsReceived(items);
    }

    const updated = await this.inventoryRepository.updateTransferStatus(id, {
      status: "Received",
      receivedById,
      receivedAt: new Date(),
    });

    const branchNames = await this.getBranchNames([
      transfer.sourceBranchId,
      transfer.requestingBranchId,
    ]);
    const notificationService = new NotificationService();
    const payload = {
      type: "TRANSFER_RECEIVED",
      title: "Transfer received",
      message: `Transfer ${transfer.transferNumber} (${branchNames[transfer.sourceBranchId] ?? transfer.sourceBranchId} → ${branchNames[transfer.requestingBranchId] ?? transfer.requestingBranchId}) has been received.`,
      link: `/transfers`,
    };
    await notificationService.notifyUsers([transfer.requestedById], {
      ...payload,
      branchId: transfer.requestingBranchId,
    });
    await notificationService.notifyRole(
      ROLES.BRANCH_STORE_MANAGER,
      transfer.requestingBranchId,
      payload,
    );

    return updated;
  }

  async rejectTransfer(id: string, approvedById: string, notes?: string) {
    const transfer = await this.inventoryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError("Transfer not found");
    if (transfer.status !== "Pending")
      throw new BadRequestError(
        "Transfer can only be rejected from Pending status",
      );

    return this.inventoryRepository.updateTransferStatus(id, {
      status: "Rejected",
      approvedById,
      approvedAt: new Date(),
      notes,
    });
  }

  async cancelTransfer(id: string) {
    const transfer = await this.inventoryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError("Transfer not found");
    if (!["Pending", "Approved"].includes(transfer.status)) {
      throw new BadRequestError(
        "Transfer can only be cancelled from Pending or Approved status",
      );
    }

    return this.inventoryRepository.updateTransferStatus(id, {
      status: "Cancelled",
    });
  }
}

export default InventoryService;
