/**
 * Pure business rules for the stock transfer workflow (issue #62, Process A).
 *
 * Everything in this file is deterministic and database-free so it can be
 * unit tested directly. The service layer loads data, calls these helpers and
 * persists the results inside a single transaction.
 */
import { IndentStatus } from "@prisma/client";
import { BadRequestError, ConflictError } from "../../shared/errors/appError";

// ── Document numbering ───────────────────────────────────────────────────────

export const DOC_TYPES = {
  INDENT: "INDENT",
  PICKING: "PICKING",
  STN: "STN",
  CASE: "CASE",
  PACKING: "PACKING",
  MIT: "MIT",
  MRN: "MRN",
} as const;

export type DocType = (typeof DOC_TYPES)[keyof typeof DOC_TYPES];

/** Legacy document number format: four-digit year followed by a six-digit sequence. */
export function formatDocumentNumber(year: number, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) {
    throw new Error(`Document sequence out of range: ${sequence}`);
  }
  return `${year}${String(sequence).padStart(6, "0")}`;
}

// ── Status transitions ───────────────────────────────────────────────────────

export type IndentAction =
  | "submit"
  | "approve"
  | "pick"
  | "reject"
  | "cancel"
  | "dispatch"
  | "receive";

/** The statuses from which each user action is allowed. */
export const ALLOWED_FROM: Record<IndentAction, IndentStatus[]> = {
  submit: [IndentStatus.DRAFT],
  approve: [IndentStatus.SUBMITTED],
  // Re-running picking is only possible for an approved indent that has nothing picked yet.
  pick: [IndentStatus.APPROVED],
  reject: [IndentStatus.SUBMITTED],
  cancel: [
    IndentStatus.DRAFT,
    IndentStatus.SUBMITTED,
    IndentStatus.APPROVED,
    IndentStatus.PICKED,
  ],
  dispatch: [IndentStatus.PICKED],
  receive: [IndentStatus.IN_TRANSIT, IndentStatus.PARTIALLY_RECEIVED],
};

export function assertTransition(current: IndentStatus, action: IndentAction): void {
  const allowed = ALLOWED_FROM[action];
  if (!allowed.includes(current)) {
    throw new ConflictError(
      `Cannot ${action} an indent in ${current} status. Allowed from: ${allowed.join(", ")}`,
    );
  }
}

// ── Money ────────────────────────────────────────────────────────────────────

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── Alternate parts ──────────────────────────────────────────────────────────

export interface PartFamilyInfo {
  id: string;
  mainPartId: string | null;
}

/**
 * A supplied part is acceptable when it is the requested part itself, or
 * belongs to the same one-level main/alternate family.
 */
export function isSameFamily(requested: PartFamilyInfo, supplied: PartFamilyInfo): boolean {
  if (requested.id === supplied.id) return true;
  const requestedRoot = requested.mainPartId ?? requested.id;
  const suppliedRoot = supplied.mainPartId ?? supplied.id;
  return requestedRoot === suppliedRoot;
}

// ── Picking ──────────────────────────────────────────────────────────────────

export interface PickPlan {
  pickedQuantity: number;
  backOrderQuantity: number;
}

/** Pick only what is available; everything else becomes back order. */
export function planPick(approvedQuantity: number, availableQuantity: number): PickPlan {
  const available = Math.max(0, availableQuantity);
  const picked = Math.min(approvedQuantity, available);
  return { pickedQuantity: picked, backOrderQuantity: approvedQuantity - picked };
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export interface PickedLine {
  id: string;
  pickedQuantity: number;
}

export interface DispatchOverride {
  pickingLineId: string;
  quantity: number;
}

/**
 * Resolve how much of each picked line is dispatched. Without overrides the
 * full picked quantity ships. Overrides may only reduce a line.
 */
export function resolveDispatchQuantities(
  pickedLines: PickedLine[],
  overrides?: DispatchOverride[],
): Map<string, number> {
  const byId = new Map(pickedLines.map((line) => [line.id, line]));
  const result = new Map<string, number>();
  for (const line of pickedLines) result.set(line.id, line.pickedQuantity);

  const seen = new Set<string>();
  for (const override of overrides ?? []) {
    const line = byId.get(override.pickingLineId);
    if (!line) {
      throw new BadRequestError(
        `Picking line ${override.pickingLineId} does not belong to this indent`,
      );
    }
    if (seen.has(override.pickingLineId)) {
      throw new BadRequestError(`Picking line ${override.pickingLineId} is listed more than once`);
    }
    seen.add(override.pickingLineId);
    if (!Number.isInteger(override.quantity) || override.quantity < 0) {
      throw new BadRequestError("Dispatch quantity must be a whole number of zero or more");
    }
    if (override.quantity > line.pickedQuantity) {
      throw new BadRequestError(
        `Cannot dispatch ${override.quantity} on a line that picked only ${line.pickedQuantity}`,
      );
    }
    result.set(line.id, override.quantity);
  }

  const total = [...result.values()].reduce((sum, qty) => sum + qty, 0);
  if (total <= 0) {
    throw new BadRequestError("Nothing to dispatch: every line has a quantity of zero");
  }
  return result;
}

// ── Cases ────────────────────────────────────────────────────────────────────

export interface CaseInput {
  packerName?: string;
  weight?: number;
  lines: { pickingLineId: string; quantity: number }[];
}

export interface CasePlan {
  packerName?: string;
  weight?: number;
  lines: { pickingLineId: string; quantity: number }[];
}

/**
 * Distribute dispatched quantities into cases. With no input everything goes
 * into one case. When cases are given, every dispatched unit must be packed
 * exactly once, and a case may hold any number of parts.
 */
export function planCases(
  dispatched: Map<string, number>,
  cases?: CaseInput[],
  defaultPacker?: string,
): CasePlan[] {
  const shipping = [...dispatched.entries()].filter(([, qty]) => qty > 0);

  if (!cases || cases.length === 0) {
    return [
      {
        packerName: defaultPacker,
        lines: shipping.map(([pickingLineId, quantity]) => ({ pickingLineId, quantity })),
      },
    ];
  }

  const packed = new Map<string, number>();
  const plans: CasePlan[] = cases.map((input, index) => {
    if (!input.lines || input.lines.length === 0) {
      throw new BadRequestError(`Case ${index + 1} has no parts`);
    }
    const merged = new Map<string, number>();
    for (const line of input.lines) {
      if (!dispatched.has(line.pickingLineId) || (dispatched.get(line.pickingLineId) ?? 0) === 0) {
        throw new BadRequestError(
          `Case ${index + 1} contains picking line ${line.pickingLineId}, which is not being dispatched`,
        );
      }
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new BadRequestError(`Case ${index + 1} has a quantity that is not a positive whole number`);
      }
      merged.set(line.pickingLineId, (merged.get(line.pickingLineId) ?? 0) + line.quantity);
      packed.set(line.pickingLineId, (packed.get(line.pickingLineId) ?? 0) + line.quantity);
    }
    return {
      packerName: input.packerName ?? defaultPacker,
      weight: input.weight,
      lines: [...merged.entries()].map(([pickingLineId, quantity]) => ({ pickingLineId, quantity })),
    };
  });

  for (const [pickingLineId, qty] of shipping) {
    const inCases = packed.get(pickingLineId) ?? 0;
    if (inCases !== qty) {
      throw new BadRequestError(
        `Picking line ${pickingLineId} dispatches ${qty} but the cases hold ${inCases}`,
      );
    }
  }
  return plans;
}

// ── Receipt ──────────────────────────────────────────────────────────────────

/** A line that was sent and is being received: an STN line (transfer) or a Mobis MIT line. */
export interface TransitLine {
  id: string;
  quantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  shortQuantity: number;
}

export interface ReceiptInputLine {
  /** The STN line (transfer) or MIT line (Mobis) being received. */
  lineId: string;
  receivedQuantity: number;
  damagedQuantity?: number;
  remarks?: string;
}

export interface ReceiptLinePlan {
  lineId: string;
  receivedQuantity: number;
  damagedQuantity: number;
  shortQuantity: number;
  remarks?: string;
}

export interface ReceiptPlan {
  lines: ReceiptLinePlan[];
  /** True when every transit line is fully accounted for after this receipt. */
  fullyAccounted: boolean;
  totals: { received: number; damaged: number; short: number };
}

export function outstandingQuantity(line: TransitLine): number {
  return line.quantity - line.receivedQuantity - line.damagedQuantity - line.shortQuantity;
}

/**
 * Work out what a receipt posts.
 *
 * - No input lines: everything outstanding is received in good condition.
 * - Input lines: only listed lines are posted, and they may not exceed what is outstanding.
 * - closeShort: whatever is still outstanding afterwards is recorded as short (missing),
 *   which closes the transfer.
 */
export function planReceipt(
  transitLines: TransitLine[],
  input?: ReceiptInputLine[],
  closeShort = false,
): ReceiptPlan {
  const byId = new Map(transitLines.map((line) => [line.id, line]));
  const posted = new Map<string, ReceiptLinePlan>();

  if (!input || input.length === 0) {
    for (const line of transitLines) {
      const outstanding = outstandingQuantity(line);
      if (outstanding > 0) {
        posted.set(line.id, {
          lineId: line.id,
          receivedQuantity: outstanding,
          damagedQuantity: 0,
          shortQuantity: 0,
        });
      }
    }
  } else {
    for (const entry of input) {
      const line = byId.get(entry.lineId);
      if (!line) {
        throw new BadRequestError(`Line ${entry.lineId} does not belong to this receipt`);
      }
      if (posted.has(entry.lineId)) {
        throw new BadRequestError(`Line ${entry.lineId} is listed more than once`);
      }
      const received = entry.receivedQuantity;
      const damaged = entry.damagedQuantity ?? 0;
      if (![received, damaged].every((q) => Number.isInteger(q) && q >= 0)) {
        throw new BadRequestError("Received and damaged quantities must be whole numbers of zero or more");
      }
      const outstanding = outstandingQuantity(line);
      if (received + damaged > outstanding) {
        throw new BadRequestError(
          `Line ${entry.lineId} has ${outstanding} outstanding but ${received + damaged} was entered`,
        );
      }
      posted.set(entry.lineId, {
        lineId: entry.lineId,
        receivedQuantity: received,
        damagedQuantity: damaged,
        shortQuantity: 0,
        remarks: entry.remarks,
      });
    }
  }

  if (closeShort) {
    for (const line of transitLines) {
      const plan = posted.get(line.id);
      const remaining =
        outstandingQuantity(line) - (plan ? plan.receivedQuantity + plan.damagedQuantity : 0);
      if (remaining > 0) {
        if (plan) plan.shortQuantity = remaining;
        else
          posted.set(line.id, {
            lineId: line.id,
            receivedQuantity: 0,
            damagedQuantity: 0,
            shortQuantity: remaining,
          });
      }
    }
  }

  const lines = [...posted.values()].filter(
    (l) => l.receivedQuantity + l.damagedQuantity + l.shortQuantity > 0,
  );
  if (lines.length === 0) {
    throw new BadRequestError("Nothing to receive: all quantities are zero or already received");
  }

  const fullyAccounted = transitLines.every((line) => {
    const plan = posted.get(line.id);
    const add = plan ? plan.receivedQuantity + plan.damagedQuantity + plan.shortQuantity : 0;
    return outstandingQuantity(line) - add === 0;
  });

  const totals = lines.reduce(
    (acc, l) => ({
      received: acc.received + l.receivedQuantity,
      damaged: acc.damaged + l.damagedQuantity,
      short: acc.short + l.shortQuantity,
    }),
    { received: 0, damaged: 0, short: 0 },
  );

  return { lines, fullyAccounted, totals };
}

// ── Progress stepper ─────────────────────────────────────────────────────────

export const PROGRESS_STEPS: { key: string; label: string; statuses: IndentStatus[] }[] = [
  { key: "SUBMITTED", label: "Indent submitted", statuses: [IndentStatus.SUBMITTED] },
  { key: "APPROVED", label: "Approved", statuses: [IndentStatus.APPROVED] },
  { key: "PICKED", label: "Picked", statuses: [IndentStatus.PICKED] },
  { key: "STN_CREATED", label: "STN created", statuses: [IndentStatus.STN_CREATED] },
  { key: "PACKED", label: "Cases packed", statuses: [IndentStatus.PACKED] },
  {
    key: "DISPATCHED",
    label: "Dispatched (in transit)",
    statuses: [IndentStatus.DISPATCHED, IndentStatus.IN_TRANSIT],
  },
  { key: "MRN_CREATED", label: "MRN created", statuses: [IndentStatus.MRN_CREATED] },
  {
    key: "RECEIVED",
    label: "Received",
    statuses: [IndentStatus.RECEIVED, IndentStatus.COMPLETED],
  },
];

export interface HistoryEntry {
  toStatus: IndentStatus;
  createdAt: Date;
  remarks: string | null;
  actor: { id: string; firstName: string; lastName: string } | null;
}

export function buildProgress(history: HistoryEntry[]) {
  return PROGRESS_STEPS.map((step) => {
    // The first time a stage was reached is the moment it completed.
    const hit = history.find((entry) => step.statuses.includes(entry.toStatus));
    return {
      key: step.key,
      label: step.label,
      completed: Boolean(hit),
      at: hit?.createdAt ?? null,
      by: hit?.actor ?? null,
      remarks: hit?.remarks ?? null,
    };
  });
}
