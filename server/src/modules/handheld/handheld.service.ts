/**
 * Handheld (HHDC) jobs: picking lists, CPOs and MITs (legacy AEBRINDENT, AECPO and AEMIT on the device,
 * HHDCDownloadHead/Detail and the MIT pctohhdc/hhdctopc flags on the PC) and stock-take count sheets.
 *
 *   send on the web ──► QUEUED ──► a station writes it to a docked handheld ──► SENT
 *     ──► picker finishes, station collects the result ──► RECEIVED ──► Post on the web ──► UPLOADED
 *
 * Effects of posting: an indent pick drops each reservation to what was picked and returns the short
 * to back order; a CPO pick returns the short to free stock; an MIT is marked VERIFIED and its counts
 * prefill the MRN, which the store still posts on the web; a count sheet is uploaded as from the count
 * screen (StockTakeService.uploadSheet). Substitutes and parts not on an MIT are recorded for the store
 * only. The station side (delivery and collection) is in handheld.station.service.ts.
 */
import {
  CustomerOrderStatus,
  HandheldDocumentStatus,
  HandheldDocumentType,
  HandheldShortReason,
  MitStatus,
  PickingListStatus,
  Prisma,
  StockTakeStatus,
  StockTakeType,
} from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { nextDocumentNumber, StockTransferService } from "../stock-transfer/stockTransfer.service";
import { DOC_TYPES } from "../stock-transfer/stockTransfer.logic";
import { PartSaleService } from "../part-sale/partSale.service";
import { StockTakeService } from "../stock-take/stockTake.service";
import { ACTIVE_HANDHELD_STATUSES } from "./handheld.hooks";
import { isStationOnline, planUpload, UploadExtraInput, UploadLineInput } from "./handheld.logic";
import { HandheldNotifier, jobRefSelect } from "./handheld.notifications";

type Tx = Prisma.TransactionClient;

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };
const ACTIVE_ORDER: CustomerOrderStatus[] = [CustomerOrderStatus.OPEN, CustomerOrderStatus.PARTLY_BILLED];
const { INDENT_PICK, CPO_PICK, MIT_RECEIVE, COUNT_SHEET } = HandheldDocumentType;
const { QUEUED, SENT, RECEIVED, UPLOADED, CANCELLED } = HandheldDocumentStatus;
const notActive = { handheldDocuments: { none: { status: { in: ACTIVE_HANDHELD_STATUSES } } } };
// A picking list's lines are fixed when the indent is approved: once a handheld pick is posted, it is done.
const notPosted = { handheldDocuments: { none: { status: HandheldDocumentStatus.UPLOADED } } };
/** Picked CPO units that no posted handheld pick has confirmed yet. */
const uncheckedOf = (l: { pickedQuantity: number; handheldCheckedQuantity: number }) => Math.max(0, l.pickedQuantity - l.handheldCheckedQuantity);

export interface CreateDocumentInput {
  type: HandheldDocumentType;
  sourceId: string;
  // Picker (employee) for documents; the checker (user) of a count sheet.
  pickerId?: string;
  checkerId?: string;
  // IT tool: HHDC Link writes the job to the device itself, so it skips the queue (SENT at once).
  manual?: boolean;
}

export interface UploadInput {
  lines: UploadLineInput[];
  extras?: UploadExtraInput[];
  unreportedReason?: HandheldShortReason;
}

export interface PostInput {
  // Picking: reason for lines the picker never saved. Count sheet: parts left blank are none on hand
  // (ZERO) or go back to the pool (RELEASE).
  unreportedReason?: HandheldShortReason;
  uncounted?: "ZERO" | "RELEASE";
}

/** A count sheet's device result: one entry per part per bin (as the sheet upload takes it). */
export interface SheetResult {
  entries: {
    partId?: string;
    partNumber?: string;
    binLocation?: string;
    quantity: number;
    damagedQuantity?: number;
    remarks?: string;
    countedAt?: Date | string;
  }[];
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
  deliveredDevice: { select: { id: true, name: true } },
  deliveredStation: { select: { id: true, name: true } },
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
  stockTakeSheet: {
    select: {
      id: true,
      sheetNumber: true,
      lineCount: true,
      uploadedAt: true,
      cancelledAt: true,
      checker: { select: { id: true, firstName: true, lastName: true } },
      stockTake: { select: { id: true, batchNumber: true, type: true, status: true } },
    },
  },
} satisfies Prisma.HandheldDocumentInclude;

type DocumentRow = Prisma.HandheldDocumentGetPayload<{ include: typeof documentInclude }>;

const byBinThenPart = (a: DraftLine, b: DraftLine) =>
  (a.binLocation ?? "￿").localeCompare(b.binLocation ?? "￿") || a.partNumber.localeCompare(b.partNumber);
const byCaseThenPart = (a: DraftLine, b: DraftLine) =>
  (a.caseNumber ?? "").localeCompare(b.caseNumber ?? "") || a.partNumber.localeCompare(b.partNumber);

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : "");

export class HandheldService {
  private transfers = new StockTransferService();
  private partSale = new PartSaleService();
  private stockTake = new StockTakeService();
  private notifier = new HandheldNotifier();

  /** Documents that can be sent to a handheld now: open picking lists, picked CPOs, MITs in transit, open count sheets. */
  async listSources(type: HandheldDocumentType, branchId?: string) {
    if (type === INDENT_PICK) {
      const lists = await prisma.pickingList.findMany({
        where: {
          status: PickingListStatus.OPEN,
          ...(branchId && { branchId }),
          AND: [notActive, notPosted],
          lines: { some: { pickedQuantity: { gt: 0 } } },
        },
        orderBy: { createdAt: "asc" },
        take: 300,
        include: {
          indent: { select: { id: true, indentNumber: true, orderDate: true, requestingBranch: { select: { name: true } } } },
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
        link: `/transfers/indents/${p.indent.id}`,
      }));
    }
    if (type === CPO_PICK) {
      const orders = await prisma.customerOrder.findMany({
        where: { status: { in: ACTIVE_ORDER }, ...(branchId && { branchId }), ...notActive, lines: { some: { pickedQuantity: { gt: 0 } } } },
        orderBy: { orderDate: "asc" },
        take: 300,
        include: {
          customer: { select: { companyName: true, firstName: true, lastName: true } },
          lines: { select: { pickedQuantity: true, handheldCheckedQuantity: true } },
        },
      });
      return orders
        .map((o) => ({ ...o, unchecked: o.lines.map(uncheckedOf).filter((q) => q > 0) }))
        .filter((o) => o.unchecked.length > 0)
        .map((o) => ({
        sourceId: o.id,
        branchId: o.branchId,
        number: o.cpoNumber,
        reference: o.customerRefNo,
        date: o.orderDate,
        party: o.customer.companyName || `${o.customer.firstName} ${o.customer.lastName}`.trim(),
        lines: o.unchecked.length,
        quantity: o.unchecked.reduce((s, q) => s + q, 0),
        link: `/part-sale/orders/${o.id}`,
      }));
    }
    if (type === COUNT_SHEET) {
      const sheets = await prisma.stockTakeSheet.findMany({
        where: { uploadedAt: null, cancelledAt: null, stockTake: { status: StockTakeStatus.ACTIVE, ...(branchId && { branchId }) }, ...notActive },
        orderBy: { issuedAt: "asc" },
        take: 300,
        include: { stockTake: { select: { id: true, batchNumber: true, branchId: true, type: true } }, checker: { select: { firstName: true, lastName: true } } },
      });
      return sheets.map((s) => ({
        sourceId: s.id,
        branchId: s.stockTake.branchId,
        number: s.sheetNumber,
        reference: s.stockTake.batchNumber,
        date: s.issuedAt,
        party: fullName(s.checker),
        lines: s.lineCount,
        quantity: 0,
        audit: s.stockTake.type === StockTakeType.AUDIT,
        link: `/inventory/${s.stockTake.type === StockTakeType.AUDIT ? "stock-audit" : "stock-taking"}/${s.stockTake.id}/sheets/${s.id}`,
      }));
    }
    const mits = await prisma.materialInTransit.findMany({
      where: { status: MitStatus.IN_TRANSIT, ...(branchId && { destinationBranchId: branchId }), ...notActive },
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
      link: `/inventory/mobis-receipts/${m.id}`,
    }));
  }

  /** Current employees who can be chosen as the picker or checker (legacy picker list sent with a download). */
  async listPickers(branchId?: string) {
    return prisma.employee.findMany({
      where: { leftDate: null, ...(branchId && { branchId }) },
      orderBy: [{ name: "asc" }],
      take: 500,
      select: { id: true, code: true, name: true, branchId: true },
    });
  }

  /** Branch whose stock a source picks, receives or counts, and whether it is a stock audit (permissions). */
  async sourceInfo(type: HandheldDocumentType, sourceId: string): Promise<{ branchId: string; audit: boolean }> {
    let branchId: string | undefined;
    let audit = false;
    if (type === INDENT_PICK) {
      branchId = (await prisma.pickingList.findUnique({ where: { id: sourceId }, select: { branchId: true } }))?.branchId;
    } else if (type === CPO_PICK) {
      branchId = (await prisma.customerOrder.findUnique({ where: { id: sourceId }, select: { branchId: true } }))?.branchId;
    } else if (type === COUNT_SHEET) {
      const sheet = await prisma.stockTakeSheet.findUnique({ where: { id: sourceId }, select: { stockTake: { select: { branchId: true, type: true } } } });
      branchId = sheet?.stockTake.branchId;
      audit = sheet?.stockTake.type === StockTakeType.AUDIT;
    } else {
      branchId = (await prisma.materialInTransit.findUnique({ where: { id: sourceId }, select: { destinationBranchId: true } }))?.destinationBranchId;
    }
    if (!branchId) {
      throw new NotFoundError(
        type === INDENT_PICK ? "Picking list not found" : type === CPO_PICK ? "Customer purchase order not found" : type === COUNT_SHEET ? "Count sheet not found" : "MIT not found",
      );
    }
    return { branchId, audit };
  }

  /**
   * Queues a job for the next handheld docked at a station of the branch (user decision 2026-10-28).
   * Documents are snapshotted now; a count sheet's lines are the sheet's own. One active job per source.
   */
  async createDocument(input: CreateDocumentInput, actorId: string) {
    let id: string;
    try {
      id = await prisma.$transaction(async (tx) => {
        const { branchId } = await this.sourceInfo(input.type, input.sourceId);
        const active = await tx.handheldDocument.findFirst({
          where: { status: { in: ACTIVE_HANDHELD_STATUSES }, ...this.sourceWhere(input.type, input.sourceId) },
          select: { documentNumber: true, status: true },
        });
        if (active) {
          throw new ConflictError(
            active.status === RECEIVED
              ? `The handheld result of job ${active.documentNumber} is waiting to be posted; post or cancel it first`
              : `Already sent to a handheld as job ${active.documentNumber}; wait for it or cancel it first`,
          );
        }

        let worker: { pickerId: string | null; pickerName: string };
        let lines: DraftLine[] = [];
        let lineCount: number;
        if (input.type === COUNT_SHEET) {
          const sheet = await this.openSheet(tx, input.sourceId);
          let checker = sheet.checker;
          if (input.checkerId && input.checkerId !== sheet.checkerId) {
            const user = await tx.user.findUnique({ where: { id: input.checkerId }, select: { id: true, isActive: true, firstName: true, lastName: true } });
            if (!user?.isActive) throw new BadRequestError("Select an active checker");
            await tx.stockTakeSheet.update({ where: { id: sheet.id }, data: { checkerId: user.id } });
            checker = user;
          }
          worker = { pickerId: null, pickerName: fullName(checker) };
          lineCount = sheet.lineCount;
        } else {
          if (!input.pickerId) throw new BadRequestError("Choose the picker");
          const picker = await tx.employee.findUnique({ where: { id: input.pickerId } });
          if (!picker || picker.leftDate) throw new BadRequestError("Choose a current employee as the picker");
          worker = { pickerId: picker.id, pickerName: picker.name };
          lines = await this.draftLines(tx, input.type, input.sourceId, branchId);
          if (!lines.length) throw new BadRequestError("Nothing on this document is left to pick or receive");
          lineCount = lines.length;
        }

        const now = new Date();
        const doc = await tx.handheldDocument.create({
          data: {
            documentNumber: await nextDocumentNumber(tx, DOC_TYPES.HANDHELD, now),
            type: input.type,
            ...this.sourceWhere(input.type, input.sourceId),
            branchId,
            ...worker,
            lineCount,
            sentById: actorId,
            queuedAt: now,
            ...(input.manual ? { status: SENT, sentAt: now } : { status: QUEUED }),
            ...(lines.length && { lines: { create: lines.map((l, i) => ({ ...l, lineNumber: i + 1 })) } }),
          },
        });
        return doc.id;
      }, TX_OPTIONS);
    } catch (error) {
      // Two sends of one source at once: the partial unique index keeps only the first.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("This document was just sent to a handheld by someone else");
      }
      throw error;
    }
    const doc = await this.getDocument(id);
    if (doc.status === QUEUED && !(await this.anyStationOnline(doc.branchId))) {
      const job = await prisma.handheldDocument.findUniqueOrThrow({ where: { id }, select: jobRefSelect });
      await this.notifier.waitingNoStation(job);
    }
    return doc;
  }

  async getDocument(id: string) {
    const doc = await prisma.handheldDocument.findUnique({ where: { id }, include: documentInclude });
    if (!doc) throw new NotFoundError("Handheld document not found");
    return this.withReview(doc);
  }

  async listDocuments(f: {
    types: HandheldDocumentType[];
    status?: HandheldDocumentStatus;
    statuses?: HandheldDocumentStatus[];
    branchId?: string;
    sourceId?: string;
    indentId?: string;
    stockTakeId?: string;
  }) {
    const docs = await prisma.handheldDocument.findMany({
      where: {
        type: { in: f.types },
        ...(f.status ? { status: f.status } : f.statuses && { status: { in: f.statuses } }),
        ...(f.branchId && { branchId: f.branchId }),
        ...(f.sourceId && { OR: [{ pickingListId: f.sourceId }, { customerOrderId: f.sourceId }, { mitId: f.sourceId }, { stockTakeSheetId: f.sourceId }] }),
        // Every picking list of an indent (a back order gets a new one).
        ...(f.indentId && { pickingList: { indentId: f.indentId } }),
        ...(f.stockTakeId && { stockTakeSheet: { stockTakeId: f.stockTakeId } }),
      },
      orderBy: { queuedAt: "desc" },
      take: 200,
      // Lines only for one source (the web pages); lists leave them out.
      include: { ...documentInclude, lines: f.sourceId || f.indentId ? documentInclude.lines : false },
    });
    return f.sourceId || f.indentId ? Promise.all(docs.map((d) => this.withReview(d))) : docs;
  }

  /**
   * Posts a result the station collected (RECEIVED), through the same code as a direct upload. The user
   * chooses here what the device could not: the reason for unreported picking lines, or ZERO / RELEASE
   * for a sheet's uncounted parts.
   */
  async post(id: string, input: PostInput, actorId: string) {
    const job = await prisma.handheldDocument.findUnique({ where: { id }, select: { type: true, stockTakeSheet: { select: { id: true, stockTakeId: true } } } });
    if (!job) throw new NotFoundError("Handheld document not found");
    let totals: unknown = null;
    if (job.type === COUNT_SHEET) {
      if (!input.uncounted) throw new BadRequestError("Choose what happens to the parts that were not counted");
      const sheet = job.stockTakeSheet!;
      await prisma.$transaction(async (tx) => {
        // Stock taking first, then the job: the same order as cancelling a sheet on the web.
        await tx.$queryRaw`SELECT id FROM "StockTake" WHERE id = ${sheet.stockTakeId} FOR UPDATE`;
        const locked = await this.lockJob(tx, id, [RECEIVED]);
        await tx.handheldDocument.update({ where: { id }, data: { status: UPLOADED, uploadedAt: new Date(), uploadedById: actorId } });
        // Stored as JSON: times come back as text.
        const entries = (locked.result as unknown as SheetResult).entries.map((e) => ({ ...e, countedAt: e.countedAt ? new Date(e.countedAt) : undefined }));
        await this.stockTake.uploadSheetInTx(tx, sheet.stockTakeId, sheet.id, { entries, uncounted: input.uncounted! }, actorId);
      }, TX_OPTIONS);
    } else {
      totals = await prisma.$transaction(async (tx) => {
        const locked = await this.lockJob(tx, id, [RECEIVED]);
        const result = locked.result as unknown as UploadInput;
        return this.applyInTx(tx, id, { lines: result.lines ?? [], extras: result.extras ?? [], unreportedReason: input.unreportedReason }, actorId);
      }, TX_OPTIONS);
    }
    const ref = await prisma.handheldDocument.findUniqueOrThrow({ where: { id }, select: jobRefSelect });
    await this.notifier.posted(ref, actorId);
    return { document: await this.getDocument(id), totals };
  }

  /**
   * IT tool (HHDC Link signed in as a user): records the device result and applies it in one step, from
   * a job on a handheld or one already received. Count sheets use the stock-take upload.
   */
  async upload(id: string, input: UploadInput, actorId: string) {
    const summary = await prisma.$transaction(async (tx) => {
      await this.lockJob(tx, id, [SENT, RECEIVED]);
      return this.applyInTx(tx, id, input, actorId);
    }, TX_OPTIONS);
    return { document: await this.getDocument(id), totals: summary };
  }

  /** Cancel while waiting, on a handheld, or finished and not posted (the result is kept, never applied). */
  async cancel(id: string, remark: string, actorId: string) {
    const result = await prisma.handheldDocument.updateMany({
      where: { id, status: { in: ACTIVE_HANDHELD_STATUSES } },
      data: { status: CANCELLED, cancelledAt: new Date(), cancelledById: actorId, cancelRemark: remark, claimStationId: null, claimDeviceId: null, claimExpiresAt: null },
    });
    if (result.count !== 1) {
      await this.getDocument(id);
      throw new ConflictError("Only a job that is not yet posted can be cancelled");
    }
    return this.getDocument(id);
  }

  /** Stations of a branch for the Send dialog and the job status: online, and the handheld docked there. */
  async stationState(branchId: string) {
    const now = new Date();
    const stations = await prisma.handheldStation.findMany({
      where: { branchId, revokedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, lastSeenAt: true, dockedDevice: { select: { id: true, name: true } } },
    });
    const list = stations.map((s) => ({
      id: s.id,
      name: s.name,
      lastSeenAt: s.lastSeenAt,
      online: isStationOnline(s.lastSeenAt, now),
      dockedDevice: isStationOnline(s.lastSeenAt, now) ? s.dockedDevice : null,
    }));
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } });
    return { branch, stations: list, online: list.some((s) => s.online), docked: list.filter((s) => s.dockedDevice) };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async anyStationOnline(branchId: string) {
    const recent = await prisma.handheldStation.findMany({ where: { branchId, revokedAt: null, lastSeenAt: { not: null } }, select: { lastSeenAt: true } });
    return recent.some((s) => isStationOnline(s.lastSeenAt));
  }

  /** Locks the job row and checks its state (once only: a posted or cancelled job is refused). */
  private async lockJob(tx: Tx, id: string, allowed: HandheldDocumentStatus[]) {
    const locked = await tx.$queryRaw<{ status: HandheldDocumentStatus }[]>`
      SELECT "status" FROM "HandheldDocument" WHERE "id" = ${id} FOR UPDATE`;
    if (!locked[0]) throw new NotFoundError("Handheld document not found");
    const status = locked[0].status;
    if (status === UPLOADED) throw new ConflictError("This handheld result was already posted; it cannot be posted again");
    if (status === CANCELLED) {
      const doc = await tx.handheldDocument.findUniqueOrThrow({ where: { id }, select: { cancelRemark: true } });
      throw new ConflictError(`This handheld job was cancelled${doc.cancelRemark ? `: ${doc.cancelRemark}` : ""}`);
    }
    if (!allowed.includes(status)) {
      throw new ConflictError(status === QUEUED ? "This job has not reached a handheld yet" : status === SENT ? "The handheld has not returned this job yet" : `This job is ${status.toLowerCase()}`);
    }
    return tx.handheldDocument.findUniqueOrThrow({ where: { id } });
  }

  /** Records the device result on the lines and applies it (see the file header). The job row is locked. */
  private async applyInTx(tx: Tx, id: string, input: UploadInput, actorId: string) {
    const doc = await tx.handheldDocument.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (doc.type === COUNT_SHEET) throw new BadRequestError("Count sheets are uploaded on their stock taking");
    await this.assertUnchanged(tx, doc);

    const plan = planUpload(doc.type, doc.lines, input.lines, input.extras, input.unreportedReason);
    const now = new Date();
    // Mark uploaded first: the source changes below must not treat this document as stale.
    await tx.handheldDocument.update({
      where: { id },
      data: { status: UPLOADED, uploadedAt: now, uploadedById: actorId },
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
  }

  /**
   * What a received result will do, for the page to show before Post: each line's result, the lines
   * the picker never reached, and, if the result cannot be posted as it is, why. Count sheets: the
   * counts and the parts on the sheet with no count.
   */
  private async withReview(doc: DocumentRow) {
    if (doc.status !== RECEIVED || !doc.result) return { ...doc, review: null };
    if (doc.type === COUNT_SHEET) {
      const entries = (doc.result as unknown as SheetResult).entries ?? [];
      const sheetLines = await prisma.stockTakeLine.findMany({
        where: { sheetId: doc.stockTakeSheetId!, countedQuantity: null },
        orderBy: [{ binLocation: "asc" }, { partNumber: "asc" }],
        select: { id: true, partId: true, partNumber: true, binLocation: true },
      });
      const counted = new Set(entries.map((e) => (e.partId ?? e.partNumber ?? "").toUpperCase()));
      const notCounted = sheetLines.filter((l) => !counted.has((l.partId ?? "").toUpperCase()) && !counted.has(l.partNumber.toUpperCase()));
      const sheetNumbers = new Set(
        (await prisma.stockTakeLine.findMany({ where: { sheetId: doc.stockTakeSheetId! }, select: { partNumber: true } })).map((l) => l.partNumber.toUpperCase()),
      );
      return {
        ...doc,
        review: {
          entries: entries.map((e) => ({ ...e, onSheet: sheetNumbers.has((e.partNumber ?? "").toUpperCase()) })),
          notCounted: notCounted.map((l) => ({ partNumber: l.partNumber, binLocation: l.binLocation })),
          totals: { entries: entries.length, quantity: entries.reduce((s, e) => s + e.quantity, 0), damaged: entries.reduce((s, e) => s + (e.damagedQuantity ?? 0), 0), notCounted: notCounted.length },
          problem: null as string | null,
        },
      };
    }
    const result = doc.result as unknown as UploadInput;
    let problem: string | null = null;
    let totals = null;
    try {
      totals = planUpload(doc.type, doc.lines, result.lines ?? [], result.extras ?? []).totals;
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
    const given = new Map((result.lines ?? []).map((l) => [l.lineId, l]));
    return {
      ...doc,
      review: {
        lines: doc.lines.map((l) => {
          const r = given.get(l.id);
          return {
            lineId: l.id,
            lineNumber: l.lineNumber,
            partNumber: l.partNumber,
            partName: l.partName,
            binLocation: l.binLocation,
            caseNumber: l.caseNumber,
            expectedQuantity: l.expectedQuantity,
            reported: !!r,
            quantity: r ? r.quantity : null,
            damagedQuantity: r?.damagedQuantity ?? 0,
            shortReason: r?.shortReason ?? null,
            scannedPartNumber: r?.scannedPartNumber ?? null,
            note: r?.note ?? null,
          };
        }),
        extras: result.extras ?? [],
        totals,
        problem,
      },
    };
  }

  private sourceWhere(type: HandheldDocumentType, sourceId: string) {
    return type === INDENT_PICK
      ? { pickingListId: sourceId }
      : type === CPO_PICK
        ? { customerOrderId: sourceId }
        : type === COUNT_SHEET
          ? { stockTakeSheetId: sourceId }
          : { mitId: sourceId };
  }

  private async openSheet(tx: Tx, sheetId: string) {
    const sheet = await tx.stockTakeSheet.findUniqueOrThrow({
      where: { id: sheetId },
      include: { checker: { select: { id: true, firstName: true, lastName: true } }, stockTake: { select: { status: true, batchNumber: true } } },
    });
    if (sheet.uploadedAt || sheet.cancelledAt) throw new ConflictError(`Sheet ${sheet.sheetNumber} is already ${sheet.uploadedAt ? "uploaded" : "cancelled"}`);
    if (sheet.stockTake.status !== StockTakeStatus.ACTIVE) {
      throw new ConflictError(`Stock taking ${sheet.stockTake.batchNumber} is ${sheet.stockTake.status.toLowerCase()}`);
    }
    return sheet;
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
      if (await tx.handheldDocument.count({ where: { pickingListId: sourceId, status: UPLOADED } })) {
        throw new ConflictError(`Picking list ${list.pickingNumber} was already picked on a handheld and posted`);
      }
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
      // Only picked units no posted handheld pick has confirmed yet (e.g. parts picked after the last one).
      const lines = order.lines.filter((l) => uncheckedOf(l) > 0);
      if (!lines.length && order.lines.some((l) => l.pickedQuantity > 0)) {
        throw new ConflictError(`Every picked unit on CPO ${order.cpoNumber} was already checked on a handheld`);
      }
      const bins = await this.binsOf(tx, branchId, lines.map((l) => l.partId));
      return lines
        .map((l) => ({
          customerOrderLineId: l.id,
          partId: l.partId,
          partNumber: l.part.partNumber,
          partName: l.part.name,
          binLocation: bins.get(l.partId) ?? null,
          expectedQuantity: uncheckedOf(l),
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

  /** Refuses a result when the source changed after it was sent (the web cancels it in most cases). */
  private async assertUnchanged(
    tx: Tx,
    doc: { type: HandheldDocumentType; lines: { pickingListLineId: string | null; customerOrderLineId: string | null; mitLineId: string | null; expectedQuantity: number; partNumber: string; extra: boolean }[] },
  ) {
    const sent = doc.lines.filter((l) => !l.extra);
    const current =
      doc.type === INDENT_PICK
        ? await tx.pickingListLine.findMany({ where: { id: { in: sent.map((l) => l.pickingListLineId!).filter(Boolean) } }, select: { id: true, pickedQuantity: true } })
        : doc.type === CPO_PICK
          ? (
              await tx.customerOrderLine.findMany({
                where: { id: { in: sent.map((l) => l.customerOrderLineId!).filter(Boolean) } },
                select: { id: true, pickedQuantity: true, handheldCheckedQuantity: true },
              })
            ).map((l) => ({ id: l.id, pickedQuantity: uncheckedOf(l) }))
          : null;
    if (!current) {
      if (doc.type === MIT_RECEIVE && sent.some((l) => !l.mitLineId)) throw new ConflictError("The MIT changed after it was sent; cancel this job and send it again");
      return;
    }
    const qty = new Map(current.map((c) => [c.id, c.pickedQuantity]));
    for (const line of sent) {
      const sourceId = line.pickingListLineId ?? line.customerOrderLineId;
      if (!sourceId || qty.get(sourceId) !== line.expectedQuantity) {
        throw new ConflictError(`${line.partNumber} changed on the web after it was sent; cancel this job and send it again`);
      }
    }
  }
}
