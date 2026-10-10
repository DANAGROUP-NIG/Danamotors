import { Request, Response, NextFunction, RequestHandler } from "express";
import { CustomerOrderStatus } from "@prisma/client";
import { assertInventoryBranchAccess } from "../../middleware/authorize";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { PartSaleService } from "./partSale.service";

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  async (req, res, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

const ok = (res: Response, data: unknown, message?: string, statusCode = 200) =>
  res.status(statusCode).json({ status: "success", statusCode, ...(message && { message }), data });

/** Branch filter for lists: none for cross-branch users, otherwise the user's own branch. */
function scope(req: Request): string | undefined {
  const cross =
    req.user?.role === ROLES.SUPER_ADMIN || req.user?.permissions.includes(PERMISSIONS.INVENTORY_CROSS_BRANCH) === true;
  if (cross) return undefined;
  assertInventoryBranchAccess(req, [req.user?.branchId]);
  return req.user!.branchId ?? undefined;
}

export class PartSaleController {
  private service = new PartSaleService();

  searchCustomers = handle(async (req, res) => {
    ok(res, { customers: await this.service.searchCustomers(String(req.query.search)) });
  });

  searchParts = handle(async (req, res) => {
    const branchId = String(req.query.branchId);
    assertInventoryBranchAccess(req, [branchId]);
    ok(res, { parts: await this.service.searchParts(String(req.query.search), branchId) });
  });

  // ── Customer purchase orders ──

  createOrder = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [req.body.branchId]);
    const order = await this.service.createOrder(req.body, req.user!.userId);
    ok(res, { order }, `CPO ${order.cpoNumber} created`, 201);
  });

  listOrders = handle(async (req, res) => {
    const q = req.query as { status?: CustomerOrderStatus; customerId?: string; billable?: string; search?: string };
    ok(res, {
      orders: await this.service.listOrders({
        branchId: scope(req),
        status: q.status,
        customerId: q.customerId,
        billable: q.billable === "true",
        search: q.search,
      }),
    });
  });

  getOrder = handle(async (req, res) => {
    const order = await this.service.getOrder(req.params.id);
    assertInventoryBranchAccess(req, [order.branchId]);
    ok(res, { order });
  });

  pickOrder = handle(async (req, res) => {
    await this.assertOrderAccess(req);
    const result = await this.service.pickOrder(req.params.id, req.body?.lines);
    const message = result.picked
      ? `${result.picked} unit(s) picked${result.short ? `, ${result.short} short of stock` : ""}`
      : "Nothing could be picked: no free stock for the open lines";
    ok(res, result, message);
  });

  releaseOrder = handle(async (req, res) => {
    await this.assertOrderAccess(req);
    ok(res, { order: await this.service.releaseOrder(req.params.id) }, "Picked stock released");
  });

  cancelOrder = handle(async (req, res) => {
    await this.assertOrderAccess(req);
    ok(res, { order: await this.service.cancelOrder(req.params.id, req.body.remark) }, "Order cancelled");
  });

  private async assertOrderAccess(req: Request) {
    const order = await this.service.getOrder(req.params.id);
    assertInventoryBranchAccess(req, [order.branchId]);
  }

  // ── Counter sales ──

  createCounterSale = handle(async (req, res) => {
    assertInventoryBranchAccess(req, [req.body.branchId]);
    const sale = await this.service.createCounterSale(req.body, req.user!.userId);
    ok(res, { sale }, `Counter sale ${sale.invoice.invoiceNumber} created`, 201);
  });

  listCounterSales = handle(async (req, res) => {
    const q = req.query as { customerId?: string; search?: string };
    ok(res, { sales: await this.service.listCounterSales({ branchId: scope(req), ...q }) });
  });

  getCounterSale = handle(async (req, res) => {
    const sale = await this.service.getCounterSale(req.params.id);
    assertInventoryBranchAccess(req, [sale.branchId]);
    ok(res, { sale });
  });

  cancelCounterSale = handle(async (req, res) => {
    const current = await this.service.getCounterSale(req.params.id);
    assertInventoryBranchAccess(req, [current.branchId]);
    ok(res, { sale: await this.service.cancelCounterSale(req.params.id, req.body.remark, req.user!.userId) }, "Bill cancelled");
  });

  // ── Sale returns ──

  createReturn = handle(async (req, res) => {
    const current = await this.service.getCounterSale(req.params.id);
    assertInventoryBranchAccess(req, [current.branchId]);
    const sale = await this.service.createReturn(req.params.id, req.body, req.user!.userId);
    ok(res, { sale }, `Sale return ${sale.returns[0]?.returnNumber ?? ""} recorded`.trim(), 201);
  });

  listReturns = handle(async (req, res) => {
    const q = req.query as { search?: string };
    ok(res, { returns: await this.service.listReturns({ branchId: scope(req), search: q.search }) });
  });
}
