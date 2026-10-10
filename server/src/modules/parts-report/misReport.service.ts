/**
 * Rows for the MIS reports (legacy Parts > MIS Reports): stock levels, most consumed parts,
 * model and mileage wise issues, profitability, percent fill, part rate and bin history, and
 * the STN packing list register.
 *
 * Stock on a date and the cost of what went out come from the stock replay in
 * stockReport.service.ts, so they agree with the stock ledger. Rate and bin changes are the
 * history Part Master keeps (inventory/partHistory.ts).
 */
import { CustomerOrderStatus, IndentStatus, PartChangeAction, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { reportEnd } from "../finance/party-report";
import { money } from "../finance/money";
import { dateRange, DEFAULT_MILEAGE_LIMITS, lineValues, partWhere, ReportFilters, Row, statusLabel, userName } from "./partsReport.common";
import { bandOf, Basis, ISSUE_MOVEMENTS } from "./stockReport.logic";
import { Holding, Movement, partColumns, StockReportService } from "./stockReport.service";

const DAY_MS = 86_400_000;
const LAGOS_DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos" });
const partSelect = { select: { id: true, partNumber: true, name: true, unitPrice: true, priceCategoryCode: true } } as const;
const userSelect = { select: { firstName: true, lastName: true } } as const;

/** Movements the profitability statement prices: sales, jobs, STNs and adjustments, and their returns. */
const SOLD_MOVEMENTS = ["ISSUED", "RETURNED", "TRANSFER_OUT", "ADJUSTMENT"];
/** Profitability groups, in the order the statement prints them. */
const SALE_TYPES = ["Counter sale", "FOC", "Workshop job", "PDI job", "STN", "SAN", "Other issue"];
/** Indents still being worked: what is not yet sent may still be. */
const OPEN_INDENT: IndentStatus[] = [IndentStatus.SUBMITTED, IndentStatus.APPROVED, IndentStatus.PICKING, IndentStatus.PICKED, IndentStatus.PARTLY_DISPATCHED];
const ACTION_LABEL: Record<PartChangeAction, string> = { ADDED: "Added", EDITED: "Edited", DELETED: "Deleted" };

type Consumer = "COUNTER_SALE" | "JOB" | "STN";
const CONSUMER_COLUMN: Record<Consumer, string> = { COUNTER_SALE: "counterSale", JOB: "job", STN: "stn" };

type Job = { mileage: number | null; vehicle: { model: string | null; customModel: string | null; catalogModel: { name: string } | null } | null } | null;

const add = (row: Row, key: string, value: number) => {
  row[key] = money(Number(row[key] ?? 0) + value);
};
const byGroupThen = (key: string) => (a: Row, b: Row) => String(a.group ?? "").localeCompare(String(b.group ?? "")) || String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
const mileageBand = (job: Job, limits: number[]) => (job?.mileage == null ? "mileageNone" : `mileage${bandOf(job.mileage, limits)}`);
const modelName = (job: Job) => {
  const v = job?.vehicle;
  return v ? v.catalogModel?.name || v.customModel?.trim() || v.model || "Model not recorded" : "No vehicle";
};

export class MisReportService {
  constructor(private readonly stock: StockReportService) {}

  rows(kind: string, f: ReportFilters): Promise<Row[]> | null {
    switch (kind) {
      case "stock-levels":
        return this.stockLevels(f);
      case "max-consumed":
        return this.maxConsumed(f);
      case "model-mileage-issue":
        return this.modelMileage(f);
      case "profitability":
        return this.profitability(f);
      case "percent-fill":
        return this.percentFill(f);
      case "part-rate-history":
        return this.rateHistory(f);
      case "part-bin-history":
        return this.binHistory(f);
      case "packing-list-register":
        return this.packingLists(f);
      default:
        return null;
    }
  }

  // ── Stock levels ──────────────────────────────────────────────────────────

  /**
   * Minimum / Maximum Level, Items Falling Below Minimum Level and Re-order Calculated vs Entered.
   * Levels are the branch's own where set (stock location), otherwise Part Master's.
   */
  private async stockLevels(f: ReportFilters): Promise<Row[]> {
    const end = reportEnd(f.to);
    const days = f.days ?? 90;
    const since = new Date(end.getTime() - days * DAY_MS);
    const holdings = await this.stock.holdings(f);
    return holdings.flatMap((h): Row[] => {
      let consumed = 0;
      const { closing } = this.stock.walk(h, "DEALER", new Map(), since, end, (m) => {
        if (ISSUE_MOVEMENTS.includes(m.type) || m.type === "RETURNED") consumed -= m.quantity;
      });
      const stock = closing.quantity;
      const min = h.minimumStock || h.part.minLevel || 0;
      const max = h.maximumStock ?? (h.part.maxLevel || null);
      const reorder = h.part.reorderQty || 0;
      const head = { ...(!f.branchId && { group: h.branch }), ...partColumns(h.part) };
      if (f.option === "REORDER") {
        // The re-order quantity is what the period consumed (legacy: three months' consumption).
        const calculated = Math.max(consumed, 0);
        if (!calculated && !reorder) return [];
        return [{ ...head, quantity: stock, monthly: money((calculated / days) * 30), calculated, entered: reorder, difference: reorder - calculated }];
      }
      if (f.option === "BELOW_MIN") {
        if (!min || stock >= min) return [];
        const orderQty = Math.max(max ?? min, min) - stock;
        return [
          {
            ...head,
            bin: h.bin,
            minLevel: min,
            maxLevel: max,
            quantity: stock,
            shortfall: min - stock,
            orderQty,
            rate: h.part.unitPrice,
            value: money(orderQty * h.part.unitPrice),
          },
        ];
      }
      if (!min && !max && !reorder) return [];
      const level = stock < min ? "Below minimum" : max != null && stock > max ? "Above maximum" : "Within levels";
      return [{ ...head, bin: h.bin, minLevel: min || null, maxLevel: max, reorderQty: reorder || null, quantity: stock, level }];
    });
  }

  // ── Consumption ───────────────────────────────────────────────────────────

  /** Stock consumed in the period (issues and STNs, less returns), with the job behind each workshop issue. */
  private async consumption(f: ReportFilters) {
    const txns = await prisma.stockTransaction.findMany({
      where: {
        type: { in: ["ISSUED", "RETURNED", "TRANSFER_OUT"] },
        createdAt: dateRange(f),
        ...(f.branchId && { branchId: f.branchId }),
        part: partWhere(f),
      },
      select: { type: true, quantity: true, referenceId: true, branchId: true, branch: { select: { name: true } }, part: partSelect },
    });
    const refs = [...new Set(txns.filter((t) => t.type !== "TRANSFER_OUT" && t.referenceId).map((t) => t.referenceId!))];
    const issuances = await prisma.partIssuance.findMany({
      where: { id: { in: refs } },
      select: { id: true, jobCard: { select: { mileage: true, vehicle: { select: { model: true, customModel: true, catalogModel: { select: { name: true } } } } } } },
    });
    // Workshop issues and returns reference the issuance; counter sales, the bill or the return.
    const jobs = new Map<string, Job>(issuances.map((i) => [i.id, i.jobCard]));
    return txns.map((t) => {
      const by: Consumer = t.type === "TRANSFER_OUT" ? "STN" : jobs.has(t.referenceId ?? "") ? "JOB" : "COUNTER_SALE";
      return { ...t, by, job: jobs.get(t.referenceId ?? "") ?? null, consumed: -t.quantity };
    });
  }

  /** The top N parts by quantity consumed, per branch, with workshop issues by mileage. */
  private async maxConsumed(f: ReportFilters): Promise<Row[]> {
    const limits = f.mileageLimits ?? DEFAULT_MILEAGE_LIMITS;
    const byPart = new Map<string, Row>();
    for (const t of await this.consumption(f)) {
      if (f.option !== "ALL" && f.option !== t.by) continue;
      const key = `${t.branchId}:${t.part.id}`;
      const row = byPart.get(key) ?? {
        ...(!f.branchId && { group: t.branch.name }),
        rank: 0,
        ...partColumns(t.part),
        counterSale: 0,
        job: 0,
        stn: 0,
        quantity: 0,
        rate: t.part.unitPrice,
        value: 0,
      };
      add(row, CONSUMER_COLUMN[t.by], t.consumed);
      add(row, "quantity", t.consumed);
      add(row, "value", t.consumed * t.part.unitPrice);
      if (t.by === "JOB") add(row, mileageBand(t.job, limits), t.consumed);
      byPart.set(key, row);
    }
    const ranked = [...byPart.values()]
      .filter((r) => Number(r.quantity) > 0)
      .sort((a, b) => String(a.group ?? "").localeCompare(String(b.group ?? "")) || Number(b.quantity) - Number(a.quantity) || String(a.partNumber).localeCompare(String(b.partNumber)));
    const topN = f.topN ?? 10;
    const rows: Row[] = [];
    let rank = 0;
    ranked.forEach((row, i) => {
      rank = i > 0 && ranked[i - 1].group === row.group ? rank + 1 : 1;
      if (rank <= topN) rows.push({ ...row, rank });
    });
    return rows;
  }

  /** Workshop issues less returns, by vehicle model and mileage at the job. */
  private async modelMileage(f: ReportFilters): Promise<Row[]> {
    const limits = f.mileageLimits ?? DEFAULT_MILEAGE_LIMITS;
    const byModelPart = new Map<string, Row>();
    for (const t of await this.consumption(f)) {
      if (t.by !== "JOB") continue;
      const group = f.branchId ? modelName(t.job) : `${t.branch.name} · ${modelName(t.job)}`;
      const key = `${group}:${t.part.id}`;
      const row = byModelPart.get(key) ?? { group, ...partColumns(t.part), quantity: 0 };
      add(row, mileageBand(t.job, limits), t.consumed);
      add(row, "quantity", t.consumed);
      byModelPart.set(key, row);
    }
    return [...byModelPart.values()].filter((r) => Number(r.quantity) !== 0).sort(byGroupThen("partNumber"));
  }

  // ── Profitability ─────────────────────────────────────────────────────────

  /**
   * Sale value against cost for each movement out: counter sales (FOC bills apart), workshop and
   * PDI jobs, STNs (at the STN rate) and stock adjustments (no sale). Cost is FIFO or dealer rate,
   * as on the stock ledger. Returns and additions to stock reverse quantity, sale and cost.
   */
  private async profitability(f: ReportFilters): Promise<Row[]> {
    const basis: Basis = f.option === "DEALER" ? "DEALER" : "FIFO";
    const { gte: start, lt: end } = dateRange(f);
    const holdings = await this.stock.holdings(f);
    const rates = await this.stock.receiptRates(holdings, basis);
    const sold: { h: Holding; m: Movement; cost: number }[] = [];
    for (const h of holdings) {
      this.stock.walk(h, basis, rates, start, end, (m, pieces) => {
        if (SOLD_MOVEMENTS.includes(m.type)) sold.push({ h, m, cost: pieces.reduce((s, p) => money(s + p.value), 0) });
      });
    }
    const [saleOf, categories] = await Promise.all([
      this.sales(sold.map((x) => x.m)),
      f.summary ? prisma.partCategory.findMany({ select: { code: true, description: true } }) : [],
    ]);
    const categoryName = new Map(categories.map((c) => [c.code, c.description]));

    const rows = new Map<string, { branch: string; type: string; row: Row }>();
    for (const { h, m, cost } of sold) {
      const { type, rate } = saleOf(m, h.part.id);
      const sign = m.quantity < 0 ? 1 : -1;
      const category = h.part.priceCategoryCode ?? "";
      const key = `${h.branchId}|${type}|${f.summary ? category : h.part.id}`;
      const entry = rows.get(key) ?? {
        branch: h.branch,
        type,
        row: {
          group: f.branchId ? type : `${h.branch} · ${type}`,
          ...(f.summary ? { category: category || null, categoryName: categoryName.get(category) ?? "No price category" } : partColumns(h.part)),
          quantity: 0,
          sales: 0,
          cost: 0,
        },
      };
      add(entry.row, "quantity", sign * Math.abs(m.quantity));
      add(entry.row, "sales", sign * Math.abs(m.quantity) * rate);
      add(entry.row, "cost", sign * cost);
      rows.set(key, entry);
    }
    return [...rows.values()]
      .sort(
        (a, b) =>
          a.branch.localeCompare(b.branch) ||
          SALE_TYPES.indexOf(a.type) - SALE_TYPES.indexOf(b.type) ||
          String(a.row.partNumber ?? a.row.category ?? "").localeCompare(String(b.row.partNumber ?? b.row.category ?? "")),
      )
      .map(({ row }) => {
        const margin = money(Number(row.sales) - Number(row.cost));
        return { ...row, margin, marginPercent: Number(row.sales) ? money((margin / Number(row.sales)) * 100) : null };
      });
  }

  /** The sale rate behind each movement (net of cash discount, before VAT) and the kind of sale. */
  private async sales(movements: Movement[]): Promise<(m: Movement, partId: string) => { type: string; rate: number }> {
    const ids = (...types: string[]) => [...new Set(movements.filter((m) => types.includes(m.type) && m.referenceId).map((m) => m.referenceId!))];
    const [billLines, returnLines, issuances, stnLines] = await Promise.all([
      prisma.invoiceLine.findMany({
        where: { invoiceId: { in: ids("ISSUED", "RETURNED") }, partId: { not: null } },
        select: { invoiceId: true, partId: true, quantity: true, rate: true, invoice: { select: { partsDiscountPercent: true } } },
      }),
      prisma.counterSaleReturnLine.findMany({
        where: { returnId: { in: ids("RETURNED") } },
        select: { returnId: true, partId: true, quantity: true, rate: true, saleReturn: { select: { counterSale: { select: { invoice: { select: { partsDiscountPercent: true } } } } } } },
      }),
      prisma.partIssuance.findMany({
        where: { id: { in: ids("ISSUED", "RETURNED") } },
        select: { id: true, jobCardLine: { select: { rate: true } }, jobCard: { select: { serviceType: { select: { preDelivery: true } } } } },
      }),
      prisma.stockTransferNoteLine.findMany({ where: { stnId: { in: ids("TRANSFER_OUT") } }, select: { stnId: true, partId: true, unitRate: true } }),
    ]);
    // A bill can carry a part on more than one line: its average net rate. FOC bills are 100% discount.
    const bills = new Map<string, { quantity: number; value: number; foc: boolean }>();
    const take = (doc: string, partId: string, quantity: number, rate: number, discountPercent: number) => {
      const v = lineValues(quantity, rate, discountPercent, 0);
      const bill = bills.get(`${doc}:${partId}`) ?? { quantity: 0, value: 0, foc: discountPercent >= 100 };
      bills.set(`${doc}:${partId}`, { ...bill, quantity: bill.quantity + quantity, value: bill.value + v.gross - v.discount });
    };
    billLines.forEach((l) => take(l.invoiceId, l.partId!, l.quantity, l.rate, l.invoice.partsDiscountPercent));
    returnLines.forEach((l) => take(l.returnId, l.partId, l.quantity, l.rate, l.saleReturn.counterSale.invoice.partsDiscountPercent));
    const jobs = new Map(issuances.map((i) => [i.id, i]));
    const stnRates = new Map(stnLines.map((l) => [`${l.stnId}:${l.partId}`, l.unitRate]));
    return (m, partId) => {
      const ref = m.referenceId ?? "";
      if (m.type === "ADJUSTMENT") return { type: "SAN", rate: 0 };
      if (m.type === "TRANSFER_OUT") return { type: "STN", rate: stnRates.get(`${ref}:${partId}`) ?? 0 };
      const job = jobs.get(ref);
      if (job) return { type: job.jobCard?.serviceType?.preDelivery ? "PDI job" : "Workshop job", rate: job.jobCardLine?.rate ?? 0 };
      const bill = bills.get(`${ref}:${partId}`);
      // Every issue the app posts carries its bill or job; anything else (seeded stock) is not a sale.
      if (!bill) return { type: "Other issue", rate: 0 };
      return { type: bill.foc ? "FOC" : "Counter sale", rate: bill.quantity ? bill.value / bill.quantity : 0 };
    };
  }

  // ── Percent fill ──────────────────────────────────────────────────────────

  /** Ordered against supplied: CPO lines billed and indent lines sent. Open quantities are not counted. */
  private async percentFill(f: ReportFilters): Promise<Row[]> {
    const part = partWhere(f);
    const [cpoLines, indentLines] = await Promise.all([
      f.option === "INDENT"
        ? []
        : prisma.customerOrderLine.findMany({
            where: { part, order: { orderDate: dateRange(f), ...(f.branchId && { branchId: f.branchId }) } },
            select: { orderedQuantity: true, billedQuantity: true, cancelledQuantity: true, part: partSelect, order: { select: { status: true, branch: { select: { name: true } } } } },
          }),
      f.option === "CPO"
        ? []
        : prisma.branchIndentLine.findMany({
            where: { part, indent: { orderDate: dateRange(f), status: { not: IndentStatus.DRAFT }, ...(f.branchId && { sourceBranchId: f.branchId }) } },
            select: { requestedQuantity: true, dispatchedQuantity: true, part: partSelect, indent: { select: { status: true, sourceBranch: { select: { name: true } } } } },
          }),
    ]);
    const lines = [
      ...cpoLines.map((l) => {
        const open = l.order.status === CustomerOrderStatus.OPEN || l.order.status === CustomerOrderStatus.PARTLY_BILLED;
        const pending = open ? l.orderedQuantity - l.billedQuantity - l.cancelledQuantity : 0;
        return { type: "CPO", branch: l.order.branch.name, part: l.part, ordered: l.orderedQuantity, supplied: l.billedQuantity, pending };
      }),
      ...indentLines.map((l) => {
        const pending = OPEN_INDENT.includes(l.indent.status) ? Math.max(l.requestedQuantity - l.dispatchedQuantity, 0) : 0;
        return { type: "Branch indent", branch: l.indent.sourceBranch.name, part: l.part, ordered: l.requestedQuantity, supplied: l.dispatchedQuantity, pending };
      }),
    ];
    const byPart = new Map<string, Row>();
    for (const l of lines) {
      const group = f.branchId ? l.type : `${l.branch} · ${l.type}`;
      const key = `${group}|${l.part.id}`;
      const row = byPart.get(key) ?? { group, ...partColumns(l.part), orders: 0, ordered: 0, supplied: 0, notSupplied: 0, pending: 0 };
      add(row, "orders", 1);
      add(row, "ordered", l.ordered);
      add(row, "supplied", l.supplied);
      add(row, "pending", l.pending);
      add(row, "notSupplied", Math.max(l.ordered - l.supplied - l.pending, 0));
      byPart.set(key, row);
    }
    return [...byPart.values()]
      .map((row) => {
        const closed = Number(row.supplied) + Number(row.notSupplied);
        return { ...row, fill: closed ? money((Number(row.supplied) / closed) * 100) : null };
      })
      .sort(byGroupThen("partNumber"));
  }

  // ── Part history ──────────────────────────────────────────────────────────

  private async rateHistory(f: ReportFilters): Promise<Row[]> {
    const entries = await prisma.partRateHistory.findMany({
      where: {
        changedAt: dateRange(f),
        action: f.option === "DELETED" ? PartChangeAction.DELETED : { not: PartChangeAction.DELETED },
        ...(f.partId && { partId: f.partId }),
        ...(f.partFlag && { partFlag: f.partFlag }),
        ...(f.priceCategory && { priceCategoryCode: f.priceCategory }),
      },
      include: { changedBy: userSelect },
      orderBy: [{ changedAt: "asc" }, { partNumber: "asc" }],
    });
    return entries
      .filter((e) => (f.option === "RETAIL" ? e.oldRetailRate !== e.newRetailRate : f.option === "DEALER" ? e.oldDealerRate !== e.newDealerRate : true))
      .map((e) => ({
        changedAt: e.changedAt.toISOString(),
        partNumber: e.partNumber,
        description: e.description,
        flag: e.partFlag,
        category: e.priceCategoryCode,
        oldDealerRate: e.oldDealerRate,
        newDealerRate: e.newDealerRate,
        oldRetailRate: e.oldRetailRate,
        newRetailRate: e.newRetailRate,
        action: ACTION_LABEL[e.action],
        by: userName(e.changedBy),
      }));
  }

  /** Bin changes at the branch (rack location) and in Part Master, which applies to every branch. */
  private async binHistory(f: ReportFilters): Promise<Row[]> {
    const where: Prisma.PartBinHistoryWhereInput =
      f.option === "PART_MASTER"
        ? { branchId: null }
        : f.option === "BRANCH"
          ? { branchId: f.branchId ?? { not: null } }
          : f.branchId
            ? { OR: [{ branchId: f.branchId }, { branchId: null }] }
            : {};
    const entries = await prisma.partBinHistory.findMany({
      where: { ...where, changedAt: dateRange(f), part: partWhere(f) },
      include: { part: partSelect, branch: { select: { name: true } }, changedBy: userSelect },
      orderBy: { changedAt: "asc" },
    });
    return entries.map((e) => ({
      changedAt: e.changedAt.toISOString(),
      ...partColumns(e.part),
      location: e.branch?.name ?? "Part Master",
      oldBin: e.oldBin,
      newBin: e.newBin,
      by: userName(e.changedBy),
    }));
  }

  // ── Packing lists ─────────────────────────────────────────────────────────

  /** Packing List Cum Gate Pass for STN: each case line, or one line per packing list. */
  private async packingLists(f: ReportFilters): Promise<Row[]> {
    const lists = await prisma.packingList.findMany({
      where: {
        packingDate: dateRange(f),
        ...(f.branchId && { branchId: f.branchId }),
        ...(f.otherBranchId && { stn: { destinationBranchId: f.otherBranchId } }),
      },
      select: {
        packingNumber: true,
        packingDate: true,
        gatePassNumber: true,
        dispatchMode: true,
        courierName: true,
        waybillNumber: true,
        consignmentWeight: true,
        status: true,
        branch: { select: { name: true } },
        stn: { select: { stnNumber: true, destinationBranch: { select: { name: true } } } },
        cases: {
          orderBy: { caseNumber: "asc" },
          select: { caseNumber: true, lines: { select: { quantity: true, stnLine: { select: { unitRate: true, part: { select: { partNumber: true, name: true } } } } } } },
        },
      },
      orderBy: [{ packingDate: "asc" }, { packingNumber: "asc" }],
    });
    type List = (typeof lists)[number];
    // Group heading and its sort key for the arrangement asked for.
    const arrange = (p: List): [string | null, string] => {
      if (f.option === "COURIER") return [p.courierName || "No courier", p.courierName ?? ""];
      if (f.option === "DATE") return [LAGOS_DATE.format(p.packingDate), p.packingDate.toISOString()];
      if (f.option === "NUMBER") return [f.summary ? null : p.packingNumber, p.packingNumber];
      return [p.stn.destinationBranch.name, p.stn.destinationBranch.name];
    };
    const sorted = lists
      .map((p) => ({ p, heading: arrange(p) }))
      .sort((a, b) => a.p.branch.name.localeCompare(b.p.branch.name) || a.heading[1].localeCompare(b.heading[1]));
    return sorted.flatMap(({ p, heading: [name] }): Row[] => {
      const head = {
        ...(name !== null && { group: f.branchId ? name : `${p.branch.name} · ${name}` }),
        packingNumber: p.packingNumber,
        date: p.packingDate.toISOString(),
        gatePass: p.gatePassNumber,
        stnNumber: p.stn.stnNumber,
        toBranch: p.stn.destinationBranch.name,
      };
      const lines = p.cases.flatMap((c) =>
        c.lines.map((l) => ({
          caseNumber: c.caseNumber,
          partNumber: l.stnLine.part.partNumber,
          description: l.stnLine.part.name,
          quantity: l.quantity,
          rate: l.stnLine.unitRate,
          value: money(l.quantity * l.stnLine.unitRate),
        })),
      );
      if (!f.summary) return lines.map((l) => ({ ...head, ...l }));
      return [
        {
          ...head,
          mode: p.dispatchMode ? statusLabel(p.dispatchMode) : null,
          courier: p.courierName,
          waybill: p.waybillNumber,
          cases: p.cases.length,
          quantity: lines.reduce((s, l) => s + l.quantity, 0),
          weight: p.consignmentWeight,
          value: money(lines.reduce((s, l) => s + l.value, 0)),
          status: statusLabel(p.status),
        },
      ];
    });
  }
}
