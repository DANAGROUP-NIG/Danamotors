/**
 * Barcode labels (legacy BarCode.dll "Barcode Printing", part labels). The store picks parts on the web
 * and a station PC of the branch prints them on its USB label printer: HHDC Link in station mode looks
 * for a Zebra, reports it in the heartbeat, and takes waiting jobs every few seconds while it is ready.
 *
 *   web: Print ─► QUEUED ─► station claims (2-minute lease) ─► prints ─► done: PRINTED or FAILED
 *
 * The ZPL is rendered here when the job is made (labels.zpl.ts), so a template change needs no new HHDC
 * Link. A FAILED job is queued again from the web; a QUEUED one can be cancelled until a station takes it.
 */
import { LabelPrintStatus, PartStatus, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { isStationOnline } from "../handheld/handheld.logic";
import type { AuthedStation } from "../handheld/handheld.station.service";
import { jobZpl, LABEL_DEALER, labelDate, PartLabel, unprintable } from "./labels.zpl";

const { QUEUED, PRINTED, FAILED, CANCELLED } = LabelPrintStatus;

export const PRINT_LEASE_MINUTES = 2;

export interface PrinterReport {
  model: string;
  status: "READY" | "PAUSED" | "PAPER_OUT" | "HEAD_OPEN" | "ERROR";
  detail?: string;
}

export interface StoredLabel extends PartLabel {
  partId: string;
}

const jobSelect = {
  id: true,
  branchId: true,
  labels: true,
  labelCount: true,
  status: true,
  createdAt: true,
  printedAt: true,
  error: true,
  requestedBy: { select: { firstName: true, lastName: true } },
  printedStation: { select: { name: true } },
} satisfies Prisma.LabelPrintJobSelect;

export class LabelService {
  /** Active parts by number or description, with the bin and stock at the branch. */
  async searchParts(search: string, branchId: string) {
    const term = search.trim();
    const parts = await prisma.sparePart.findMany({
      where: {
        partStatus: PartStatus.ACTIVE,
        OR: [{ partNumber: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }],
      },
      orderBy: { partNumber: "asc" },
      take: 20,
      select: { id: true, partNumber: true, name: true, priceCategoryCode: true, inventoryStocks: { where: { branchId }, select: { quantity: true, rackLocation: true } } },
    });
    return parts.map(({ inventoryStocks, ...p }) => ({ ...p, bin: inventoryStocks[0]?.rackLocation ?? null, stock: inventoryStocks[0]?.quantity ?? 0 }));
  }

  /** The branch's stations and their label printers, for the page's printer line. */
  async printers(branchId: string) {
    const now = new Date();
    const stations = await prisma.handheldStation.findMany({
      where: { branchId, revokedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, lastSeenAt: true, printerModel: true, printerStatus: true, printerDetail: true },
    });
    return stations.map(({ lastSeenAt, ...s }) => ({ ...s, online: isStationOnline(lastSeenAt, now) }));
  }

  async create(input: { branchId: string; labels: { partId: string; copies: number }[] }, actorId: string, now = new Date()) {
    const branch = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true, name: true, code: true, shortName: true } });
    if (!branch) throw new NotFoundError("Branch not found");
    const ids = [...new Set(input.labels.map((l) => l.partId))];
    const parts = await prisma.sparePart.findMany({
      where: { id: { in: ids } },
      select: { id: true, partNumber: true, name: true, inventoryStocks: { where: { branchId: branch.id }, select: { rackLocation: true } } },
    });
    const byId = new Map(parts.map((p) => [p.id, p]));
    const labels: StoredLabel[] = input.labels.map((l) => {
      const part = byId.get(l.partId);
      if (!part) throw new NotFoundError("A part on the list was not found; refresh and try again");
      if (unprintable(part.partNumber)) throw new BadRequestError(`${part.partNumber} has characters a barcode cannot carry; correct the part number first`);
      return { partId: part.id, partNumber: part.partNumber, description: part.name, bin: part.inventoryStocks[0]?.rackLocation?.trim() || null, copies: l.copies };
    });
    const header = { dealer: LABEL_DEALER, store: branch.shortName || branch.code || branch.name, date: labelDate(now) };
    const job = await prisma.labelPrintJob.create({
      data: {
        branchId: branch.id,
        labels: labels as unknown as Prisma.InputJsonValue,
        labelCount: labels.reduce((n, l) => n + l.copies, 0),
        zpl: jobZpl(labels, header),
        requestedById: actorId,
      },
      select: jobSelect,
    });
    return { job, printers: await this.printers(branch.id) };
  }

  async list(branchId: string) {
    return prisma.labelPrintJob.findMany({ where: { branchId }, orderBy: { createdAt: "desc" }, take: 30, select: jobSelect });
  }

  async branchOf(id: string) {
    const job = await prisma.labelPrintJob.findUnique({ where: { id }, select: { branchId: true } });
    if (!job) throw new NotFoundError("Label print job not found");
    return job.branchId;
  }

  /** Print a failed or cancelled job again (the same labels and date). */
  async retry(id: string) {
    const result = await prisma.labelPrintJob.updateMany({
      where: { id, status: { in: [FAILED, CANCELLED] } },
      data: { status: QUEUED, error: null, claimStationId: null, claimExpiresAt: null, printedAt: null, printedStationId: null },
    });
    if (!result.count) throw new ConflictError("Only a failed or cancelled job can be printed again");
    return prisma.labelPrintJob.findUniqueOrThrow({ where: { id }, select: jobSelect });
  }

  /** Cancel a job no station has taken yet. */
  async cancel(id: string, now = new Date()) {
    const result = await prisma.labelPrintJob.updateMany({
      where: { id, status: QUEUED, OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }] },
      data: { status: CANCELLED, claimStationId: null, claimExpiresAt: null },
    });
    if (!result.count) throw new ConflictError("This job is already printing or finished");
    return prisma.labelPrintJob.findUniqueOrThrow({ where: { id }, select: jobSelect });
  }

  // ── Station protocol ─────────────────────────────────────────────────────────

  /** The printer the station sees (null: none attached). From the heartbeat and each claim. */
  async recordPrinter(station: AuthedStation, printer: PrinterReport | null) {
    await prisma.handheldStation.update({
      where: { id: station.id },
      data: { printerModel: printer?.model.slice(0, 80) ?? null, printerStatus: printer?.status ?? null, printerDetail: printer?.detail?.slice(0, 200) ?? null },
    });
  }

  /**
   * Takes the branch's waiting label jobs under a lease, oldest first. A station claims only while its
   * printer is ready; two stations never take the same job (FOR UPDATE SKIP LOCKED).
   */
  async claim(station: AuthedStation, printer: PrinterReport) {
    await this.recordPrinter(station, printer);
    if (printer.status !== "READY") return { jobs: [] };
    const jobs = await prisma.$queryRaw<{ id: string; labelCount: number; zpl: string }[]>`
      UPDATE "LabelPrintJob" SET
        "claimStationId" = ${station.id},
        "claimExpiresAt" = (NOW() AT TIME ZONE 'UTC') + make_interval(mins => ${PRINT_LEASE_MINUTES}::int)
      WHERE "id" IN (
        SELECT "id" FROM "LabelPrintJob"
         WHERE "branchId" = ${station.branchId} AND "status" = 'QUEUED'
           AND ("claimExpiresAt" IS NULL OR "claimExpiresAt" < (NOW() AT TIME ZONE 'UTC'))
         ORDER BY "createdAt"
         LIMIT 5
         FOR UPDATE SKIP LOCKED)
      RETURNING "id", "labelCount", "zpl"`;
    return { jobs };
  }

  /** The station sent the job to the printer (ok), or could not. A repeat of the same answer is harmless. */
  async done(station: AuthedStation, id: string, input: { ok: boolean; error?: string }) {
    const now = new Date();
    const result = await prisma.labelPrintJob.updateMany({
      where: { id, branchId: station.branchId, status: QUEUED, claimStationId: station.id },
      data: input.ok
        ? { status: PRINTED, printedAt: now, printedStationId: station.id, claimStationId: null, claimExpiresAt: null }
        : { status: FAILED, error: (input.error || "The printer did not take the labels").slice(0, 500), claimStationId: null, claimExpiresAt: null },
    });
    const job = await prisma.labelPrintJob.findUnique({ where: { id }, select: { status: true, branchId: true } });
    if (!job || job.branchId !== station.branchId) throw new NotFoundError("Label print job not found at this branch");
    if (!result.count && job.status === QUEUED) throw new ConflictError("This job is not claimed by this station");
    return { status: job.status };
  }
}
