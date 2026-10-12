/**
 * Physical stock taking reports (legacy Stock Taking Report with S/E values, Partwise, Bin Location
 * wise and Damage Partwise physical stock reports), run through the parts reports screen.
 */
import { StockTakeStatus } from "@prisma/client";
import prisma from "../../prisma/client";
import { money } from "../finance/money";
import { dateRange, partWhere, ReportFilters, Row, userName } from "../parts-report/partsReport.common";
import { discrepancy } from "./stockTake.logic";

export async function physicalStockRows(f: ReportFilters): Promise<Row[]> {
  const lines = await prisma.stockTakeLine.findMany({
    where: {
      partId: { not: null },
      countedQuantity: { not: null },
      ...(f.option === "DAMAGE" && { damagedQuantity: { gt: 0 } }),
      part: partWhere(f),
      stockTake: {
        status: { not: StockTakeStatus.CANCELLED },
        ...(f.branchId && { branchId: f.branchId }),
        // A batch number picks one count whatever its date.
        ...(f.search?.trim() ? { batchNumber: f.search.trim() } : { createdAt: dateRange(f) }),
      },
    },
    include: {
      part: { select: { partNumber: true, name: true, partFlag: true, unitPrice: true } },
      stockTake: { select: { batchNumber: true, createdAt: true } },
      sheet: { select: { checker: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: f.option === "BIN" ? [{ countedBins: "asc" }, { partNumber: "asc" }] : [{ partNumber: "asc" }],
  });

  return lines
    .map((l) => {
      const diff = discrepancy(l) ?? 0;
      const rate = l.dealerRate ?? l.part!.unitPrice;
      const system = l.stockAtCount ?? l.systemStock;
      const physical = l.countedQuantity! + l.damagedQuantity;
      return {
        group: f.option === "BIN" ? (l.countedBins ?? l.binLocation ?? "No bin") : null,
        batch: l.stockTake.batchNumber,
        date: (l.countedAt ?? l.stockTake.createdAt).toISOString(),
        partNumber: l.part!.partNumber,
        description: l.part!.name,
        flag: l.part!.partFlag,
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
        checker: userName(l.sheet?.checker),
        diff,
      };
    })
    .filter((r) => f.option !== "DISCREPANCY" || r.diff !== 0)
    .map(({ diff: _diff, ...row }) => row);
}
