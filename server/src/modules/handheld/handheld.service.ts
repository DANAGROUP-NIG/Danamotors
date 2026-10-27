/**
 * Handheld (HHDC) documents other than stock-take sheets (legacy AEBRINDENT, AECPO and AEMIT on the
 * device, HHDCDownloadHead/Detail and the MIT pctohhdc/hhdctopc flags on the PC).
 *
 *   picking list / CPO / MIT ──► send (snapshot for the device) ──► upload once ──► effect
 *
 * Effects of an upload: an indent pick drops each reservation to what was picked and returns the short
 * to back order; a CPO pick returns the short to free stock; an MIT is marked VERIFIED and its counts
 * prefill the MRN, which the store still posts on the web. Substitutes and parts not on an MIT are
 * recorded for the store only. HHDC Link (outside this repo) moves the files to and from the device.
 */
import {
  CustomerOrderStatus,
  HandheldDocumentStatus,
  HandheldDocumentType,
  HandheldShortReason,
  MitStatus,
  PickingListStatus,
  Prisma,
} from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { nextDocumentNumber, StockTransferService } from "../stock-transfer/stockTransfer.service";
import { DOC_TYPES } from "../stock-transfer/stockTransfer.logic";
import { PartSaleService } from "../part-sale/partSale.service";
import { planUpload, UploadExtraInput, UploadLineInput } from "./handheld.logic";

type Tx = Prisma.TransactionClient;

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };
const ACTIVE_ORDER: CustomerOrderStatus[] = [CustomerOrderStatus.OPEN, CustomerOrderStatus.PARTLY_BILLED];
const { INDENT_PICK, CPO_PICK } = HandheldDocumentType;
const notSent = { handheldDocuments: { none: { status: HandheldDocumentStatus.SENT } } };

export interface CreateDocumentInput {
  type: HandheldDocumentType;
  sourceId: string;
  pickerId: string;
}

export interface UploadInput {
  lines: UploadLineInput[];
  extras?: UploadExtraInput[];
  unreportedReason?: HandheldShortReason;
}

interface DraftLine {
  pickingListLineId?: string;
  customerOrderLineId?: string;
  mitLineId?: string;
  partId: string;
  partNumber: string;
  partName: string;
  binLocation: string | null;
  caseNumber?: string | null;
  expectedQuantity: number;
}

const documentInclude = {
  lines: { orderBy: { lineNumber: "asc" } },
  branch: { select: { id: true, name: true } },
  picker: { select: { id: true, code: true, name: true } },
  sentBy: { select: { firstName: true, lastName: true } },
  uploadedBy: { select: { firstName: true, lastName: true } },
  cancelledBy: { select: { firstName: true, lastName: true } },
  pickingList: {
    select: {
      id: true,
      pickingNumber: true,
      status: true,
      indent: { select: { id: true, indentNumber: true, requestingBranch: { select: { id: true, name: true } } } },
    },
  },
  customerOrder: {
    select: { id: true, cpoNumber: true, status: true, customer: { select: { id: true, code: true, companyName: true, firstName: true, lastName: true } } },
  },
  mit: { select: { id: true, mitNumber: true, status: true, invoiceNumber: true, vendor: true } },
} satisfies Prisma.HandheldDocumentInclude;

const byBinThenPart = (a: DraftLine, b: DraftLine) =>
  (a.binLocation ?? "￿").localeCompare(b.binLocation ?? "￿") || a.partNumber.localeCompare(b.partNumber);
const byCaseThenPart = (a: DraftLine, b: DraftLine) =>
  (a.caseNumber ?? "").localeCompare(b.caseNumber ?? "") || a.partNumber.localeCompare(b.partNumber);

export class HandheldService {
  private transfers = new StockTransferService();
  private partSale = new PartSaleService();

  /** Documents that can be sent to a handheld now: open picking lists, picked CPOs, MITs in transit. */
  async listSources(type: HandheldDocumentType, branchId?: string) {
    if (type === INDENT_PICK) {
      const lists = await prisma.pickingList.findMany({
        where: { status: PickingListStatus.OPEN, ...(branchId && { branchId }), ...notSent, lines: { some: { pickedQuantity: { gt: 0 } } } },
        orderBy: { createdAt: "asc" },
        take: 300,
        include: {
          indent: { select: { indentNumber: true, orderDate: true, requestingBranch: { select: { name: true } } } },
          lines: { select: { pickedQuantity: true } },
        },
      });
      return lists.map((p) => ({
        sourceId: p.id,
        branchId: p.branchId,
        number: p.indent.indentNumber,
        reference: p.pickingNumber,
        date: p.indent.orderDate,
        party: p.indent.requestingBranch.name,
        lines: p.lines.filter((l) => l.pickedQuantity > 0).length,
        quantity: p.lines.reduce((s, l) => s + l.pickedQuantity, 0),
      }));
    }
    if (type === CPO_PICK) {
      const orders = await prisma.customerOrder.findMany({
        where: { status: { in: ACTIVE_ORDER }, ...(branchId && { branchId }), ...notSent, lines: { some: { pickedQuantity: { gt: 0 } } } },
        orderBy: { orderDate: "asc" },
        take: 300,
        include: { customer: { select: { companyName: true, firstName: true, lastName: true } }, lines: { select: { pickedQuantity: true } } },
      });
      return orders.map((o) => ({
        sourceId: o.id,
        branchId: o.branchId,
        number: o.cpoNumber,
        reference: o.customerRefNo,
        date: o.orderDate,
        party: o.customer.companyName || `${o.customer.firstName} ${o.customer.lastName}`.trim(),
        lines: o.lines.filter((l) => l.pickedQuantity > 0).length,
        quantity: o.lines.reduce((s, l) => s + l.pickedQuantity, 0),
      }));
    }
    const mits = await prisma.materialInTransit.findMany({
      where: { status: MitStatus.IN_TRANSIT, ...(branchId && { destinationBranchId: branchId }), ...notSent },
      orderBy: { transitDate: "asc" },
      take: 300,
      select: { id: true, mitNumber: true, invoiceNumber: true, transitDate: true, vendor: true, destinationBranchId: true, totalCases: true, totalQuantity: true, _count: { select: { lines: true } } },
    });
    return mits.map((m) => ({
      sourceId: m.id,
      branchId: m.destinationBranchId,
      number: m.mitNumber,
      reference: m.invoiceNumber,
      date: m.transitDate,
      party: m.vendor,
      lines: m._count.lines,
      quantity: m.totalQuantity,
      cases: m.totalCases,
    }));
  }

  /** Branch whose stock a source picks or receives (for the branch-access check before sending). */
  async sourceBranchId(type: HandheldDocumentType, sourceId: string): Promise<string> {
    let branchId: string | undefined;
    if (type === INDENT_PICK) {
      branchId = (await prisma.pickingList.findUnique({ where: { id: sourceId }, select: { branchId: true } }))?.branchId;
    } else if (type === CPO_PICK) {
      branchId = (await prisma.customerOrder.findUnique({ where: { id: sourceId }, select: { branchId: true } }))?.branchId;
    } else {
      branchId = (await prisma.materialInTransit.findUnique({ where: { id: sourceId }, select: { destinationBranchId: true } }))?.destinationBranchId;
    }
    if (!branchId) throw new NotFoundError(type === INDENT_PICK ? "Picking list not found" : type === CPO_PICK ? "Customer purchase order not found" : "MIT not found");
    return branchId;
  }

  /** Snapshots the source for the device. One document per source on a device at a time. */
  async createDocument(input: CreateDocumentInput, actorId: string) {
    try {
      const id = await prisma.$transaction(async (tx) => {
        const branchId = await this.sourceBranchId(input.type, input.sourceId);
        const picker = await tx.employee.findUnique({ where: { id: input.pickerId } });
        if (!picker || picker.leftDate) throw new BadRequestError("Choose a current employee as the picker");
        const sent = await tx.handheldDocument.findFirst({
          where: { status: HandheldDocumentStatus.SENT, ...this.sourceWhere(input.type, input.sourceId) },
          select: { documentNumber: true },
        });
        if (sent) throw new ConflictError(`Already on a handheld as document ${sent.documentNumber}; upload or cancel it first`);

        const lines = await this.draftLines(tx, input.type, input.sourceId, branchId);
        if (!lines.length) throw new BadRequestError("Nothing on this document is left to pick or receive");
        const now = new Date();
        const doc = await tx.handheldDocument.create({
          data: {
            documentNumber: await nextDocumentNumber(tx, DOC_TYPES.HANDHELD, now),
            type: input.type,
            ...this.sourceWhere(input.type, input.sourceId),
            branchId,
            pickerId: picker.id,
            pickerName: picker.name,
            lineCount: lines.length,
            sentById: actorId,
            sentAt: now,
            lines: { create: lines.map((l, i) => ({ ...l, lineNumber: i + 1 })) },
          },
        });
        return doc.id;
      }, TX_OPTIONS);
      return this.getDocument(id);
    } catch (error) {
      // Two sends of one source at once: the partial unique index keeps only the first.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("This document was just sent to a handheld by someone else");
      }
      throw error;
    }
  }

  async getDocument(id: string) {
    const doc = await prisma.handheldDocument.findUnique({ where: { id }, include: documentInclude });
    if (!doc) throw new NotFoundError("Handheld document not found");
    return doc;
  }

  async listDocuments(f: { types: HandheldDocumentType[]; status?: HandheldDocumentStatus; branchId?: string; sourceId?: string; indentId?: string }) {
    return prisma.handheldDocument.findMany({
      where: {
        type: { in: f.types },
        ...(f.status && { status: f.status }),
        ...(f.branchId && { branchId: f.branchId }),
        ...(f.sourceId && { OR: [{ pickingListId: f.sourceId }, { customerOrderId: f.sourceId }, { mitId: f.sourceId }] }),
        // Every picking list of an indent (a back order gets a new one).
        ...(f.indentId && { pickingList: { indentId: f.indentId } }),
      },
      orderBy: { sentAt: "desc" },
      take: 200,
      // Lines only for one source (the web pages); HHDC Link lists without them and fetches one document.
      include: { ...documentInclude, lines: f.sourceId || f.indentId ? documentInclude.lines : false },
    });
  }

  /** Records the device result once and applies it (see the file header). */
  async upload(id: string, input: UploadInput, actorId: string) {
    const summary = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: HandheldDocumentStatus }[]>`
        SELECT "status" FROM "HandheldDocument" WHERE "id" = ${id} FOR UPDATE`;
      if (!locked[0]) throw new NotFoundError("Handheld document not found");
      if (locked[0].status === HandheldDocumentStatus.UPLOADED) {
        throw new ConflictError("This handheld document was already uploaded; it cannot be uploaded again");
      }
      if (locked[0].status === HandheldDocumentStatus.CANCELLED) {
        const doc = await tx.handheldDocument.findUniqueOrThrow({ where: { id }, select: { cancelRemark: true } });
        throw new ConflictError(`This handheld document was cancelled${doc.cancelRemark ? `: ${doc.cancelRemark}` : ""}`);
      }
      const doc = await tx.handheldDocument.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      await this.assertUnchanged(tx, doc);

      const plan = planUpload(doc.type, doc.lines, input.lines, input.extras, input.unreportedReason);
      const now = new Date();
      // Mark uploaded first: the source changes below must not treat this document as stale.
      await tx.handheldDocument.update({
        where: { id },
        data: { status: HandheldDocumentStatus.UPLOADED, uploadedAt: now, uploadedById: actorId },
      });
      for (const line of plan.lines) {
        await tx.handheldDocumentLine.update({
          where: { id: line.lineId },
          data: {
            quantity: line.quantity,
            damagedQuantity: line.damagedQuantity,
            shortReason: line.shortReason,
            scannedPartNumber: line.scannedPartNumber,
            note: line.note,
          },
        });
      }
      if (plan.extras.length) {
        const parts = await tx.sparePart.findMany({
          where: { partNumber: { in: plan.extras.map((e) => e.partNumber) } },
          select: { id: true, partNumber: true, name: true },
        });
        await tx.handheldDocumentLine.createMany({
          data: plan.extras.map((e, i) => {
            const part = parts.find((p) => p.partNumber === e.partNumber);
            return {
              documentId: id,
              lineNumber: doc.lines.length + i + 1,
              extra: true,
              partId: part?.id ?? null,
              partNumber: e.partNumber,
              partName: part?.name ?? null,
              expectedQuantity: 0,
              quantity: e.quantity,
              damagedQuantity: e.damagedQuantity ?? 0,
              note: e.note ?? null,
            };
          }),
        });
      }

      const byLine = new Map(doc.lines.map((l) => [l.id, l]));
      if (doc.type === INDENT_PICK) {
        await this.transfers.applyHandheldPickInTx(
          tx,
          doc.pickingListId!,
          plan.lines.map((l) => ({ pickingLineId: byLine.get(l.lineId)!.pickingListLineId!, quantity: l.quantity ?? 0 })),
          doc.pickerName,
          actorId,
        );
      } else if (doc.type === CPO_PICK) {
        await this.partSale.applyHandheldPickInTx(
          tx,
          doc.customerOrderId!,
          plan.lines.map((l) => ({ lineId: byLine.get(l.lineId)!.customerOrderLineId!, quantity: l.quantity ?? 0 })),
        );
      } else {
        await tx.materialInTransit.updateMany({ where: { id: doc.mitId!, status: MitStatus.IN_TRANSIT }, data: { status: MitStatus.VERIFIED } });
      }
      return plan.totals;
    }, TX_OPTIONS);
    return { document: await this.getDocument(id), totals: summary };
  }

  async cancel(id: string, remark: string, actorId: string) {
    const result = await prisma.handheldDocument.updateMany({
      where: { id, status: HandheldDocumentStatus.SENT },
      data: { status: HandheldDocumentStatus.CANCELLED, cancelledAt: new Date(), cancelledById: actorId, cancelRemark: remark },
    });
    if (result.count !== 1) {
      await this.getDocument(id);
      throw new ConflictError("Only a document still on the handheld can be cancelled");
    }
    return this.getDocument(id);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private sourceWhere(type: HandheldDocumentType, sourceId: string) {
    return type === INDENT_PICK ? { pickingListId: sourceId } : type === CPO_PICK ? { customerOrderId: sourceId } : { mitId: sourceId };
  }

  private async binsOf(tx: Tx, branchId: string, partIds: string[]) {
    const stock = await tx.inventoryStock.findMany({ where: { branchId, partId: { in: partIds } }, select: { partId: true, rackLocation: true } });
    return new Map(stock.map((s) => [s.partId, s.rackLocation]));
  }

  private async draftLines(tx: Tx, type: HandheldDocumentType, sourceId: string, branchId: string): Promise<DraftLine[]> {
    const part = { select: { id: true, partNumber: true, name: true } };
    if (type === INDENT_PICK) {
      const list = await tx.pickingList.findUniqueOrThrow({ where: { id: sourceId }, include: { lines: { include: { part } } } });
      if (list.status !== PickingListStatus.OPEN) throw new ConflictError(`Picking list ${list.pickingNumber} is ${list.status.toLowerCase()}`);
      const lines = list.lines.filter((l) => l.pickedQuantity > 0);
      const bins = await this.binsOf(tx, branchId, lines.map((l) => l.partId));
      return lines
        .map((l) => ({
          pickingListLineId: l.id,
          partId: l.partId,
          partNumber: l.part.partNumber,
          partName: l.part.name,
          binLocation: l.binLocation ?? bins.get(l.partId) ?? null,
          expectedQuantity: l.pickedQuantity,
        }))
        .sort(byBinThenPart);
    }
    if (type === CPO_PICK) {
      const order = await tx.customerOrder.findUniqueOrThrow({ where: { id: sourceId }, include: { lines: { include: { part } } } });
      if (!ACTIVE_ORDER.includes(order.status)) throw new ConflictError(`CPO ${order.cpoNumber} is ${order.status.toLowerCase().replace("_", " ")}`);
      const lines = order.lines.filter((l) => l.pickedQuantity > 0);
      const bins = await this.binsOf(tx, branchId, lines.map((l) => l.partId));
      return lines
        .map((l) => ({
          customerOrderLineId: l.id,
          partId: l.partId,
          partNumber: l.part.partNumber,
          partName: l.part.name,
          binLocation: bins.get(l.partId) ?? null,
          expectedQuantity: l.pickedQuantity,
        }))
        .sort(byBinThenPart);
    }
    const mit = await tx.materialInTransit.findUniqueOrThrow({ where: { id: sourceId }, include: { lines: { include: { part } } } });
    if (mit.status !== MitStatus.IN_TRANSIT) throw new ConflictError(`MIT ${mit.mitNumber} is ${mit.status.toLowerCase().replace("_", " ")}`);
    const bins = await this.binsOf(tx, branchId, mit.lines.map((l) => l.partId));
    return mit.lines
      .map((l) => ({
        mitLineId: l.id,
        partId: l.partId,
        partNumber: l.part.partNumber,
        partName: l.part.name,
        binLocation: bins.get(l.partId) ?? null,
        caseNumber: l.caseNumbers,
        expectedQuantity: l.quantity,
      }))
      .sort(byCaseThenPart);
  }

  /** Refuses an upload when the source changed after it was sent (the web cancels it in most cases). */
  private async assertUnchanged(
    tx: Tx,
    doc: { type: HandheldDocumentType; lines: { pickingListLineId: string | null; customerOrderLineId: string | null; mitLineId: string | null; expectedQuantity: number; partNumber: string; extra: boolean }[] },
  ) {
    const sent = doc.lines.filter((l) => !l.extra);
    const current =
      doc.type === INDENT_PICK
        ? await tx.pickingListLine.findMany({ where: { id: { in: sent.map((l) => l.pickingListLineId!).filter(Boolean) } }, select: { id: true, pickedQuantity: true } })
        : doc.type === CPO_PICK
          ? await tx.customerOrderLine.findMany({ where: { id: { in: sent.map((l) => l.customerOrderLineId!).filter(Boolean) } }, select: { id: true, pickedQuantity: true } })
          : null;
    if (!current) {
      if (sent.some((l) => !l.mitLineId)) throw new ConflictError("The MIT changed after it was sent; cancel this document and send it again");
      return;
    }
    const qty = new Map(current.map((c) => [c.id, c.pickedQuantity]));
    for (const line of sent) {
      const sourceId = line.pickingListLineId ?? line.customerOrderLineId;
      if (!sourceId || qty.get(sourceId) !== line.expectedQuantity) {
        throw new ConflictError(`${line.partNumber} changed on the web after it was sent; cancel this document and send it again`);
      }
    }
  }
}
