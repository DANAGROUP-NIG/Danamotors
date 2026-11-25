/**
 * Dispatch challans (legacy AutoEnhancer challanhead/challandetail and ChallanRetHead/ChallanRetDetail).
 *
 * An unbilled issue of fuel and consumables to an internal cost centre: petrol and diesel for the
 * KP associate vehicles, PDI, Allen 5, the gensets; cotton waste and gloves for the workshop. The
 * cost centre is a party (legacy challanhead.customer). The challan takes the stock out and values
 * it at the part's retail rate (legacy challandetail.retailrate), with a gate pass; it is never
 * billed. A challan return puts stock back against the challan's lines.
 *
 * Group units that used to be "billed" without VAT (diesel engine oil to Allen 5, Ilupeju, Dana Air
 * on counter-sale tax form X) are challans too.
 */
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { lockStock, nextDocumentNumber } from "../stock-transfer/stockTransfer.service";
import { DOC_TYPES } from "../stock-transfer/stockTransfer.logic";
import { lockParty } from "../finance/party-account.service";
import { money, sumMoney } from "../finance/money";
import { reportEnd, reportStart } from "../finance/party-report";

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

export interface CreateChallanInput {
  branchId: string;
  customerId: string;
  remarks?: string;
  lines: { partId: string; quantity: number }[];
}

export interface CreateChallanReturnInput {
  reason?: string;
  /** Return everything still out on the challan (legacy Full Return); `lines` is then ignored. */
  fullReturn?: boolean;
  lines?: { challanLineId: string; quantity: number }[];
}

export interface ListChallansInput {
  branchId?: string;
  customerId?: string;
  search?: string;
  from?: string;
  to?: string;
}

const userSelect = { select: { id: true, firstName: true, lastName: true } } as const;
const branchSelect = { select: { id: true, name: true, code: true } } as const;
const customerSelect = {
  select: { id: true, code: true, firstName: true, lastName: true, companyName: true, house: true, street: true, address: true, city: true, state: true, postalCode: true, phoneNumber: true, creditDays: true },
} as const;
const partSelect = { select: { id: true, partNumber: true, name: true, uom: true, partFlag: true } } as const;

const challanInclude = {
  branch: branchSelect,
  customer: customerSelect,
  createdBy: userSelect,
  lines: { include: { part: partSelect }, orderBy: { part: { partNumber: "asc" } } },
  returns: {
    include: { createdBy: userSelect, lines: { include: { part: partSelect } } },
    orderBy: { returnDate: "asc" },
  },
} satisfies Prisma.DispatchChallanInclude;

/** Units of a challan line still out with the cost centre. */
export const outstandingQuantity = (line: { quantity: number; returnedQuantity: number }) => line.quantity - line.returnedQuantity;

export class DispatchChallanService {
  async createChallan(input: CreateChallanInput, actorId: string) {
    const challanId = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
      if (!branch?.isActive) throw new BadRequestError("Select an active branch");
      const customer = await lockParty(tx, input.customerId);

      const parts = await tx.sparePart.findMany({
        where: { id: { in: input.lines.map((l) => l.partId) } },
        select: { id: true, partNumber: true, name: true, retailRate: true },
      });
      if (parts.length !== input.lines.length) throw new NotFoundError("One or more parts were not found");
      const partOf = new Map(parts.map((p) => [p.id, p]));

      // Lock stock rows in part order so two challans for the same parts cannot deadlock.
      const lines = [...input.lines].sort((a, b) => a.partId.localeCompare(b.partId));
      const priced = [];
      for (const line of lines) {
        const part = partOf.get(line.partId)!;
        if (part.retailRate == null) throw new BadRequestError(`${part.partNumber} has no retail rate. Set it in Part Master first.`);
        const stock = await lockStock(tx, branch.id, line.partId);
        const free = stock ? stock.quantity - stock.reservedQuantity : 0;
        if (!stock || free < line.quantity) {
          throw new ConflictError(`Only ${Math.max(0, free)} of ${part.partNumber} free at ${branch.name}; nothing was issued`);
        }
        await tx.inventoryStock.update({ where: { id: stock.id }, data: { quantity: { decrement: line.quantity } } });
        priced.push({ partId: line.partId, quantity: line.quantity, rate: part.retailRate, amount: money(line.quantity * part.retailRate) });
      }

      const now = new Date();
      const challanNumber = await nextDocumentNumber(tx, DOC_TYPES.CHALLAN, now);
      const challan = await tx.dispatchChallan.create({
        data: {
          challanNumber,
          branchId: branch.id,
          customerId: customer.id,
          challanDate: now,
          gatePassNumber: await nextDocumentNumber(tx, DOC_TYPES.GATE_PASS, now),
          remarks: input.remarks,
          totalQuantity: priced.reduce((s, l) => s + l.quantity, 0),
          totalAmount: sumMoney(priced.map((l) => l.amount)),
          createdById: actorId,
          lines: { createMany: { data: priced } },
        },
      });
      await tx.stockTransaction.createMany({
        data: priced.map((l) => ({
          branchId: branch.id,
          partId: l.partId,
          type: "ISSUED",
          quantity: -l.quantity,
          referenceId: challan.id,
          notes: `Dispatch challan ${challanNumber}`,
          recordedById: actorId,
        })),
      });
      return challan.id;
    }, TX_OPTIONS);
    return this.getChallan(challanId);
  }

  async getChallan(id: string) {
    const challan = await prisma.dispatchChallan.findUnique({ where: { id }, include: challanInclude });
    if (!challan) throw new NotFoundError("Dispatch challan not found");
    return challan;
  }

  async listChallans(input: ListChallansInput) {
    const search = input.search?.trim();
    const challans = await prisma.dispatchChallan.findMany({
      where: {
        ...(input.branchId && { branchId: input.branchId }),
        ...(input.customerId && { customerId: input.customerId }),
        ...((input.from || input.to) && {
          challanDate: { ...(input.from && { gte: reportStart(input.from) }), ...(input.to && { lt: reportEnd(input.to) }) },
        }),
        ...(search && {
          OR: [
            { challanNumber: { contains: search } },
            { gatePassNumber: { contains: search } },
            { customer: { code: { contains: search, mode: "insensitive" } } },
            { customer: { companyName: { contains: search, mode: "insensitive" } } },
            { customer: { firstName: { contains: search, mode: "insensitive" } } },
            { lines: { some: { part: { partNumber: { contains: search, mode: "insensitive" } } } } },
          ],
        }),
      },
      include: {
        branch: branchSelect,
        customer: customerSelect,
        createdBy: userSelect,
        lines: { select: { quantity: true, returnedQuantity: true, part: { select: { partNumber: true, name: true } } } },
      },
      orderBy: [{ challanDate: "desc" }, { challanNumber: "desc" }],
      take: 300,
    });
    return challans.map(({ lines, ...challan }) => ({
      ...challan,
      lineCount: lines.length,
      returnedQuantity: lines.reduce((s, l) => s + l.returnedQuantity, 0),
      parts: lines.map((l) => l.part.partNumber),
      firstPartName: lines[0]?.part.name ?? null,
    }));
  }

  async listReturns(input: ListChallansInput) {
    return prisma.dispatchChallanReturn.findMany({
      where: {
        ...(input.branchId && { branchId: input.branchId }),
        ...(input.customerId && { challan: { customerId: input.customerId } }),
        ...((input.from || input.to) && {
          returnDate: { ...(input.from && { gte: reportStart(input.from) }), ...(input.to && { lt: reportEnd(input.to) }) },
        }),
        ...(input.search?.trim() && {
          OR: [
            { returnNumber: { contains: input.search.trim() } },
            { challan: { challanNumber: { contains: input.search.trim() } } },
          ],
        }),
      },
      include: {
        branch: branchSelect,
        createdBy: userSelect,
        challan: { select: { id: true, challanNumber: true, challanDate: true, customer: customerSelect } },
      },
      orderBy: [{ returnDate: "desc" }, { returnNumber: "desc" }],
      take: 300,
    });
  }

  async createReturn(challanId: string, input: CreateChallanReturnInput, actorId: string) {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "DispatchChallan" WHERE id = ${challanId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundError("Dispatch challan not found");
      const challan = await tx.dispatchChallan.findUniqueOrThrow({
        where: { id: challanId },
        include: { lines: { include: { part: partSelect } } },
      });

      const requested = input.fullReturn
        ? challan.lines.filter((l) => outstandingQuantity(l) > 0).map((l) => ({ line: l, quantity: outstandingQuantity(l) }))
        : (input.lines ?? []).map((r) => {
            const line = challan.lines.find((l) => l.id === r.challanLineId);
            if (!line) throw new BadRequestError("A return line does not belong to this challan");
            if (r.quantity > outstandingQuantity(line)) {
              throw new BadRequestError(`Only ${outstandingQuantity(line)} of ${line.part.partNumber} can still be returned`);
            }
            return { line, quantity: r.quantity };
          });
      if (requested.length === 0) {
        throw new BadRequestError(input.fullReturn ? "Everything on this challan has already been returned" : "Select at least one line to return");
      }

      const now = new Date();
      const returnId = randomUUID();
      const returnNumber = await nextDocumentNumber(tx, DOC_TYPES.CHALLAN_RETURN, now);
      const priced = requested.map(({ line, quantity }) => ({ line, quantity, amount: money(quantity * line.rate) }));

      for (const { line, quantity } of [...priced].sort((a, b) => a.line.partId.localeCompare(b.line.partId))) {
        // Guarded update: a concurrent return cannot push a line past what it issued.
        const updated = await tx.dispatchChallanLine.updateMany({
          where: { id: line.id, returnedQuantity: { lte: line.quantity - quantity } },
          data: { returnedQuantity: { increment: quantity } },
        });
        if (updated.count !== 1) throw new ConflictError(`${line.part.partNumber} was returned meanwhile; nothing was posted`);
        await tx.inventoryStock.upsert({
          where: { branchId_partId: { branchId: challan.branchId, partId: line.partId } },
          update: { quantity: { increment: quantity } },
          create: { branchId: challan.branchId, partId: line.partId, quantity },
        });
      }

      // Full return: nothing is left out on the challan after this return.
      const fullReturn = challan.lines.every((l) => {
        const back = priced.find((p) => p.line.id === l.id)?.quantity ?? 0;
        return outstandingQuantity(l) - back === 0;
      });
      await tx.dispatchChallanReturn.create({
        data: {
          id: returnId,
          returnNumber,
          challanId: challan.id,
          branchId: challan.branchId,
          returnDate: now,
          fullReturn,
          reason: input.reason,
          totalQuantity: priced.reduce((s, p) => s + p.quantity, 0),
          totalAmount: sumMoney(priced.map((p) => p.amount)),
          createdById: actorId,
          lines: {
            createMany: {
              data: priced.map(({ line, quantity, amount }) => ({ challanLineId: line.id, partId: line.partId, quantity, rate: line.rate, amount })),
            },
          },
        },
      });
      await tx.stockTransaction.createMany({
        data: priced.map(({ line, quantity }) => ({
          branchId: challan.branchId,
          partId: line.partId,
          type: "RETURNED",
          quantity,
          referenceId: returnId,
          notes: `Challan return ${returnNumber} (challan ${challan.challanNumber})`,
          recordedById: actorId,
        })),
      });
    }, TX_OPTIONS);
    return this.getChallan(challanId);
  }

  /** The branch of a challan, for the branch access check before a return. */
  async branchOf(challanId: string) {
    const challan = await prisma.dispatchChallan.findUnique({ where: { id: challanId }, select: { branchId: true } });
    if (!challan) throw new NotFoundError("Dispatch challan not found");
    return challan.branchId;
  }
}
