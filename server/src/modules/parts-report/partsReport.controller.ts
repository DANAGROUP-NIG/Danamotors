import { Request, Response, NextFunction, RequestHandler } from "express";
import prisma from "../../prisma/client";
import { assertInventoryBranchAccess } from "../../middleware/authorize";
import { ForbiddenError, NotFoundError } from "../../shared/errors/appError";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { REPORTS, reportByKind } from "./partsReport.definitions";
import { PartsReportService, ReportFilters } from "./partsReport.service";

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  async (req, res, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

const allowed = (req: Request, permission: string) =>
  req.user?.role === ROLES.SUPER_ADMIN || req.user?.permissions.includes(permission) === true;

function assertAnyReport(req: Request) {
  if (!REPORTS.some((r) => allowed(req, r.permission))) throw new ForbiddenError("You do not have access to parts reports");
}

export class PartsReportController {
  private service = new PartsReportService();

  /** The reports this user may run, with their filters and columns. */
  catalog = handle(async (req, res) => {
    res.json({ status: "success", statusCode: 200, data: { reports: REPORTS.filter((r) => allowed(req, r.permission)) } });
  });

  /** Filter choices: sales executives who have billed, vendors received from, price categories and part flags in use. */
  lookups = handle(async (req, res) => {
    assertAnyReport(req);
    const [executives, mitVendors, mrnVendors, categories, flags] = await Promise.all([
      prisma.user.findMany({
        where: { counterSalesExecuted: { some: {} } },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
      prisma.materialInTransit.findMany({ where: { vendor: { not: null } }, distinct: ["vendor"], select: { vendor: true } }),
      prisma.materialReceiptNote.findMany({ where: { vendor: { not: null } }, distinct: ["vendor"], select: { vendor: true } }),
      prisma.partCategory.findMany({ where: { isActive: true }, select: { code: true, description: true }, orderBy: { code: "asc" } }),
      prisma.sparePart.groupBy({ by: ["partFlag"], orderBy: { partFlag: "asc" } }),
    ]);
    res.json({
      status: "success",
      statusCode: 200,
      data: {
        executives: executives.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() })),
        vendors: [...new Set([...mitVendors, ...mrnVendors].map((v) => v.vendor!))].sort(),
        categories,
        partFlags: flags.map((f) => f.partFlag),
      },
    });
  });

  /** Part search for the part filter (number or name). */
  parts = handle(async (req, res) => {
    assertAnyReport(req);
    const search = String(req.query.search ?? "").trim();
    const parts = await prisma.sparePart.findMany({
      where: search
        ? { OR: [{ partNumber: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] }
        : undefined,
      select: { id: true, partNumber: true, name: true },
      orderBy: { partNumber: "asc" },
      take: 50,
    });
    res.json({ status: "success", statusCode: 200, data: { parts: parts.map((p) => ({ id: p.id, code: p.partNumber, name: p.name })) } });
  });

  run = handle(async (req, res) => {
    const definition = reportByKind.get(req.params.kind);
    if (!definition) throw new NotFoundError("Report not found");
    if (!allowed(req, definition.permission)) throw new ForbiddenError("You do not have access to this report");
    const query = req.query as unknown as ReportFilters;
    // Cross-branch users may run a report for any branch or all branches; others only for their own.
    const crossBranch = allowed(req, PERMISSIONS.INVENTORY_CROSS_BRANCH);
    const branchId = crossBranch ? query.branchId : req.user!.branchId ?? undefined;
    if (!crossBranch) assertInventoryBranchAccess(req, [branchId]);
    const result = await this.service.run(definition.kind, { ...query, branchId });
    res.json({ status: "success", statusCode: 200, data: { report: result } });
  });
}
