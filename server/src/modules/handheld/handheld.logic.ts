/**
 * Rules for handheld document uploads (legacy HHDC BI/CPO picking and MIT receiving), kept free of
 * the database so they can be unit tested.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { HandheldDocumentType, HandheldShortReason } from "@prisma/client";
import { PERMISSIONS } from "../../shared/constants/roles";
import { BadRequestError } from "../../shared/errors/appError";

// Each job type uses the permissions of the web screen it stands in for (user decisions 2026-10-27 and
// 2026-10-28): indent picking -> transfers, CPO picking -> part sale, MIT receiving -> stock, count
// sheets -> stock taking (stock audits -> stockaudit). Write = send, post and cancel.
const TYPE_PERMISSIONS: Record<HandheldDocumentType, { read: string; write: string }> = {
  INDENT_PICK: { read: PERMISSIONS.TRANSFER_READ, write: PERMISSIONS.TRANSFER_DISPATCH },
  CPO_PICK: { read: PERMISSIONS.PART_SALE_READ, write: PERMISSIONS.PART_SALE_ORDER },
  MIT_RECEIVE: { read: PERMISSIONS.STOCK_READ, write: PERMISSIONS.STOCK_UPDATE },
  COUNT_SHEET: { read: PERMISSIONS.STOCK_TAKE_READ, write: PERMISSIONS.STOCK_TAKE_MANAGE },
};
const AUDIT_PERMISSIONS = { read: PERMISSIONS.STOCK_AUDIT_READ, write: PERMISSIONS.STOCK_AUDIT_MANAGE };

export function permissionsOf(type: HandheldDocumentType, audit = false): { read: string; write: string } {
  return type === HandheldDocumentType.COUNT_SHEET && audit ? AUDIT_PERMISSIONS : TYPE_PERMISSIONS[type];
}

/** A station is online while it has sent a heartbeat in the last 2 minutes (it sends one every 20 s). */
export const STATION_OFFLINE_MS = 2 * 60 * 1000;
export const isStationOnline = (lastSeenAt: Date | null | undefined, now = new Date()) =>
  !!lastSeenAt && now.getTime() - lastSeenAt.getTime() <= STATION_OFFLINE_MS;

/** A station that took jobs for a docked handheld has this long to write and confirm them. */
export const DELIVERY_LEASE_MINUTES = 5;
/** A job still waiting for a handheld after this long is reported once. */
export const WAITING_NOTICE_HOURS = 2;

/**
 * Station keys: "<stationId>.<secret>". Only the sha-256 of the secret is stored (the secret is 32
 * random bytes, so a slow hash adds nothing); its first 8 characters are shown on the web.
 */
export function newStationSecret() {
  const secret = randomBytes(32).toString("base64url");
  return { secret, prefix: secret.slice(0, 8), hash: hashSecret(secret) };
}
export const hashSecret = (secret: string) => createHash("sha256").update(secret, "utf8").digest("hex");
export function parseStationKey(header: string | undefined): { stationId: string; secret: string } | null {
  const m = /^Station\s+([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,})$/i.exec(header?.trim() ?? "");
  return m ? { stationId: m[1].toLowerCase(), secret: m[2] } : null;
}
export function secretMatches(secret: string, storedHash: string) {
  const a = Buffer.from(hashSecret(secret), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** JSON with object keys sorted, so the same device result always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
export const resultHash = (result: unknown) => createHash("sha256").update(canonicalJson(result), "utf8").digest("hex");

/**
 * The hash that decides "same result again" for a station submission. A count sheet's times are left
 * out: the station stamps its receive time when the device clock is wrong (it reads 2009), so a repeat
 * of the same counts would otherwise look different.
 */
export function resultFingerprint(kind: "DOC" | "SHEET", result: unknown): string {
  if (kind !== "SHEET") return resultHash(result);
  const entries = ((result as { entries?: Record<string, unknown>[] }).entries ?? []).map(({ countedAt: _countedAt, ...rest }) => rest);
  return resultHash({ entries });
}

/** Next free handheld name of a branch: MC3190-1, MC3190-2, ... */
export function nextDeviceName(taken: string[]): string {
  const used = new Set(taken.map((n) => n.toUpperCase()));
  for (let i = 1; ; i++) if (!used.has(`MC3190-${i}`)) return `MC3190-${i}`;
}

/** The end of "CPO 2026000016 was picked on the handheld: 2 lines short". */
export function describeOutcome(
  type: HandheldDocumentType,
  t: { lines: number; short?: number; unreported?: number; damaged?: number; extras?: number; differences?: number; counted?: number },
): string {
  if (type === HandheldDocumentType.COUNT_SHEET) return `was counted on the handheld: ${t.counted ?? 0} of ${t.lines} part(s) counted`;
  if (type === HandheldDocumentType.MIT_RECEIVE) {
    const notes = [
      t.differences ? `${t.differences} line(s) differ from the invoice` : "",
      t.unreported ? `${t.unreported} line(s) not checked` : "",
      t.extras ? `${t.extras} part(s) not on the MIT` : "",
    ].filter(Boolean);
    return `was checked on the handheld${notes.length ? `: ${notes.join(", ")}` : ": all as invoiced"}`;
  }
  const short = (t.short ?? 0) + (t.unreported ?? 0);
  return `was picked on the handheld${short ? `: ${short} line(s) short` : ": all picked"}`;
}

export interface SnapshotLine {
  id: string;
  lineNumber: number;
  partNumber: string;
  expectedQuantity: number;
}

export interface UploadLineInput {
  lineId: string;
  quantity: number;
  damagedQuantity?: number;
  shortReason?: HandheldShortReason;
  scannedPartNumber?: string;
  note?: string;
}

export interface UploadExtraInput {
  partNumber: string;
  quantity: number;
  damagedQuantity?: number;
  note?: string;
}

export interface UploadLinePlan {
  lineId: string;
  // null: an MIT line the checker never reached (the store checks it on the MRN).
  quantity: number | null;
  damagedQuantity: number;
  shortReason: HandheldShortReason | null;
  scannedPartNumber: string | null;
  note: string | null;
  // Picking only: reserved units the picker did not pick, released at upload.
  short: number;
}

export interface UploadPlan {
  lines: UploadLinePlan[];
  extras: UploadExtraInput[];
  totals: { expected: number; quantity: number; damaged: number; short: number; unreported: number };
}

const isPicking = (type: HandheldDocumentType) => type !== HandheldDocumentType.MIT_RECEIVE;

const blank = (s?: string | null) => {
  const t = s?.trim();
  return t ? t : null;
};

/**
 * Checks the device result against the document as sent. Picking: picked may not exceed the reserved
 * quantity, a short line needs a reason, and a line the picker never saved counts as not picked with
 * `unreportedReason`. MIT: received plus damaged may not exceed the invoice quantity (the MRN rule),
 * and a line never reached stays unverified.
 */
export function planUpload(
  type: HandheldDocumentType,
  snapshot: SnapshotLine[],
  input: UploadLineInput[],
  extras: UploadExtraInput[] = [],
  unreportedReason: HandheldShortReason = HandheldShortReason.NOT_FOUND,
): UploadPlan {
  const byId = new Map(snapshot.map((l) => [l.id, l]));
  const given = new Map<string, UploadLineInput>();
  for (const entry of input) {
    const line = byId.get(entry.lineId);
    if (!line) throw new BadRequestError(`Line ${entry.lineId} is not on this document`);
    if (given.has(entry.lineId)) throw new BadRequestError(`Line ${line.lineNumber} (${line.partNumber}) is listed more than once`);
    given.set(entry.lineId, entry);
  }
  if (!given.size && !extras.length) throw new BadRequestError("Nothing was recorded on the handheld; there is nothing to upload");
  if (extras.length && isPicking(type)) {
    throw new BadRequestError("Only an MIT can record parts that are not on the document");
  }

  const lines: UploadLinePlan[] = [];
  for (const line of [...snapshot].sort((a, b) => a.lineNumber - b.lineNumber)) {
    const entry = given.get(line.id);
    const label = `Line ${line.lineNumber} (${line.partNumber})`;
    if (!entry) {
      lines.push(
        isPicking(type)
          ? { lineId: line.id, quantity: 0, damagedQuantity: 0, shortReason: line.expectedQuantity > 0 ? unreportedReason : null, scannedPartNumber: null, note: null, short: line.expectedQuantity }
          : { lineId: line.id, quantity: null, damagedQuantity: 0, shortReason: null, scannedPartNumber: null, note: null, short: 0 },
      );
      continue;
    }
    const damaged = entry.damagedQuantity ?? 0;
    if (![entry.quantity, damaged].every((q) => Number.isInteger(q) && q >= 0)) {
      throw new BadRequestError(`${label}: quantities must be whole numbers of zero or more`);
    }
    if (isPicking(type)) {
      if (damaged > 0) throw new BadRequestError(`${label}: damaged quantity is recorded only when receiving an MIT`);
      if (entry.quantity > line.expectedQuantity) {
        throw new BadRequestError(`${label}: ${entry.quantity} picked but only ${line.expectedQuantity} reserved`);
      }
      if (entry.quantity < line.expectedQuantity && !entry.shortReason) {
        throw new BadRequestError(`${label}: give a reason for picking ${entry.quantity} of ${line.expectedQuantity}`);
      }
    } else if (entry.quantity + damaged > line.expectedQuantity) {
      throw new BadRequestError(`${label}: ${entry.quantity + damaged} received but the invoice has ${line.expectedQuantity}`);
    }
    const short = isPicking(type) ? line.expectedQuantity - entry.quantity : 0;
    lines.push({
      lineId: line.id,
      quantity: entry.quantity,
      damagedQuantity: damaged,
      shortReason: isPicking(type) ? (short > 0 ? entry.shortReason! : null) : (entry.shortReason ?? null),
      scannedPartNumber: blank(entry.scannedPartNumber),
      note: blank(entry.note),
      short,
    });
  }

  for (const extra of extras) {
    if (!blank(extra.partNumber)) throw new BadRequestError("An extra part needs a part number");
    const damaged = extra.damagedQuantity ?? 0;
    if (![extra.quantity, damaged].every((q) => Number.isInteger(q) && q >= 0) || extra.quantity + damaged === 0) {
      throw new BadRequestError(`Extra part ${extra.partNumber}: enter a whole quantity above zero`);
    }
  }

  const totals = lines.reduce(
    (t, l) => ({
      expected: t.expected + (byId.get(l.lineId)?.expectedQuantity ?? 0),
      quantity: t.quantity + (l.quantity ?? 0),
      damaged: t.damaged + l.damagedQuantity,
      short: t.short + l.short,
      unreported: t.unreported + (given.has(l.lineId) ? 0 : 1),
    }),
    { expected: 0, quantity: 0, damaged: 0, short: 0, unreported: 0 },
  );
  return { lines, extras: extras.map((e) => ({ ...e, partNumber: e.partNumber.trim(), note: blank(e.note) ?? undefined })), totals };
}
