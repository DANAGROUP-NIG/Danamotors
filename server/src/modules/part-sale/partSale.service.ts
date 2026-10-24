/**
 * CPD part sale (legacy CPDAutoEnhancer: CUSTOMERORDERHEAD/DETAIL type C, countersale/csissue
 * trantype C, csrethead/csretdetail).
 *
 *   CPO ──► pick (reserve stock) ──► counter-sale bill (Invoice) ──► sale return (credit note)
 *
 * The bill is an ordinary Invoice with no job card, so receipts, outstanding, party
 * ledgers and letters handle it like any other bill. One bill can cover lines from
 * several CPOs of the same customer. A return raises a credit note that is set off
 * against the bill's outstanding first; anything left stays as party credit.
 */
import { randomUUID } from "crypto";
import { CustomerOrderStatus, PartStatus, Prisma, TransportMode } from "@prisma/client";
import prisma from "../../prisma/client";
import { config } from "../../config";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { lockStock, nextDocumentNumber, StockTransferService } from "../stock-transfer/stockTransfer.service";
import { DOC_TYPES } from "../stock-transfer/stockTransfer.logic";
import { nextDocumentNumber as nextFinanceNumber } from "../finance/document-number";
import { creditDueDate, defaultCreditDays } from "../finance/credit-terms";
import { lockParty, PartyAccountService, withPartyTransaction } from "../finance/party-account.service";
import { money, sumMoney } from "../finance/money";
import { reportEnd, reportStart } from "../finance/party-report";
import {
  addMonths,
  billableQuantity,
  discountPercentFromAmount,
  openQuantity,
  orderStatus,
  planIssue,
  priceSale,
  returnableQuantity,
} from "./partSale.logic";

type Tx = Prisma.TransactionClient;

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };
const VAT_RATE = config.JOB_BILL_VAT_RATE;
const ACTIVE_ORDER: CustomerOrderStatus[] = [CustomerOrderStatus.OPEN, CustomerOrderStatus.PARTLY_BILLED];
// Keeps counter-sale bill numbers apart from job bills, which share the Invoice number space.
export const COUNTER_SALE_PREFIX = "CS";

export interface CreateOrderInput {
  branchId: string;
  customerId: string;
  customerRefNo?: string;
  customerRefDate?: Date;
  validTill?: Date;
  remarks?: string;
  pick?: boolean;
  lines: { partId: string; quantity: number }[];
}

export interface CreateCounterSaleInput {
  branchId: string;
  customerId: string;
  cashDiscountPercent?: number;
  cashDiscountAmount?: number;
  salesExecutiveId?: string;
  transportMode?: TransportMode;
  transporter?: string;
  grNumber?: string;
  grDate?: Date;
  numberOfCases?: number;
  notes?: string;
  lines: { orderLineId: string; quantity: number }[];
}

export interface CreateReturnInput {
  reason?: string;
  lines: { invoiceLineId: string; quantity: number }[];
}

const userSelect = { select: { id: true, firstName: true, lastName: true } } as const;
const branchSelect = { select: { id: true, name: true, code: true } } as const;
const customerSelect = {
  select: {
    id: true,
    code: true,
    firstName: true,
    lastName: true,
    companyName: true,
    house: true,
    street: true,
    address: true,
    city: true,
    state: true,
    postalCode: true,
    phoneNumber: true,
    creditDays: true,
  },
} as const;
const partSelect = {
  select: { id: true, partNumber: true, name: true, uom: true, binLocation: true, partFlag: true, taxable: true, unitPrice: true },
} as const;

const customerName = (c: { companyName: string | null; firstName: string; lastName: string }) =>
  c.companyName || `${c.firstName} ${c.lastName}`.trim();

type LockedOrder = Awaited<ReturnType<PartSaleService["lockOrder"]>>;

export class PartSaleService {
  private parties = new PartyAccountService();

  // ── Lookups ───────────────────────────────────────────────────────────────

  /** Any active party can buy at CPD, whichever branch registered it. Includes current outstanding. */
  async searchCustomers(search: string) {
    const nameParts = search.trim().split(/\s+/);
    const customers = await prisma.customer.findMany({
      where: {
        mergedIntoId: null,
        OR: [
          ...(nameParts.length > 1 ? [{ firstName: { contains: nameParts[0], mode: "insensitive" as const }, lastName: { contains: nameParts.slice(1).join(" "), mode: "insensitive" as const } }] : []),
          { code: { contains: search, mode: "insensitive" } },
          { companyName: { contains: search, mode: "insensitive" } },
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { phoneNumber: { contains: search } },
        ],
      },
      orderBy: [{ companyName: "asc" }, { firstName: "asc" }],
      take: 15,
      ...customerSelect,
    });
    const balances = customers.length
      ? await prisma.invoice.groupBy({
          by: ["customerId"],
          where: { customerId: { in: customers.map((c) => c.id) }, cancelledAt: null, outstandingAmount: { gt: 0 } },
          _sum: { outstandingAmount: true },
        })
      : [];
    return customers.map((c) => ({
      ...c,
      name: customerName(c),
      outstanding: money(balances.find((b) => b.customerId === c.id)?._sum.outstandingAmount ?? 0),
    }));
  }

  /** Part search with free stock at the selling branch and the retail rate the CPO will use. */
  async searchParts(search: string, branchId: string) {
    return new StockTransferService().searchParts({ search, sourceBranchId: branchId });
  }

  // ── Customer purchase orders ──────────────────────────────────────────────

  async createOrder(input: CreateOrderInput, actorId: string) {
    const [branch, customer] = await Promise.all([
      prisma.branch.findUnique({ where: { id: input.branchId } }),
      prisma.customer.findUnique({ where: { id: input.customerId } }),
    ]);
    if (!branch?.isActive) throw new BadRequestError("Select an active selling branch");
    if (!customer || customer.mergedIntoId) throw new NotFoundError("Customer not found");

    const parts = await prisma.sparePart.findMany({
      where: { id: { in: input.lines.map((l) => l.partId) } },
      select: { id: true, partNumber: true, partStatus: true, retailRate: true },
    });
    const lines = input.lines.map((line) => {
      const part = parts.find((p) => p.id === line.partId);
      if (!part) throw new NotFoundError(`Part ${line.partId} not found`);
      if (part.partStatus !== PartStatus.ACTIVE) throw new BadRequestError(`Part ${part.partNumber} is blocked`);
      if (part.retailRate == null) throw new BadRequestError(`Set the retail rate for ${part.partNumber} in Part Master first`);
      return {
        partId: part.id,
        orderedQuantity: line.quantity,
        retailRate: part.retailRate,
        amount: money(line.quantity * part.retailRate),
      };
    });

    const orderDate = new Date();
    const id = await prisma.$transaction(async (tx) => {
      const order = await tx.customerOrder.create({
        data: {
          cpoNumber: await nextDocumentNumber(tx, DOC_TYPES.CPO, orderDate),
          branchId: branch.id,
          customerId: customer.id,
          customerRefNo: input.customerRefNo,
          customerRefDate: input.customerRefDate,
          orderDate,
          validTill: input.validTill ?? addMonths(orderDate, 3),
          remarks: input.remarks,
          totalQuantity: lines.reduce((s, l) => s + l.orderedQuantity, 0),
          totalAmount: sumMoney(lines.map((l) => l.amount)),
          createdById: actorId,
          lines: { create: lines },
        },
      });
      if (input.pick) await this.pickInTx(tx, order.id);
      return order.id;
    }, TX_OPTIONS);
    return this.getOrder(id);
  }

  async listOrders(filters: { branchId?: string; status?: CustomerOrderStatus; customerId?: string; billable?: boolean; search?: string }) {
    return prisma.customerOrder.findMany({
      where: {
        ...(filters.branchId && { branchId: filters.branchId }),
        ...(filters.status && { status: filters.status }),
        ...(filters.billable && { status: { in: ACTIVE_ORDER } }),
        ...(filters.customerId && { customerId: filters.customerId }),
        ...(filters.search && {
          OR: [
            { cpoNumber: { contains: filters.search } },
            { customerRefNo: { contains: filters.search, mode: "insensitive" } },
            { customer: { code: { contains: filters.search, mode: "insensitive" } } },
            { customer: { companyName: { contains: filters.search, mode: "insensitive" } } },
            { customer: { firstName: { contains: filters.search, mode: "insensitive" } } },
            { lines: { some: { part: { partNumber: { contains: filters.search, mode: "insensitive" } } } } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        branch: branchSelect,
        customer: customerSelect,
        createdBy: userSelect,
        lines: { select: { orderedQuantity: true, pickedQuantity: true, billedQuantity: true, cancelledQuantity: true } },
      },
      take: 300,
    });
  }

  async getOrder(id: string) {
    const order = await prisma.customerOrder.findUnique({
      where: { id },
      include: {
        branch: branchSelect,
        customer: customerSelect,
        createdBy: userSelect,
        lines: {
          orderBy: { part: { partNumber: "asc" } },
          include: {
            part: partSelect,
            invoiceLines: {
              select: { quantity: true, invoice: { select: { id: true, invoiceNumber: true, issuedDate: true, status: true, counterSale: { select: { id: true } } } } },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundError("Customer purchase order not found");
    const stocks = await prisma.inventoryStock.findMany({
      where: { branchId: order.branchId, partId: { in: order.lines.map((l) => l.partId) } },
      select: { partId: true, quantity: true, reservedQuantity: true },
    });
    return {
      ...order,
      lines: order.lines.map((line) => {
        const stock = stocks.find((s) => s.partId === line.partId);
        return { ...line, freeStock: stock ? stock.quantity - stock.reservedQuantity : 0 };
      }),
    };
  }

  /** Reserve stock for the order. With no lines given, picks as much of every open line as stock allows. */
  async pickOrder(id: string, lines?: { lineId: string; quantity: number }[]) {
    const result = await prisma.$transaction((tx) => this.pickInTx(tx, id, lines), TX_OPTIONS);
    return { order: await this.getOrder(id), ...result };
  }

  private async pickInTx(tx: Tx, orderId: string, requested?: { lineId: string; quantity: number }[]) {
    const order = await this.lockOrder(tx, orderId);
    let picked = 0;
    let short = 0;
    // Lock stock in part order so concurrent picks and bills cannot deadlock.
    for (const line of [...order.lines].sort((a, b) => a.partId.localeCompare(b.partId))) {
      const wanted = requested ? (requested.find((r) => r.lineId === line.id)?.quantity ?? 0) : openQuantity(line);
      if (wanted <= 0) continue;
      if (wanted > openQuantity(line)) {
        throw new BadRequestError(`Only ${openQuantity(line)} unit(s) are left to pick for ${line.part.partNumber}`);
      }
      const stock = await lockStock(tx, order.branchId, line.partId);
      const free = stock ? stock.quantity - stock.reservedQuantity : 0;
      if (requested && wanted > free) {
        throw new BadRequestError(`Only ${Math.max(0, free)} unit(s) of ${line.part.partNumber} are free to pick`);
      }
      const take = Math.max(0, Math.min(wanted, free));
      short += wanted - take;
      if (take === 0 || !stock) continue;
      await tx.inventoryStock.update({ where: { id: stock.id }, data: { reservedQuantity: { increment: take } } });
      await tx.customerOrderLine.update({ where: { id: line.id }, data: { pickedQuantity: { increment: take } } });
      picked += take;
    }
    if (requested) {
      const unknown = requested.filter((r) => !order.lines.some((l) => l.id === r.lineId));
      if (unknown.length) throw new BadRequestError("A pick line does not belong to this order");
    }
    return { picked, short };
  }

  /** Give back everything picked on the order to free stock. */
  async releaseOrder(id: string) {
    await prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, id);
      await this.releasePicked(tx, order);
    }, TX_OPTIONS);
    return this.getOrder(id);
  }

  /** Cancel what is left on the order. Billed lines stay billed; picked stock is released. */
  async cancelOrder(id: string, remark: string, actorId: string) {
    await prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, id);
      await this.cancelLinesInTx(tx, order, order.lines, remark, actorId);
      await this.settleCancelledOrder(tx, id, remark);
    }, TX_OPTIONS);
    return this.getOrder(id);
  }

  // ── Data management: pending CPO cancellation ─────────────────────────────

  /** Open CPOs with their lines still to bill (legacy Customer Purchase Order Cancellation "Fill Orders"). */
  async listPendingLines(f: { branchId: string; customerId?: string; from?: string; to?: string; search?: string }) {
    const orders = await prisma.customerOrder.findMany({
      where: {
        branchId: f.branchId,
        status: { in: ACTIVE_ORDER },
        ...(f.customerId && { customerId: f.customerId }),
        ...((f.from || f.to) && { orderDate: { ...(f.from && { gte: reportStart(f.from) }), ...(f.to && { lt: reportEnd(f.to) }) } }),
        ...(f.search && { cpoNumber: { contains: f.search } }),
      },
      orderBy: [{ orderDate: "asc" }, { cpoNumber: "asc" }],
      take: 500,
      include: {
        customer: customerSelect,
        lines: { orderBy: { part: { partNumber: "asc" } }, include: { part: { select: { partNumber: true, name: true } } } },
      },
    });
    return orders
      .map((o) => ({
        id: o.id,
        number: o.cpoNumber,
        date: o.orderDate,
        status: o.status,
        party: customerName(o.customer),
        lines: o.lines
          .map((l) => ({
            id: l.id,
            partNumber: l.part.partNumber,
            description: l.part.name,
            ordered: l.orderedQuantity,
            pending: billableQuantity(l),
            picked: l.pickedQuantity,
          }))
          .filter((l) => l.pending > 0),
      }))
      .filter((o) => o.lines.length > 0);
  }

  /** The orders the given lines belong to, for access checks. */
  async getLineOrders(lineIds: string[]) {
    const ids = [...new Set(lineIds)];
    const lines = await prisma.customerOrderLine.findMany({
      where: { id: { in: ids } },
      select: { order: { select: { id: true, branchId: true } } },
    });
    if (lines.length !== ids.length) throw new NotFoundError("One or more CPO lines were not found");
    return [...new Map(lines.map((l) => [l.order.id, l.order])).values()];
  }

  /** Cancels what is left to bill on the ticked lines, across one or more CPOs, with one remark. */
  async cancelPendingLines(lineIds: string[], remark: string, actorId: string) {
    // Orders in id order, so two users cancelling overlapping orders queue instead of deadlocking.
    const orderIds = (await this.getLineOrders(lineIds)).map((o) => o.id).sort();
    const units = await prisma.$transaction(async (tx) => {
      let total = 0;
      for (const orderId of orderIds) {
        const order = await this.lockOrder(tx, orderId);
        const cancelled = await this.cancelLinesInTx(tx, order, order.lines.filter((l) => lineIds.includes(l.id)), remark, actorId);
        if (cancelled) await this.settleCancelledOrder(tx, orderId, remark);
        total += cancelled;
      }
      if (!total) throw new BadRequestError("Nothing is left to bill on the selected lines");
      return total;
    }, TX_OPTIONS);
    const orders = await prisma.customerOrder.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, cpoNumber: true, status: true },
      orderBy: { cpoNumber: "asc" },
    });
    return { orders, units };
  }

  /** Cancels what is left to bill on the lines (legacy cancelledQty); their picked stock is released. */
  private async cancelLinesInTx(tx: Tx, order: LockedOrder, lines: LockedOrder["lines"], remark: string, actorId: string) {
    await this.releasePicked(tx, order, lines);
    let total = 0;
    const now = new Date();
    for (const line of lines) {
      const left = billableQuantity(line);
      if (left <= 0) continue;
      total += left;
      await tx.customerOrderLine.update({
        where: { id: line.id },
        data: { cancelledQuantity: { increment: left }, cancelledAt: now, cancelledById: actorId, cancelRemark: remark },
      });
    }
    return total;
  }

  /** An order with nothing left to bill is closed as cancelled; otherwise its status follows its lines. */
  private async settleCancelledOrder(tx: Tx, orderId: string, remark: string) {
    const lines = await tx.customerOrderLine.findMany({ where: { orderId } });
    if (lines.some((l) => billableQuantity(l) > 0)) return this.refreshOrderStatuses(tx, [orderId]);
    const now = new Date();
    await tx.customerOrder.update({
      where: { id: orderId },
      data: {
        status: lines.some((l) => l.billedQuantity > 0) ? CustomerOrderStatus.BILLED : CustomerOrderStatus.CANCELLED,
        cancelledAt: now,
        closedAt: now,
        cancelRemark: remark,
      },
    });
  }

  private async releasePicked(tx: Tx, order: LockedOrder, lines = order.lines) {
    for (const line of [...lines].sort((a, b) => a.partId.localeCompare(b.partId))) {
      if (line.pickedQuantity <= 0) continue;
      const stock = await lockStock(tx, order.branchId, line.partId);
      if (!stock || stock.reservedQuantity < line.pickedQuantity) {
        throw new ConflictError(`Reserved stock for ${line.part.partNumber} no longer matches the pick; nothing was released`);
      }
      await tx.inventoryStock.update({ where: { id: stock.id }, data: { reservedQuantity: { decrement: line.pickedQuantity } } });
      await tx.customerOrderLine.update({ where: { id: line.id }, data: { pickedQuantity: 0 } });
    }
  }

  private async lockOrder(tx: Tx, id: string) {
    const locked = await tx.$queryRaw<{ status: CustomerOrderStatus }[]>`
      SELECT "status" FROM "CustomerOrder" WHERE "id" = ${id} FOR UPDATE`;
    if (!locked[0]) throw new NotFoundError("Customer purchase order not found");
    if (!ACTIVE_ORDER.includes(locked[0].status)) {
      throw new ConflictError(`This order is ${locked[0].status.toLowerCase().replace("_", " ")} and can no longer change`);
    }
    return tx.customerOrder.findUniqueOrThrow({
      where: { id },
      include: { lines: { include: { part: { select: { partNumber: true } } } } },
    });
  }

  private async refreshOrderStatuses(tx: Tx, orderIds: string[]) {
    for (const orderId of orderIds) {
      const order = await tx.customerOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
      // A cancelled order keeps its cancelled state; only active orders follow their lines.
      if (order.cancelledAt) continue;
      const status = orderStatus(order.lines);
      await tx.customerOrder.update({
        where: { id: orderId },
        data: { status, closedAt: status === CustomerOrderStatus.BILLED ? new Date() : null },
      });
    }
  }

  // ── Counter-sale bills ────────────────────────────────────────────────────

  async createCounterSale(input: CreateCounterSaleInput, actorId: string) {
    const counterSaleId = await prisma.$transaction(async (tx) => {
      const customer = await lockParty(tx, input.customerId);
      const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
      if (!branch?.isActive) throw new BadRequestError("Select an active selling branch");
      if (input.salesExecutiveId) {
        const executive = await tx.user.findUnique({ where: { id: input.salesExecutiveId } });
        if (!executive?.isActive) throw new BadRequestError("Select an active sales executive");
      }

      const requested = await tx.customerOrderLine.findMany({
        where: { id: { in: input.lines.map((l) => l.orderLineId) } },
        select: { id: true, orderId: true },
      });
      if (requested.length !== input.lines.length) throw new NotFoundError("One or more order lines were not found");
      const orderIds = [...new Set(requested.map((l) => l.orderId))].sort();
      // Lock every order first (in id order) so nothing else picks or bills these lines meanwhile.
      const orders = [];
      for (const orderId of orderIds) orders.push(await this.lockOrder(tx, orderId));
      for (const order of orders) {
        if (order.customerId !== customer.id) throw new BadRequestError(`CPO ${order.cpoNumber} belongs to another customer`);
        if (order.branchId !== branch.id) throw new BadRequestError(`CPO ${order.cpoNumber} belongs to another branch`);
      }
      const orderLines = await tx.customerOrderLine.findMany({
        where: { id: { in: input.lines.map((l) => l.orderLineId) } },
        include: { part: partSelect, order: { select: { cpoNumber: true } } },
        orderBy: { partId: "asc" },
      });

      const quantityOf = (lineId: string) => input.lines.find((l) => l.orderLineId === lineId)!.quantity;
      const gross = sumMoney(orderLines.map((l) => money(quantityOf(l.id) * l.retailRate)));
      const discountPercent =
        input.cashDiscountAmount !== undefined
          ? discountPercentFromAmount(gross, input.cashDiscountAmount)
          : (input.cashDiscountPercent ?? 0);
      const priced = priceSale(
        orderLines.map((l) => ({ quantity: quantityOf(l.id), rate: l.retailRate, vatPercent: l.part.taxable ? VAT_RATE : 0 })),
        discountPercent,
      );

      // Issue stock: picked (reserved) units first, then free stock.
      const issues: { partId: string; quantity: number; note: string }[] = [];
      for (const line of orderLines) {
        const quantity = quantityOf(line.id);
        const stock = await lockStock(tx, branch.id, line.partId);
        const free = stock ? stock.quantity - stock.reservedQuantity : 0;
        let plan;
        try {
          plan = planIssue(line, quantity, free);
        } catch (error) {
          if (error instanceof BadRequestError) throw new BadRequestError(`${line.part.partNumber}: ${error.message}`);
          throw error;
        }
        if (!stock || stock.reservedQuantity < plan.fromPicked || stock.quantity < quantity) {
          throw new ConflictError(`Stock for ${line.part.partNumber} no longer covers this bill; nothing was posted`);
        }
        await tx.inventoryStock.update({
          where: { id: stock.id },
          data: { quantity: { decrement: quantity }, reservedQuantity: { decrement: plan.fromPicked } },
        });
        await tx.customerOrderLine.update({
          where: { id: line.id },
          data: { pickedQuantity: { decrement: plan.fromPicked }, billedQuantity: { increment: quantity } },
        });
        issues.push({ partId: line.partId, quantity, note: `CPO ${line.order.cpoNumber}` });
      }

      const now = new Date();
      const invoiceNumber = `${COUNTER_SALE_PREFIX}${await nextDocumentNumber(tx, DOC_TYPES.COUNTER_SALE, now)}`;
      const { totals } = priced;
      const invoice = await tx.invoice.create({
        data: {
          customerId: customer.id,
          invoiceNumber,
          reportBranchId: branch.id,
          issuedDate: now,
          dueDate: creditDueDate(now, customer.creditDays ?? (await defaultCreditDays(tx))),
          subtotal: totals.gross,
          partsTotal: totals.gross,
          partsDiscountPercent: discountPercent,
          partsDiscountAmount: totals.discount,
          vatRate: VAT_RATE,
          vatAmount: totals.vat,
          tax: totals.vat,
          roundOff: totals.roundOff,
          total: totals.total,
          outstandingAmount: totals.total,
          status: totals.total === 0 ? "Paid" : "Unpaid",
          notes: input.notes ?? `Counter sale against CPO ${orders.map((o) => o.cpoNumber).join(", ")}`,
          lines: {
            createMany: {
              data: orderLines.map((line, index) => ({
                type: "PART",
                partId: line.partId,
                description: line.part.name,
                quantity: quantityOf(line.id),
                rate: line.retailRate,
                amount: priced.lines[index].gross,
                customerOrderLineId: line.id,
                vatPercent: priced.lines[index].vatPercent,
                unitCost: line.part.unitPrice,
              })),
            },
          },
          counterSale: {
            create: {
              branchId: branch.id,
              salesExecutiveId: input.salesExecutiveId ?? actorId,
              transportMode: input.transportMode,
              transporter: input.transporter,
              grNumber: input.grNumber,
              grDate: input.grDate,
              numberOfCases: input.numberOfCases,
              gatePassNumber: await nextDocumentNumber(tx, DOC_TYPES.GATE_PASS, now),
            },
          },
        },
        include: { counterSale: { select: { id: true } } },
      });
      await tx.stockTransaction.createMany({
        data: issues.map((issue) => ({
          branchId: branch.id,
          partId: issue.partId,
          type: "ISSUED",
          quantity: -issue.quantity,
          referenceId: invoice.id,
          notes: `Counter sale ${invoiceNumber} (${issue.note})`,
          recordedById: actorId,
        })),
      });
      await this.refreshOrderStatuses(tx, orderIds);
      return invoice.counterSale!.id;
    }, TX_OPTIONS);
    return this.getCounterSale(counterSaleId);
  }

  async listCounterSales(filters: { branchId?: string; customerId?: string; search?: string }) {
    return prisma.counterSale.findMany({
      where: {
        ...(filters.branchId && { branchId: filters.branchId }),
        ...(filters.customerId && { invoice: { customerId: filters.customerId } }),
        ...(filters.search && {
          OR: [
            { invoice: { invoiceNumber: { contains: filters.search, mode: "insensitive" } } },
            { invoice: { customer: { code: { contains: filters.search, mode: "insensitive" } } } },
            { invoice: { customer: { companyName: { contains: filters.search, mode: "insensitive" } } } },
            { invoice: { customer: { firstName: { contains: filters.search, mode: "insensitive" } } } },
            { invoice: { lines: { some: { customerOrderLine: { order: { cpoNumber: { contains: filters.search } } } } } } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        branch: branchSelect,
        salesExecutive: userSelect,
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            issuedDate: true,
            total: true,
            outstandingAmount: true,
            status: true,
            customer: customerSelect,
            _count: { select: { lines: true } },
          },
        },
        _count: { select: { returns: true } },
      },
      take: 300,
    });
  }

  async getCounterSale(id: string) {
    const sale = await prisma.counterSale.findUnique({
      where: { id },
      include: {
        branch: branchSelect,
        salesExecutive: userSelect,
        invoice: {
          include: {
            customer: customerSelect,
            cancelledBy: userSelect,
            lines: {
              orderBy: { part: { partNumber: "asc" } },
              include: {
                part: partSelect,
                customerOrderLine: { select: { order: { select: { id: true, cpoNumber: true, customerRefNo: true } } } },
              },
            },
          },
        },
        returns: {
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: userSelect,
            creditNote: { select: { id: true, number: true, remainingAmount: true } },
            lines: { include: { part: partSelect } },
          },
        },
      },
    });
    if (!sale) throw new NotFoundError("Counter sale not found");
    return {
      ...sale,
      returns: sale.returns.map((r) => ({
        ...r,
        creditNote: r.creditNote && { ...r.creditNote, remainingAmount: Number(r.creditNote.remainingAmount) },
      })),
    };
  }

  /** Cancel an unpaid bill: stock goes back and the CPO lines are open to bill again. */
  async cancelCounterSale(id: string, remark: string, actorId: string) {
    await prisma.$transaction(async (tx) => {
      const sale = await tx.counterSale.findUnique({ where: { id }, select: { invoiceId: true, branchId: true } });
      if (!sale) throw new NotFoundError("Counter sale not found");
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${sale.invoiceId} FOR UPDATE`;
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: sale.invoiceId },
        include: { lines: { include: { customerOrderLine: { select: { id: true, orderId: true } } } } },
      });
      if (invoice.cancelledAt) throw new ConflictError("This bill is already cancelled");
      if (invoice.tallyPostedAt) throw new BadRequestError("A bill posted to Tally cannot be cancelled");
      const [returns, payments, receipts, allocations] = await Promise.all([
        tx.counterSaleReturn.count({ where: { counterSaleId: id } }),
        tx.payment.count({ where: { invoiceId: invoice.id, receiptId: null } }),
        tx.receipt.count({ where: { invoiceId: invoice.id, status: "ACTIVE" } }),
        tx.receiptAllocation.count({ where: { invoiceId: invoice.id, reversedAt: null } }),
      ]);
      if (returns) throw new ConflictError("A bill with sale returns cannot be cancelled");
      if (payments + receipts + allocations) throw new ConflictError("A bill with allocated receipts or payments cannot be cancelled");

      const orderIds = [...new Set(invoice.lines.map((l) => l.customerOrderLine?.orderId).filter(Boolean) as string[])].sort();
      const cancelledOrders = new Set(
        (await tx.customerOrder.findMany({ where: { id: { in: orderIds }, cancelledAt: { not: null } }, select: { id: true } })).map((o) => o.id),
      );
      for (const orderId of orderIds) await tx.$queryRaw`SELECT id FROM "CustomerOrder" WHERE id = ${orderId} FOR UPDATE`;

      for (const line of [...invoice.lines].sort((a, b) => (a.partId ?? "").localeCompare(b.partId ?? ""))) {
        if (!line.partId) continue;
        const quantity = line.quantity;
        await tx.inventoryStock.upsert({
          where: { branchId_partId: { branchId: sale.branchId, partId: line.partId } },
          update: { quantity: { increment: quantity } },
          create: { branchId: sale.branchId, partId: line.partId, quantity },
        });
        await tx.stockTransaction.create({
          data: {
            branchId: sale.branchId,
            partId: line.partId,
            type: "RETURNED",
            quantity,
            referenceId: invoice.id,
            notes: `Counter sale ${invoice.invoiceNumber} cancelled`,
            recordedById: actorId,
          },
        });
        if (line.customerOrderLine) {
          // Units go back to the order; on an order already cancelled they stay cancelled.
          const cancelled = cancelledOrders.has(line.customerOrderLine.orderId);
          await tx.customerOrderLine.update({
            where: { id: line.customerOrderLine.id },
            data: { billedQuantity: { decrement: quantity }, ...(cancelled && { cancelledQuantity: { increment: quantity } }) },
          });
        }
      }
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: "Cancelled", cancelledAt: new Date(), cancelledById: actorId, cancelRemark: remark },
      });
      await this.refreshOrderStatuses(tx, orderIds.filter((o) => !cancelledOrders.has(o)));
    }, TX_OPTIONS);
    return this.getCounterSale(id);
  }

  // ── Sale returns ──────────────────────────────────────────────────────────

  /**
   * Take parts back into stock and credit the customer. The credit note is set off against
   * the bill's outstanding straight away; anything beyond it stays as party credit.
   */
  async createReturn(counterSaleId: string, input: CreateReturnInput, actorId: string) {
    await withPartyTransaction(async (tx) => {
      const sale = await tx.counterSale.findUnique({ where: { id: counterSaleId }, select: { invoiceId: true, branchId: true } });
      if (!sale) throw new NotFoundError("Counter sale not found");
      const head = await tx.invoice.findUniqueOrThrow({ where: { id: sale.invoiceId }, select: { customerId: true } });
      const customer = await lockParty(tx, head.customerId);
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${sale.invoiceId} FOR UPDATE`;
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: sale.invoiceId }, include: { lines: true } });
      if (invoice.cancelledAt) throw new ConflictError("A cancelled bill cannot take returns");

      const lines = input.lines.map((request) => {
        const line = invoice.lines.find((l) => l.id === request.invoiceLineId);
        if (!line?.partId) throw new BadRequestError("A return line does not belong to this bill");
        if (request.quantity > returnableQuantity(line)) {
          throw new BadRequestError(`Only ${returnableQuantity(line)} unit(s) of ${line.description} can still be returned`);
        }
        return { line, partId: line.partId, quantity: request.quantity };
      });
      const priced = priceSale(
        lines.map(({ line, quantity }) => ({ quantity, rate: line.rate, vatPercent: line.vatPercent ?? 0 })),
        invoice.partsDiscountPercent,
      );
      const { totals } = priced;
      const now = new Date();
      const returnId = randomUUID();
      const returnNumber = await nextDocumentNumber(tx, DOC_TYPES.SALE_RETURN, now);

      for (const { line, partId, quantity } of [...lines].sort((a, b) => a.partId.localeCompare(b.partId))) {
        await tx.inventoryStock.upsert({
          where: { branchId_partId: { branchId: sale.branchId, partId } },
          update: { quantity: { increment: quantity } },
          create: { branchId: sale.branchId, partId, quantity },
        });
        // The InvoiceLine check constraint stops anything returning beyond what was billed.
        await tx.invoiceLine.update({ where: { id: line.id }, data: { returnedQuantity: { increment: quantity } } });
      }
      await tx.stockTransaction.createMany({
        data: lines.map(({ partId, quantity }) => ({
          branchId: sale.branchId,
          partId,
          type: "RETURNED",
          quantity,
          referenceId: returnId,
          notes: `Sale return ${returnNumber} against counter sale ${invoice.invoiceNumber}`,
          recordedById: actorId,
        })),
      });

      let creditNoteId: string | undefined;
      if (totals.total > 0) {
        const note = await tx.partyNote.create({
          data: {
            customerId: customer.id,
            branchId: sale.branchId,
            direction: "CREDIT",
            type: "SALE_RETURN",
            date: now,
            number: await nextFinanceNumber(tx, "CREDIT_NOTE", now),
            narration: `Sale return ${returnNumber} against counter sale ${invoice.invoiceNumber}`,
            amount: new Prisma.Decimal(totals.total),
            remainingAmount: new Prisma.Decimal(totals.total),
            // Not exported to Tally until counter sales and their returns are mapped there.
            tallyExcluded: true,
            createdById: actorId,
            partyCode: customer.code,
            partyName: customerName(customer),
            partyAddress: [customer.house, customer.street, customer.address].filter(Boolean).join(", "),
            partyCity: customer.city,
            partyState: customer.state,
          },
        });
        creditNoteId = note.id;
        const setOff = money(Math.min(invoice.outstandingAmount, totals.total));
        if (setOff > 0) {
          await this.parties.applyAdjustment(
            tx,
            {
              customerId: customer.id,
              branchId: sale.branchId,
              date: now.toISOString(),
              source: "SALE_RETURN",
              idempotencyKey: returnId,
              debits: [{ id: invoice.id, kind: "INVOICE", amount: setOff }],
              credits: [{ id: note.id, kind: "NOTE", amount: setOff }],
            },
            actorId,
          );
        }
      }

      await tx.counterSaleReturn.create({
        data: {
          id: returnId,
          returnNumber,
          counterSaleId,
          branchId: sale.branchId,
          customerId: customer.id,
          returnDate: now,
          reason: input.reason,
          grossAmount: totals.gross,
          discountAmount: totals.discount,
          vatAmount: totals.vat,
          roundOff: totals.roundOff,
          total: totals.total,
          creditNoteId,
          createdById: actorId,
          lines: {
            create: lines.map(({ line, partId, quantity }, index) => ({
              invoiceLineId: line.id,
              partId,
              quantity,
              rate: line.rate,
              amount: priced.lines[index].gross,
            })),
          },
        },
      });
    });
    return this.getCounterSale(counterSaleId);
  }

  async listReturns(filters: { branchId?: string; search?: string }) {
    return prisma.counterSaleReturn.findMany({
      where: {
        ...(filters.branchId && { branchId: filters.branchId }),
        ...(filters.search && {
          OR: [
            { returnNumber: { contains: filters.search } },
            { counterSale: { invoice: { invoiceNumber: { contains: filters.search, mode: "insensitive" } } } },
            { customer: { code: { contains: filters.search, mode: "insensitive" } } },
            { customer: { companyName: { contains: filters.search, mode: "insensitive" } } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        customer: customerSelect,
        createdBy: userSelect,
        counterSale: { select: { id: true, invoice: { select: { invoiceNumber: true } } } },
        creditNote: { select: { id: true, number: true } },
        _count: { select: { lines: true } },
      },
      take: 300,
    });
  }
}

export default PartSaleService;
