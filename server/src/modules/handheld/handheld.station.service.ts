/**
 * Handheld stations: store PCs running HHDC Link in station mode (no window, no user sign-in). A
 * station authenticates with its own key and, while a handheld is docked, delivers the branch's queued
 * jobs to it and collects finished results (user decisions 2026-10-28: any station of the branch, any
 * docked handheld; a job waits in the queue until one docks).
 *
 *   heartbeat (every 20 s) ─► claim queued jobs for the docked handheld (lease) ─► write ─► confirm (SENT)
 *   heartbeat lists the job files on the device ─► per file: COLLECT, REMOVE or KEEP
 *   collect ─► result stored (RECEIVED), applied only when posted on the web (handheld.service.ts)
 *
 * Results are idempotent: the same result again changes nothing; a different one for a received job is
 * refused. The station deletes a device file only when told it may (never one with unposted entries).
 */
import { HandheldDocumentStatus, HandheldDocumentType, Prisma, StockTakeStatus } from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from "../../shared/errors/appError";
import { nextDocumentNumber } from "../stock-transfer/stockTransfer.service";
import { DOC_TYPES } from "../stock-transfer/stockTransfer.logic";
import { StockTakeService } from "../stock-take/stockTake.service";
import { ACTIVE_HANDHELD_STATUSES } from "./handheld.hooks";
import {
  DELIVERY_LEASE_MINUTES,
  describeOutcome,
  isStationOnline,
  newStationSecret,
  nextDeviceName,
  parseStationKey,
  planUpload,
  resultFingerprint,
  secretMatches,
  STATION_OFFLINE_MS,
  WAITING_NOTICE_HOURS,
} from "./handheld.logic";
import { HandheldNotifier, jobRefSelect } from "./handheld.notifications";
import { HandheldService, SheetResult, UploadInput } from "./handheld.service";

const { QUEUED, SENT, RECEIVED, UPLOADED, CANCELLED } = HandheldDocumentStatus;
const { COUNT_SHEET, MIT_RECEIVE } = HandheldDocumentType;

export interface AuthedStation {
  id: string;
  branchId: string;
  name: string;
}

export interface DeviceFile {
  // DOC: a picking or MIT document (id = job id); SHEET: a count sheet (id = sheet id).
  kind: "DOC" | "SHEET";
  id: string;
  started: boolean;
  finished: boolean;
}

export interface HeartbeatInput {
  linkVersion?: string;
  error?: string;
  docked?: {
    deviceId?: string;
    appVersion?: string;
    appStatus?: "OK" | "UPDATED" | "INSTALL_FAILED" | "MISSING";
    appError?: string;
    files?: DeviceFile[];
  } | null;
}

export type FileAction = "COLLECT" | "REMOVE" | "KEEP";

export interface ResultInput {
  deviceId: string;
  kind: "DOC" | "SHEET";
  id: string;
  result: UploadInput | SheetResult;
}

const stationSelect = {
  id: true,
  name: true,
  branchId: true,
  keyPrefix: true,
  createdAt: true,
  revokedAt: true,
  lastSeenAt: true,
  linkVersion: true,
  lastError: true,
  branch: { select: { id: true, name: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  dockedDevice: { select: { id: true, name: true, appVersion: true, appStatus: true } },
} satisfies Prisma.HandheldStationSelect;

export class HandheldStationService {
  private handheld = new HandheldService();
  private stockTake = new StockTakeService();
  private notifier = new HandheldNotifier();

  // ── Admin (handheld:stations) and the stations page ─────────────────────────

  /** Stations, handhelds and active jobs of a branch (or all branches), for the Settings > HHDC page. */
  async overview(branchId?: string) {
    const now = new Date();
    const where = branchId ? { branchId } : {};
    const [stations, devices, jobs] = await Promise.all([
      prisma.handheldStation.findMany({ where, orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { name: "asc" }], select: stationSelect }),
      prisma.handheldDevice.findMany({ where, orderBy: { name: "asc" }, include: { branch: { select: { name: true } }, lastStation: { select: { name: true } } } }),
      prisma.handheldDocument.findMany({
        where: { ...where, status: { in: ACTIVE_HANDHELD_STATUSES } },
        orderBy: { queuedAt: "asc" },
        take: 300,
        select: { ...jobRefSelect, status: true, queuedAt: true, sentAt: true, receivedAt: true, lineCount: true, deliveredDevice: { select: { name: true } }, deliveredStation: { select: { name: true } } },
      }),
    ]);
    return {
      stations: stations.map((s) => ({ ...s, online: !s.revokedAt && isStationOnline(s.lastSeenAt, now) })),
      devices,
      jobs,
    };
  }

  async createStation(input: { branchId: string; name: string }, actorId: string) {
    const branch = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } });
    if (!branch) throw new NotFoundError("Branch not found");
    const name = input.name.trim().toUpperCase();
    const clash = await prisma.handheldStation.findFirst({ where: { branchId: branch.id, name, revokedAt: null }, select: { id: true } });
    if (clash) throw new ConflictError(`${name} is already registered at this branch; issue it a new key instead`);
    const key = newStationSecret();
    const station = await prisma.handheldStation.create({
      data: { branchId: branch.id, name, keyPrefix: key.prefix, keyHash: key.hash, createdById: actorId },
      select: stationSelect,
    });
    return { station, key: `${station.id}.${key.secret}` };
  }

  /** A new key (the old one stops working at once), e.g. when the PC is rebuilt. */
  async rotateKey(id: string) {
    const key = newStationSecret();
    const result = await prisma.handheldStation.updateMany({ where: { id, revokedAt: null }, data: { keyPrefix: key.prefix, keyHash: key.hash } });
    if (!result.count) throw new NotFoundError("Station not found or revoked");
    return { station: await this.getStation(id), key: `${id}.${key.secret}` };
  }

  async revoke(id: string) {
    const result = await prisma.handheldStation.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), dockedDeviceId: null } });
    if (!result.count) throw new NotFoundError("Station not found or already revoked");
    return this.getStation(id);
  }

  async renameDevice(id: string, name: string) {
    try {
      return await prisma.handheldDevice.update({ where: { id }, data: { name: name.trim().toUpperCase() } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError("Another handheld of this branch has that name");
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new NotFoundError("Handheld not found");
      throw error;
    }
  }

  async getStation(id: string) {
    const station = await prisma.handheldStation.findUnique({ where: { id }, select: stationSelect });
    if (!station) throw new NotFoundError("Station not found");
    return station;
  }

  async stationBranchId(id: string) {
    return (await this.getStation(id)).branchId;
  }

  async deviceBranchId(id: string) {
    const device = await prisma.handheldDevice.findUnique({ where: { id }, select: { branchId: true } });
    if (!device) throw new NotFoundError("Handheld not found");
    return device.branchId;
  }

  // ── Station protocol ─────────────────────────────────────────────────────────

  /** `Authorization: Station <stationId>.<secret>`; a revoked or unknown key is refused. */
  async authenticate(header: string | undefined): Promise<AuthedStation> {
    const key = parseStationKey(header);
    if (!key) throw new UnauthorizedError("Station key required");
    const station = await prisma.handheldStation.findUnique({ where: { id: key.stationId }, select: { id: true, branchId: true, name: true, keyHash: true, revokedAt: true } });
    if (!station || station.revokedAt || !secretMatches(key.secret, station.keyHash)) throw new UnauthorizedError("This station key is not valid; register the PC again");
    return { id: station.id, branchId: station.branchId, name: station.name };
  }

  async heartbeat(station: AuthedStation, input: HeartbeatInput) {
    const now = new Date();
    const docked = input.docked ?? null;
    const device = docked ? await this.identifyDevice(station, docked, now) : null;
    await prisma.handheldStation.update({
      where: { id: station.id },
      data: {
        lastSeenAt: now,
        linkVersion: input.linkVersion?.slice(0, 40) ?? undefined,
        lastError: input.error?.slice(0, 500) ?? null,
        offlineNotifiedAt: null,
        dockedDeviceId: device?.id ?? null,
      },
    });
    if (!device) return { device: null, deliver: 0, files: [] };
    const deliver = await prisma.handheldDocument.count({ where: this.claimableWhere(station.branchId, now) });
    const files = await Promise.all((docked!.files ?? []).map(async (f) => ({ kind: f.kind, id: f.id, ...(await this.fileAction(station, f)) })));
    return { device: { id: device.id, name: device.name }, deliver, files };
  }

  /**
   * Takes every waiting job of the branch for the docked handheld, under a lease. Two stations docking
   * at once never take the same job (FOR UPDATE SKIP LOCKED). Returns what the station writes.
   */
  async claim(station: AuthedStation, deviceId: string) {
    await this.assertDevice(station, deviceId);
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE "HandheldDocument" SET
        "claimStationId" = ${station.id},
        "claimDeviceId" = ${deviceId},
        "claimExpiresAt" = (NOW() AT TIME ZONE 'UTC') + make_interval(mins => ${DELIVERY_LEASE_MINUTES}::int)
      WHERE "id" IN (
        SELECT "id" FROM "HandheldDocument"
         WHERE "branchId" = ${station.branchId} AND "status" = 'QUEUED'
           AND ("claimExpiresAt" IS NULL OR "claimExpiresAt" < (NOW() AT TIME ZONE 'UTC'))
         ORDER BY "queuedAt"
         LIMIT 20
         FOR UPDATE SKIP LOCKED)
      RETURNING "id"`;
    const jobs = [];
    for (const { id } of ids) {
      const doc = await this.handheld.getDocument(id);
      if (doc.type === COUNT_SHEET) {
        const sheet = await this.stockTake.getSheet(doc.stockTakeSheet!.stockTake.id, doc.stockTakeSheetId!);
        jobs.push({ id: doc.id, type: doc.type, documentNumber: doc.documentNumber, sheet });
      } else {
        jobs.push({ id: doc.id, type: doc.type, documentNumber: doc.documentNumber, document: doc });
      }
    }
    return { jobs };
  }

  /** The station read the file back from the handheld: the job is now on it. */
  async confirm(station: AuthedStation, jobId: string, deviceId: string) {
    const device = await this.assertDevice(station, deviceId);
    const now = new Date();
    const result = await prisma.handheldDocument.updateMany({
      where: { id: jobId, status: QUEUED, claimStationId: station.id, claimDeviceId: deviceId },
      data: { status: SENT, sentAt: now, deliveredStationId: station.id, deliveredDeviceId: deviceId, claimStationId: null, claimDeviceId: null, claimExpiresAt: null },
    });
    const job = await prisma.handheldDocument.findUnique({ where: { id: jobId }, select: { ...jobRefSelect, status: true, deliveredDeviceId: true } });
    if (!job) throw new NotFoundError("Handheld job not found");
    if (result.count) {
      await this.notifier.delivered(job, device.name);
      return { status: SENT };
    }
    // Already confirmed (a repeat), or cancelled while it was being written: the station removes it.
    if (job.status === SENT && job.deliveredDeviceId === deviceId) return { status: SENT };
    return { status: job.status };
  }

  /** Writing failed (for example the device file has entries): back to the queue for the next dock. */
  async release(station: AuthedStation, jobId: string, reason: string) {
    await prisma.handheldDocument.updateMany({
      where: { id: jobId, status: QUEUED, claimStationId: station.id },
      data: { claimStationId: null, claimDeviceId: null, claimExpiresAt: null },
    });
    await prisma.handheldStation.update({ where: { id: station.id }, data: { lastError: reason.slice(0, 500) } });
    return { status: QUEUED };
  }

  /**
   * A finished result from the device. Stored, not applied (the store posts it on the web). `clear`
   * tells the station it may delete the device files.
   */
  async submitResult(station: AuthedStation, input: ResultInput) {
    const device = await this.assertDevice(station, input.deviceId);
    const hash = resultFingerprint(input.kind, input.result);
    const now = new Date();
    const job = input.kind === "SHEET" ? await this.sheetJobForResult(station, input.id) : await this.docJob(station, input.id);
    if (!job) return { status: "CLOSED", clear: false, message: "The sheet is closed and has no handheld job; ask the store" };

    const updated = await prisma.handheldDocument.updateMany({
      where: { id: job.id, status: { in: [QUEUED, SENT] } },
      data: {
        status: RECEIVED,
        receivedAt: now,
        receivedStationId: station.id,
        result: input.result as unknown as Prisma.InputJsonValue,
        resultHash: hash,
        claimStationId: null,
        claimDeviceId: null,
        claimExpiresAt: null,
        ...(!job.deliveredDeviceId && { deliveredDeviceId: device.id, deliveredStationId: station.id, sentAt: job.sentAt ?? now }),
      },
    });
    if (updated.count) {
      const ref = await prisma.handheldDocument.findUniqueOrThrow({ where: { id: job.id }, select: jobRefSelect });
      await this.notifier.received(ref, await this.outcomeOf(job.id));
      return { status: RECEIVED, clear: true, jobId: job.id };
    }
    const current = await prisma.handheldDocument.findUniqueOrThrow({ where: { id: job.id }, select: { status: true, resultHash: true, cancelRemark: true } });
    if (current.status === RECEIVED || current.status === UPLOADED) {
      if (current.resultHash === hash) return { status: current.status, clear: true, jobId: job.id };
      if (current.status === RECEIVED) throw new ConflictError("A different result was already received for this job; the device copy was kept");
      return { status: current.status, clear: false, jobId: job.id, message: "Posted from another result; the device copy was kept" };
    }
    await this.markKept(job.id);
    return { status: current.status, clear: false, jobId: job.id, message: `Cancelled${current.cancelRemark ? `: ${current.cancelRemark}` : ""}; the device copy was kept` };
  }

  /** What the station removed from the device after a cancel, or kept because it had entries. */
  async cleared(station: AuthedStation, deviceId: string, input: { removed: string[]; kept: string[] }) {
    await this.assertDevice(station, deviceId);
    const now = new Date();
    const mine = { branchId: station.branchId, status: CANCELLED };
    await prisma.handheldDocument.updateMany({ where: { ...mine, id: { in: input.removed } }, data: { deviceClearedAt: now } });
    await prisma.handheldDocument.updateMany({ where: { ...mine, id: { in: input.kept } }, data: { deviceKeptEntries: true } });
    return { ok: true };
  }

  // ── Sweep (every minute, from server.ts) ──────────────────────────────────────

  /** "Still waiting" after 2 h, "station offline" while jobs wait, and cancel notices (after commit). */
  async sweep(now = new Date()) {
    const waitedSince = new Date(now.getTime() - WAITING_NOTICE_HOURS * 3600_000);
    const waiting = await prisma.handheldDocument.findMany({ where: { status: QUEUED, queuedAt: { lt: waitedSince }, waitNotifiedAt: null }, select: jobRefSelect, take: 100 });
    for (const job of waiting) {
      const claimed = await prisma.handheldDocument.updateMany({ where: { id: job.id, waitNotifiedAt: null }, data: { waitNotifiedAt: now } });
      if (claimed.count) await this.notifier.waitingLong(job, WAITING_NOTICE_HOURS);
    }

    // Once per outage, and only when jobs are waiting (user decision 2026-10-28: PCs are off at night).
    const offlineSince = new Date(now.getTime() - STATION_OFFLINE_MS);
    const gone = await prisma.handheldStation.findMany({
      where: { revokedAt: null, offlineNotifiedAt: null, lastSeenAt: { lt: offlineSince } },
      select: { id: true, name: true, branchId: true, branch: { select: { name: true } } },
    });
    for (const station of gone) {
      const claimed = await prisma.handheldStation.updateMany({ where: { id: station.id, offlineNotifiedAt: null }, data: { offlineNotifiedAt: now, dockedDeviceId: null } });
      if (!claimed.count) continue;
      const jobs = await prisma.handheldDocument.count({ where: { branchId: station.branchId, status: { in: [QUEUED, SENT] } } });
      if (jobs) await this.notifier.stationOffline(station, jobs);
    }

    const cancelled = await prisma.handheldDocument.findMany({ where: { status: CANCELLED, cancelNotifiedAt: null }, orderBy: { cancelledAt: "asc" }, select: jobRefSelect, take: 200 });
    if (cancelled.length) {
      await prisma.handheldDocument.updateMany({ where: { id: { in: cancelled.map((j) => j.id) }, cancelNotifiedAt: null }, data: { cancelNotifiedAt: now } });
      await this.notifier.cancelled(cancelled);
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private claimableWhere(branchId: string, now: Date): Prisma.HandheldDocumentWhereInput {
    return { branchId, status: QUEUED, OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }] };
  }

  /**
   * The docked handheld by the id in its device.txt. A new handheld (no id, or an id this server does
   * not know) is registered under the next free name; one brought from another branch moves here.
   */
  private async identifyDevice(station: AuthedStation, docked: NonNullable<HeartbeatInput["docked"]>, now: Date) {
    const app = { appVersion: docked.appVersion?.slice(0, 40) ?? null, appStatus: docked.appStatus ?? null, appError: docked.appError?.slice(0, 500) ?? null, lastSeenAt: now, lastStationId: station.id };
    const known = docked.deviceId ? await prisma.handheldDevice.findUnique({ where: { id: docked.deviceId } }) : null;
    let device;
    if (known && known.branchId === station.branchId) {
      device = await prisma.handheldDevice.update({ where: { id: known.id }, data: app });
    } else {
      const taken = (await prisma.handheldDevice.findMany({ where: { branchId: station.branchId }, select: { name: true } })).map((d) => d.name);
      const name = known && !taken.includes(known.name) ? known.name : nextDeviceName(taken);
      device = known
        ? await prisma.handheldDevice.update({ where: { id: known.id }, data: { ...app, branchId: station.branchId, name } })
        : await prisma.handheldDevice.create({ data: { ...app, ...(docked.deviceId && { id: docked.deviceId }), branchId: station.branchId, name } });
    }
    if (docked.appStatus === "INSTALL_FAILED" && known?.appStatus !== "INSTALL_FAILED") {
      await this.notifier.installFailed(device, station.name, docked.appError ?? "unknown error");
    }
    return device;
  }

  private async assertDevice(station: AuthedStation, deviceId: string) {
    const device = await prisma.handheldDevice.findUnique({ where: { id: deviceId }, select: { id: true, name: true, branchId: true } });
    if (!device || device.branchId !== station.branchId) throw new BadRequestError("This handheld is not registered at the station's branch; send a heartbeat first");
    return device;
  }

  private async docJob(station: AuthedStation, id: string) {
    const job = await prisma.handheldDocument.findUnique({ where: { id }, select: { id: true, branchId: true, type: true, deliveredDeviceId: true, sentAt: true } });
    if (!job || job.branchId !== station.branchId || job.type === COUNT_SHEET) throw new NotFoundError("Handheld job not found at this branch");
    return job;
  }

  /**
   * The job a count sheet's result belongs to: its active job, else the one already posted with this
   * result. A sheet written by the old HHDC Link has no job: one is created as received.
   */
  private async sheetJobForResult(station: AuthedStation, sheetId: string) {
    const sheet = await prisma.stockTakeSheet.findUnique({
      where: { id: sheetId },
      include: { checker: { select: { firstName: true, lastName: true } }, stockTake: { select: { branchId: true, status: true } } },
    });
    if (!sheet || sheet.stockTake.branchId !== station.branchId) throw new NotFoundError("Count sheet not found at this branch");
    const select = { id: true, branchId: true, type: true, deliveredDeviceId: true, sentAt: true };
    const latest = await prisma.handheldDocument.findFirst({ where: { stockTakeSheetId: sheetId }, orderBy: { queuedAt: "desc" }, select: { ...select, status: true } });
    if (latest) return latest;
    if (sheet.uploadedAt || sheet.cancelledAt || sheet.stockTake.status !== StockTakeStatus.ACTIVE) return null;
    try {
      return await prisma.$transaction(async (tx) =>
        tx.handheldDocument.create({
          data: {
            documentNumber: await nextDocumentNumber(tx, DOC_TYPES.HANDHELD, new Date()),
            type: COUNT_SHEET,
            stockTakeSheetId: sheetId,
            branchId: station.branchId,
            pickerName: sheet.checker ? `${sheet.checker.firstName} ${sheet.checker.lastName}`.trim() : "",
            lineCount: sheet.lineCount,
            status: SENT,
            queuedAt: sheet.issuedAt,
          },
          select,
        }),
      );
    } catch (error) {
      // Another station collected it at the same moment.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return prisma.handheldDocument.findFirst({ where: { stockTakeSheetId: sheetId, status: { in: ACTIVE_HANDHELD_STATUSES } }, select });
      }
      throw error;
    }
  }

  /** What the station should do with one job file on the docked handheld. */
  private async fileAction(station: AuthedStation, f: DeviceFile): Promise<{ action: FileAction; reason?: string }> {
    let status: HandheldDocumentStatus | "NONE";
    let jobId: string | null = null;
    let sheetClosed = false;
    if (f.kind === "SHEET") {
      const sheet = await prisma.stockTakeSheet.findUnique({ where: { id: f.id }, select: { uploadedAt: true, cancelledAt: true, stockTake: { select: { branchId: true, status: true } } } });
      if (!sheet || sheet.stockTake.branchId !== station.branchId) return { action: "KEEP", reason: "not a sheet of this branch" };
      sheetClosed = !!sheet.uploadedAt || !!sheet.cancelledAt || sheet.stockTake.status !== StockTakeStatus.ACTIVE;
      const latest = await prisma.handheldDocument.findFirst({ where: { stockTakeSheetId: f.id }, orderBy: { queuedAt: "desc" }, select: { id: true, status: true } });
      status = latest?.status ?? "NONE";
      jobId = latest?.id ?? null;
    } else {
      const job = await prisma.handheldDocument.findUnique({ where: { id: f.id }, select: { id: true, status: true, branchId: true } });
      if (!job || job.branchId !== station.branchId) return { action: "KEEP", reason: "not a job of this branch" };
      status = job.status;
      jobId = job.id;
    }

    if (f.finished) {
      if (status === CANCELLED || (f.kind === "SHEET" && sheetClosed && status !== UPLOADED)) {
        if (jobId && status === CANCELLED) await this.markKept(jobId);
        return { action: "KEEP", reason: "cancelled after it was worked on the handheld" };
      }
      return { action: "COLLECT" };
    }
    if (f.started) {
      if (jobId && status === CANCELLED) await this.markKept(jobId);
      return { action: "KEEP", reason: "in progress" };
    }
    // Never started: remove it once the job is over.
    if (status === CANCELLED || status === UPLOADED || (f.kind === "SHEET" && sheetClosed)) return { action: "REMOVE" };
    return { action: "KEEP", reason: status === "NONE" ? "sent by HHDC Link" : "waiting for the picker" };
  }

  private async markKept(jobId: string) {
    await prisma.handheldDocument.updateMany({ where: { id: jobId, status: CANCELLED, deviceKeptEntries: false }, data: { deviceKeptEntries: true } });
  }

  /** The end of the "finished on the handheld" notice. */
  private async outcomeOf(jobId: string): Promise<string> {
    const doc = await prisma.handheldDocument.findUniqueOrThrow({ where: { id: jobId }, include: { lines: true } });
    if (doc.type === COUNT_SHEET) {
      const entries = (doc.result as unknown as SheetResult).entries ?? [];
      const parts = new Set(entries.map((e) => (e.partId ?? e.partNumber ?? "").toUpperCase()));
      return describeOutcome(doc.type, { lines: doc.lineCount, counted: parts.size });
    }
    const result = doc.result as unknown as UploadInput;
    try {
      const plan = planUpload(doc.type, doc.lines, result.lines ?? [], result.extras ?? []);
      const reported = new Set((result.lines ?? []).map((l) => l.lineId));
      const expected = new Map(doc.lines.map((l) => [l.id, l.expectedQuantity]));
      return describeOutcome(doc.type, {
        lines: doc.lines.length,
        short: plan.lines.filter((l) => reported.has(l.lineId) && l.short > 0).length,
        unreported: plan.totals.unreported,
        extras: plan.extras.length,
        differences:
          doc.type === MIT_RECEIVE ? plan.lines.filter((l) => reported.has(l.lineId) && (l.quantity !== expected.get(l.lineId) || l.damagedQuantity > 0)).length : 0,
      });
    } catch (error) {
      return `came back from the handheld but cannot be posted as it is (${error instanceof Error ? error.message : String(error)})`;
    }
  }
}

/** Starts the handheld sweep (every minute). */
export function startHandheldSweep() {
  const service = new HandheldStationService();
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await service.sweep();
    } catch (error) {
      console.error("Handheld sweep failed; will retry", error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
