/**
 * Rules for handheld document uploads (legacy HHDC BI/CPO picking and MIT receiving), kept free of
 * the database so they can be unit tested.
 */
import { HandheldDocumentType, HandheldShortReason } from "@prisma/client";
import { BadRequestError } from "../../shared/errors/appError";

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
