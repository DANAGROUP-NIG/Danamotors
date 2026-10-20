/**
 * Physical stock taking and stock audit reports (legacy Physical Stock Taking and Stock Audit MIS
 * menus), run through the parts reports screen. One set of rows serves both, filtered by kind:
 *  - Stock Taking Report (detail, summary, checker detail), Part Wise, Bin Location Wise and Damage
 *    Parts physical stock taking reports; Part Wise, Remarks Wise and Stock Audit History.
 *  - List of Not Defined Parts, List of Batch Parts Not Uploaded and Parts Having Bin Location
 *    Exceeds Defined Limit.
 *  - Stock Taking Log and Stock Audit Log (stockTakeLogRows).
 */
import { Prisma, StockAuditLevel, StockTakeStatus, StockTakeType } from "@prisma/client";
import prisma from "../../prisma/client";
import { money, sumMoney } from "../finance/money";
import { dateRange, partWhere, ReportFilters, Row, userName } from "../parts-report/partsReport.common";
import { BIN_LIMIT, discrepancy, Kind } from "./stockTake.logic";

const TYPE_LABELS: Record<StockTakeType, string> = { ANNUAL: "Annual", PERPETUAL: "Perpetual", AUDIT: "Audit" };
const AUDIT_LEVEL_LABELS: Record<StockAuditLevel, string> = {
  INTERNAL: "Internal audit",
  AUDIT_HEAD: "Audit by audit head",
  VISITING_MANAGEMENT: "Audit by visiting management",
};
const STATUS_LABELS: Record<StockTakeStatus, string> = { ACTIVE: "Counting", COMPLETED: "Completed", CONFIRMED: "S/E confirmed", CANCELLED: "Cancelled" };
const person = { select: { firstName: true, lastName: true } } as const;

const typeLabel = (t: { type: StockTakeType; auditLevel: StockAuditLevel | null }) => (t.auditLevel ? AUDIT_LEVEL_LABELS[t.auditLevel] : TYPE_LABELS[t.type]);

/**
 * The counts a report covers: physical counts or audits of the type asked for, at the branch, and
 * either the one batch numbered or those created in the period (`dated`). A log also lists events
 * of cancelled counts.
 */
function takeWhere(f: ReportFilters, kind: Kind, { dated = true, cancelled = false } = {}): Prisma.StockTakeWhereInput {
  const level = kind === "AUDIT" && f.countType && f.countType in AUDIT_LEVEL_LABELS ? (f.countType as StockAuditLevel) : undefined;
  const type = kind === "COUNT" && (f.countType === StockTakeType.ANNUAL || f.countType === StockTakeType.PERPETUAL) ? f.countType : undefined;
  const batch = f.search?.trim();
  return {
    ...(!cancelled && { status: { not: StockTakeStatus.CANCELLED } }),
    type: kind === "AUDIT" ? StockTakeType.AUDIT : (type ?? { not: StockTakeType.AUDIT }),
    ...(level && { auditLevel: level }),
    ...(f.branchId && { branchId: f.branchId }),
    // A batch number picks one count whatever its date.
    ...(batch ? { batchNumber: batch } : dated && { createdAt: dateRange(f) }),
  };
}

/**
 * Parts the line reports cover: those matching the part filters, plus with "Include parts identified
 * as not required" the part numbers not in Part Master that the store set aside.
 */
function partLineWhere(f: ReportFilters): Prisma.StockTakeLineWhereInput {
  const partFiltered = !!(f.partId || f.partType || f.partFlag || f.priceCategory);
  return {
    ...(partFiltered
      ? { part: partWhere(f) }
      : { OR: [{ partId: { not: null } }, ...(f.includeNotRequired ? [{ notRequired: true }] : [])] }),
    ...(f.onlyRemarks && { remarks: { gt: "" } }),
  };
}

const lineInclude = {
  part: { select: { partNumber: true, name: true, partFlag: true, unitPrice: true } },
  stockTake: { select: { batchNumber: true, createdAt: true, auditors: true, type: true, auditLevel: true } },
  sheet: { select: { checker: person } },
} satisfies Prisma.StockTakeLineInclude;
type CountLine = Prisma.StockTakeLineGetPayload<{ include: typeof lineInclude }>;

/** A counted line valued at dealer rate: the rate saved at S/E confirmation, else today's. */
function lineRow(l: CountLine) {
  const diff = discrepancy(l) ?? 0;
  const rate = l.dealerRate ?? l.part?.unitPrice ?? 0;
  const system = l.stockAtCount ?? l.systemStock;
  const physical = (l.countedQuantity ?? 0) + l.damagedQuantity;
  return {
    batch: l.stockTake.batchNumber,
    date: (l.countedAt ?? l.stockTake.createdAt).toISOString(),
    type: typeLabel(l.stockTake),
    partNumber: l.part?.partNumber ?? l.partNumber,
    description: l.part?.name ?? "Not in Part Master",
    flag: l.part?.partFlag ?? "",
    bin: l.countedBins ?? l.binLocation ?? "",
    rate,
    systemQuantity: system,
    systemValue: money(system * rate),
    physicalQuantity: physical,
    physicalValue: money(physical * rate),
    damagedQuantity: l.damagedQuantity,
    damagedValue: money(l.damagedQuantity * rate),
    excessQuantity: Math.max(diff, 0),
    excessValue: money(Math.max(diff, 0) * rate),
    shortageQuantity: Math.max(-diff, 0),
    shortageValue: money(Math.max(-diff, 0) * rate),
    remarks: l.remarks ?? "",
    checker: userName(l.sheet?.checker) || (l.stockTake.auditors ?? ""),
    diff,
  };
}

/** The heading each line is listed under, for the grouped options. */
const GROUP_BY: Record<string, (r: ReturnType<typeof lineRow>) => string> = {
  BIN: (r) => r.bin || "No bin",
  CHECKER: (r) => r.checker || "No checker",
  REMARKS: (r) => r.remarks || "No remarks",
  HISTORY: (r) => `${r.partNumber} · ${r.description}`,
};

export async function physicalStockRows(f: ReportFilters, kind: Kind = "COUNT"): Promise<Row[]> {
  switch (f.option) {
    case "SUMMARY":
      return summaryRows(f, kind);
    case "NOT_DEFINED":
      return notDefinedRows(f, kind);
    case "NOT_COUNTED":
      return notCountedRows(f, kind);
  }
  const lines = await prisma.stockTakeLine.findMany({
    where: {
      countedQuantity: { not: null },
      ...partLineWhere(f),
      ...(f.option === "DAMAGE" && { damagedQuantity: { gt: 0 } }),
      ...(f.option === "BIN_LIMIT" && { countedBins: { not: null } }),
      stockTake: takeWhere(f, kind),
    },
    include: lineInclude,
    orderBy:
      f.option === "BIN"
        ? [{ countedBins: "asc" }, { partNumber: "asc" }]
        : f.option === "HISTORY"
          ? [{ partNumber: "asc" }, { countedAt: "asc" }]
          : [{ partNumber: "asc" }],
  });

  const group = GROUP_BY[f.option ?? ""];
  const rows = lines
    .map((l) => {
      const row = lineRow(l);
      return { ...row, recordedBin: l.binLocation ?? "", group: group ? group(row) : null };
    })
    .filter((r) => f.option !== "DISCREPANCY" || r.diff !== 0)
    .filter((r) => f.option !== "BIN_LIMIT" || r.bin.length > BIN_LIMIT)
    .map(({ diff: _diff, ...row }) => ({
      ...row,
      ...(f.option === "BIN_LIMIT" && { binCount: row.bin.split("/").length, binLength: row.bin.length }),
    }));
  // Checker and remarks headings in name order; the parts stay in part order under each.
  if (f.option === "CHECKER" || f.option === "REMARKS") rows.sort((a, b) => a.group!.localeCompare(b.group!));
  return rows;
}

/** One line per count, its counted parts totalled (legacy Summary / Combined Summary). */
async function summaryRows(f: ReportFilters, kind: Kind): Promise<Row[]> {
  const takes = await prisma.stockTake.findMany({
    where: takeWhere(f, kind),
    include: {
      branch: { select: { name: true } },
      confirmedBy: person,
      lines: { where: partLineWhere(f), include: lineInclude },
    },
    orderBy: [{ branch: { name: "asc" } }, { createdAt: "asc" }],
  });
  return takes.map((t) => {
    const counted = t.lines.filter((l) => l.countedQuantity != null).map(lineRow);
    const total = (key: "systemValue" | "physicalValue" | "damagedValue" | "excessValue" | "shortageValue") => sumMoney(counted.map((r) => r[key]));
    return {
      // All branches lists each branch under its own heading.
      group: f.branchId ? null : t.branch.name,
      batch: t.batchNumber,
      date: t.createdAt.toISOString(),
      type: typeLabel(t),
      status: STATUS_LABELS[t.status],
      parts: t.lines.length,
      countedParts: counted.length,
      systemValue: total("systemValue"),
      physicalValue: total("physicalValue"),
      damagedValue: total("damagedValue"),
      excessValue: total("excessValue"),
      shortageValue: total("shortageValue"),
      netValue: money(total("excessValue") - total("shortageValue")),
      auditors: t.auditors ?? "",
      confirmedBy: userName(t.confirmedBy),
      closedAt: (kind === "AUDIT" ? t.completedAt : t.confirmedAt)?.toISOString() ?? null,
    };
  });
}

/** Part numbers counted that are not in Part Master (legacy wrong part, List of Not Defined Parts). */
async function notDefinedRows(f: ReportFilters, kind: Kind): Promise<Row[]> {
  const lines = await prisma.stockTakeLine.findMany({
    where: { partId: null, ...(!f.includeNotRequired && { notRequired: false }), ...(f.onlyRemarks && { remarks: { gt: "" } }), stockTake: takeWhere(f, kind) },
    include: lineInclude,
    orderBy: [{ stockTake: { batchNumber: "asc" } }, { partNumber: "asc" }],
  });
  return lines.map((l) => {
    const r = lineRow(l);
    return {
      batch: r.batch,
      date: r.date,
      partNumber: r.partNumber,
      bin: r.bin,
      physicalQuantity: l.countedQuantity ?? 0,
      damagedQuantity: l.damagedQuantity,
      status: l.notRequired ? "Not required" : "To resolve",
      checker: r.checker,
      remarks: r.remarks,
    };
  });
}

/** Parts in a count not counted yet, and the sheet each is on (legacy List of Batch Parts Not Uploaded). */
async function notCountedRows(f: ReportFilters, kind: Kind): Promise<Row[]> {
  const lines = await prisma.stockTakeLine.findMany({
    where: { countedQuantity: null, partId: { not: null }, part: partWhere(f), stockTake: takeWhere(f, kind) },
    include: { ...lineInclude, sheet: { select: { sheetNumber: true, checker: person } } },
    orderBy: [{ stockTake: { batchNumber: "asc" } }, { partNumber: "asc" }],
  });
  return lines.map((l) => {
    const r = lineRow(l);
    return {
      batch: r.batch,
      partNumber: r.partNumber,
      flag: r.flag,
      description: r.description,
      bin: l.binLocation ?? "",
      rate: r.rate,
      systemQuantity: r.systemQuantity,
      sheet: l.sheet?.sheetNumber ?? "Not on a sheet",
      checker: userName(l.sheet?.checker) || (l.stockTake.auditors ?? ""),
    };
  });
}

/**
 * Stock Taking Log and Stock Audit Log, by when each thing happened: count sheets issued (legacy HHDC
 * downloads) with their upload or cancellation, or counts corrected or added on screen after upload.
 */
export async function stockTakeLogRows(f: ReportFilters, kind: Kind): Promise<Row[]> {
  const stockTake = takeWhere(f, kind, { dated: false, cancelled: true });
  const when = f.search?.trim() ? {} : dateRange(f);
  if (f.option === "CORRECTIONS") {
    const counts = await prisma.stockTakeCount.findMany({
      where: { OR: [{ correction: true }, { sheetId: null }], countedAt: when, line: { stockTake } },
      include: { recordedBy: person, line: { select: { partNumber: true, part: { select: { name: true } }, stockTake: { select: { batchNumber: true } } } } },
      orderBy: { countedAt: "asc" },
    });
    return counts.map((c) => ({
      batch: c.line.stockTake.batchNumber,
      date: c.countedAt.toISOString(),
      partNumber: c.line.partNumber,
      description: c.line.part?.name ?? "Not in Part Master",
      entry: c.correction ? "Correction" : "Added count",
      quantity: c.quantity,
      damagedQuantity: c.damagedQuantity,
      remarks: c.remarks ?? "",
      by: userName(c.recordedBy),
    }));
  }
  const sheets = await prisma.stockTakeSheet.findMany({
    where: { issuedAt: when, stockTake },
    include: { stockTake: { select: { batchNumber: true } }, issuedBy: person, uploadedBy: person, checker: person },
    orderBy: { issuedAt: "asc" },
  });
  return sheets.map((s) => ({
    batch: s.stockTake.batchNumber,
    sheetNumber: s.sheetNumber,
    issuedAt: s.issuedAt.toISOString(),
    issuedBy: userName(s.issuedBy),
    checker: userName(s.checker),
    criteria: s.criteria ?? "",
    parts: s.lineCount,
    countedParts: s.countedCount ?? 0,
    status: s.cancelledAt ? "Cancelled" : s.uploadedAt ? "Uploaded" : "Open",
    closedAt: (s.cancelledAt ?? s.uploadedAt)?.toISOString() ?? null,
    closedBy: userName(s.uploadedBy),
    remarks: s.cancelRemark ?? "",
  }));
}
