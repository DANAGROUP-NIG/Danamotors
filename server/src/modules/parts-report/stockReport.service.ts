/**
 * Rows for the stock reports (legacy Parts > Stock Reports). Balances, values and ages come from
 * replaying each branch's movements of a part (stockReport.logic.ts), in the order they were posted.
 *
 * Stock on hand that no movement explains (migrated or seeded stock) is taken to have been there
 * before the first movement, at dealer rate. On FIFO, vendor MRNs and SRNs come in at their receipt
 * rate and every other receipt (returns, additions, opening stock) at the dealer rate.
 */
import { CustomerOrderStatus, IndentStatus, PickingListStatus, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { ageBucket, daysOld, reportEnd, reportStart } from "../finance/party-report";
import { money } from "../finance/money";
import { dateRange, partWhere, partyName, ReportFilters, Row } from "./partsReport.common";
import { Basis, DEFAULT_AGE_LIMITS, ISSUE_MOVEMENTS, Piece, STOCK_MOVEMENTS, StockValuation, untrackedOpening } from "./stockReport.logic";

const partSelect = {
  select: {
    id: true,
    partNumber: true,
    name: true,
    uom: true,
    partFlag: true,
    unitPrice: true,
    priceCategoryCode: true,
    binLocation: true,
    minLevel: true,
    maxLevel: true,
    reorderQty: true,
  },
} as const;
const customerSelect = { select: { companyName: true, firstName: true, lastName: true } } as const;

type Part = Prisma.SparePartGetPayload<typeof partSelect>;

export interface Movement {
  id: string;
  type: string;
  quantity: number;
  referenceId: string | null;
  notes: string | null;
  createdAt: Date;
}

/** One branch's stock of one part, with every movement on record (oldest first). */
export interface Holding {
  branchId: string;
  branch: string;
  part: Part;
  quantity: number;
  reserved: number;
  /** The branch's own stock levels (0 / null when not set there). */
  minimumStock: number;
  maximumStock: number | null;
  bin: string;
  binCard: string | null;
  movements: Movement[];
}

interface Doc {
  type: string;
  number: string | null;
  party: string | null;
  invoice: string | null;
  invoiceDate: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  STOCKED: "Opening stock",
  RECEIVED: "MRN",
  TRANSFER_IN: "SRN",
  RETURNED: "Return",
  ADJUSTMENT: "SAN",
  ISSUED: "Issue",
  TRANSFER_OUT: "STN",
};

export const partColumns = (p: Pick<Part, "partNumber" | "name" | "priceCategoryCode">) => ({ partNumber: p.partNumber, description: p.name, category: p.priceCategoryCode });
const sum = (pieces: Piece[]) => pieces.reduce((s, p) => ({ quantity: s.quantity + p.quantity, value: money(s.value + p.value) }), { quantity: 0, value: 0 });
const byBranchThenPart = (a: Holding, b: Holding) => a.branch.localeCompare(b.branch) || a.part.partNumber.localeCompare(b.part.partNumber);

export class StockReportService {
  rows(kind: string, f: ReportFilters): Promise<Row[]> | null {
    switch (kind) {
      case "stock-ledger":
        return this.ledger(f);
      case "stock-summary":
        return this.summary(f);
      case "current-stock":
        return this.currentStock(f);
      case "zero-balance":
        return this.zeroBalance(f);
      case "slow-moving":
        return this.slowMoving(f);
      case "stock-ageing":
        return this.ageing(f);
      case "negative-stock":
        return this.negativeStock(f);
      case "inventory-sales-ratio":
        return this.inventorySales(f);
      case "branch-stock":
        return this.branchStock(f);
      case "bin-location-stock":
        return this.binLocation(f);
      case "parts-blocked":
        return this.partsBlocked(f);
      case "item-unavailability":
        return this.unavailability(f);
      default:
        return null;
    }
  }

  // ── Loading and replaying stock ───────────────────────────────────────────

  /** Part filters; with "include alternates" a part brings its main part and every alternate. */
  private async partFilter(f: ReportFilters): Promise<Prisma.SparePartWhereInput> {
    if (!f.includeAlternates || !f.partId) return partWhere(f);
    const part = await prisma.sparePart.findUnique({ where: { id: f.partId }, select: { mainPartId: true } });
    const main = part?.mainPartId ?? f.partId;
    return { ...partWhere({ ...f, partId: undefined }), OR: [{ id: main }, { mainPartId: main }] };
  }

  async holdings(f: ReportFilters, withMovements = true): Promise<Holding[]> {
    const part = await this.partFilter(f);
    const branch = f.branchId ? { branchId: f.branchId } : {};
    const [stocks, movements] = await Promise.all([
      prisma.inventoryStock.findMany({
        where: { ...branch, part },
        select: {
          branchId: true,
          quantity: true,
          reservedQuantity: true,
          minimumStock: true,
          maximumStock: true,
          rackLocation: true,
          binCard: true,
          branch: { select: { name: true } },
          part: partSelect,
        },
      }),
      withMovements
        ? prisma.stockTransaction.findMany({
            where: { ...branch, part, type: { in: STOCK_MOVEMENTS } },
            select: { id: true, branchId: true, partId: true, type: true, quantity: true, referenceId: true, notes: true, createdAt: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          })
        : [],
    ]);
    const byHolding = new Map<string, Movement[]>();
    for (const m of movements) {
      const key = `${m.branchId}:${m.partId}`;
      byHolding.set(key, [...(byHolding.get(key) ?? []), m]);
    }
    return stocks
      .map((s) => ({
        branchId: s.branchId,
        branch: s.branch.name,
        part: s.part,
        quantity: s.quantity,
        reserved: s.reservedQuantity,
        minimumStock: s.minimumStock,
        maximumStock: s.maximumStock,
        bin: s.rackLocation ?? s.part.binLocation ?? "",
        binCard: s.binCard,
        movements: byHolding.get(`${s.branchId}:${s.part.id}`) ?? [],
      }))
      .sort(byBranchThenPart);
  }

  /** FIFO receipt rates: what each vendor MRN or SRN line cost, by MRN and part. */
  async receiptRates(holdings: Holding[], basis: Basis) {
    if (basis !== "FIFO") return new Map<string, number>();
    const mrnIds = [...new Set(holdings.flatMap((h) => h.movements.filter((m) => (m.type === "RECEIVED" || m.type === "TRANSFER_IN") && m.referenceId).map((m) => m.referenceId!)))];
    const lines = await prisma.materialReceiptLine.findMany({ where: { mrnId: { in: mrnIds } }, select: { mrnId: true, partId: true, unitCost: true } });
    return new Map(lines.map((l) => [`${l.mrnId}:${l.partId}`, l.unitCost]));
  }

  /**
   * Replays a holding up to `end`: the stock at `start` (opening) and at `end` (closing), calling
   * `visit` for each movement from `start` with the stock just after it.
   */
  walk(
    h: Holding,
    basis: Basis,
    rates: Map<string, number>,
    start: Date,
    end: Date,
    visit?: (m: Movement, pieces: Piece[], stock: StockValuation) => void,
  ) {
    const stock = new StockValuation(basis, h.part.unitPrice);
    const untracked = untrackedOpening(h.quantity, h.movements);
    if (untracked > 0) stock.receive(untracked, h.part.unitPrice, null);
    else if (untracked < 0) stock.issue(-untracked);
    let opening: { quantity: number; value: number } | undefined;
    for (const m of h.movements) {
      if (m.createdAt >= end) break;
      if (!opening && m.createdAt >= start) opening = { quantity: stock.quantity, value: stock.value };
      const rate = (m.referenceId ? rates.get(`${m.referenceId}:${h.part.id}`) : undefined) ?? h.part.unitPrice;
      const pieces = stock.apply(m.quantity, rate, m.createdAt);
      if (m.createdAt >= start && m.quantity !== 0) visit?.(m, pieces, stock);
    }
    return { opening: opening ?? { quantity: stock.quantity, value: stock.value }, closing: stock };
  }

  /** Document, party and invoice for each movement, from what it references. */
  private async documents(movements: Movement[]): Promise<(m: Movement) => Doc> {
    const ids = (...types: string[]) => [...new Set(movements.filter((m) => types.includes(m.type) && m.referenceId).map((m) => m.referenceId!))];
    const [mrns, stns, invoices, returns, issuances] = await Promise.all([
      prisma.materialReceiptNote.findMany({
        where: { id: { in: ids("RECEIVED", "TRANSFER_IN") } },
        select: {
          id: true,
          mrnNumber: true,
          vendor: true,
          invoiceNumber: true,
          mit: { select: { invoiceDate: true } },
          sourceBranch: { select: { name: true } },
          stn: { select: { stnNumber: true, documentDate: true } },
        },
      }),
      prisma.stockTransferNote.findMany({ where: { id: { in: ids("TRANSFER_OUT") } }, select: { id: true, stnNumber: true, destinationBranch: { select: { name: true } } } }),
      prisma.invoice.findMany({ where: { id: { in: ids("ISSUED", "RETURNED") } }, select: { id: true, invoiceNumber: true, issuedDate: true, customer: customerSelect } }),
      prisma.counterSaleReturn.findMany({
        where: { id: { in: ids("RETURNED") } },
        select: { id: true, returnNumber: true, customer: customerSelect, counterSale: { select: { invoice: { select: { invoiceNumber: true, issuedDate: true } } } } },
      }),
      prisma.partIssuance.findMany({
        where: { id: { in: ids("ISSUED", "RETURNED") } },
        select: { id: true, jobCard: { select: { jobNumber: true, vehicle: { select: { registrationNumber: true } } } } },
      }),
    ]);
    const index = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
    const [mrn, stn, invoice, saleReturn, issuance] = [index(mrns), index(stns), index(invoices), index(returns), index(issuances)];
    const doc = (type: string, number: string | null, party: string | null, invoiceNo: string | null = null, invoiceDate: Date | null = null): Doc => ({
      type,
      number,
      party,
      invoice: invoiceNo,
      invoiceDate: invoiceDate?.toISOString() ?? null,
    });
    return (m) => {
      const ref = m.referenceId ?? "";
      const r = mrn.get(ref);
      const s = stn.get(ref);
      const i = invoice.get(ref);
      const sr = saleReturn.get(ref);
      const job = issuance.get(ref)?.jobCard;
      if (m.type === "RECEIVED" && r) return doc("MRN", r.mrnNumber, r.vendor, r.invoiceNumber, r.mit?.invoiceDate ?? null);
      if (m.type === "TRANSFER_IN" && r) return doc("SRN", r.mrnNumber, r.sourceBranch?.name ?? null, r.stn?.stnNumber ?? null, r.stn?.documentDate ?? null);
      if (m.type === "TRANSFER_OUT" && s) return doc("STN", s.stnNumber, s.destinationBranch.name);
      if (m.type === "ISSUED" && i) return doc("Counter sale", i.invoiceNumber, partyName(i.customer), i.invoiceNumber, i.issuedDate);
      if (m.type === "RETURNED" && sr) {
        const bill = sr.counterSale.invoice;
        return doc("Sale return", sr.returnNumber, partyName(sr.customer), bill.invoiceNumber, bill.issuedDate);
      }
      if (m.type === "RETURNED" && i) return doc("Bill cancelled", i.invoiceNumber, partyName(i.customer), i.invoiceNumber, i.issuedDate);
      if ((m.type === "ISSUED" || m.type === "RETURNED") && job) {
        return doc(m.type === "ISSUED" ? "Job issue" : "Job return", job.jobNumber, job.vehicle?.registrationNumber ?? null, job.jobNumber);
      }
      return doc(TYPE_LABEL[m.type] ?? m.type, null, m.notes);
    };
  }

  private basis(f: ReportFilters): Basis {
    return f.option === "DEALER" ? "DEALER" : "FIFO";
  }

  // ── Movement reports ──────────────────────────────────────────────────────

  /** Stock Ledger (Revised): opening balance, each movement with the running balance, by part. */
  private async ledger(f: ReportFilters): Promise<Row[]> {
    const basis = this.basis(f);
    const { gte: start, lt: end } = dateRange(f);
    const holdings = (await this.holdings(f)).sort((a, b) => a.part.partNumber.localeCompare(b.part.partNumber) || a.branch.localeCompare(b.branch));
    const inPeriod = (h: Holding) => h.movements.filter((m) => m.createdAt >= start && m.createdAt < end && m.quantity !== 0);
    const [rates, docOf] = await Promise.all([this.receiptRates(holdings, basis), this.documents(holdings.flatMap(inPeriod))]);
    const rows: Row[] = [];
    for (const h of holdings) {
      const moved = inPeriod(h).length > 0;
      const lines: Row[] = [];
      const group = [h.part.partNumber, h.part.name, `UOM ${h.part.uom}`, h.bin && `Bin ${h.bin}`, !f.branchId && h.branch].filter(Boolean).join(" · ");
      const { opening } = this.walk(h, basis, rates, start, end, (m, pieces, stock) => {
        const head = { group, date: m.createdAt.toISOString(), ...docOf(m) };
        if (m.quantity > 0) {
          lines.push({ ...head, rate: pieces[0].rate, receiptQty: m.quantity, receiptValue: pieces[0].value, balanceQty: stock.quantity, balanceValue: stock.value });
          return;
        }
        // An issue taken from receipts at different rates prints one line per rate, as on the legacy ledger.
        const taken = sum(pieces);
        let quantity = stock.quantity + taken.quantity;
        let value = money(stock.value + taken.value);
        pieces.forEach((p, i) => {
          quantity -= p.quantity;
          value = i === pieces.length - 1 ? stock.value : money(value - p.value);
          lines.push({ ...(i === 0 ? head : { group }), rate: p.rate, issueQty: p.quantity, issueValue: p.value, balanceQty: quantity, balanceValue: value });
        });
      });
      if (!moved && (f.onlyTransacted || opening.quantity === 0)) continue;
      rows.push({ group, date: null, type: "Opening balance", balanceQty: opening.quantity, balanceValue: opening.value }, ...lines);
    }
    return rows;
  }

  /** Stock Summary (Revised) and Stock Value: opening, receipts, issues at cost and closing, by part. */
  private async summary(f: ReportFilters): Promise<Row[]> {
    const basis = this.basis(f);
    const { gte: start, lt: end } = dateRange(f);
    const holdings = await this.holdings(f);
    const rates = await this.receiptRates(holdings, basis);
    const rows: Row[] = [];
    for (const h of holdings) {
      const t = { receiptQty: 0, receiptValue: 0, issueQty: 0, issueValue: 0 };
      const moved = h.movements.some((m) => m.createdAt >= start && m.createdAt < end && m.quantity !== 0);
      const { opening, closing } = this.walk(h, basis, rates, start, end, (m, pieces) => {
        const taken = sum(pieces);
        if (m.quantity > 0) {
          t.receiptQty += taken.quantity;
          t.receiptValue = money(t.receiptValue + taken.value);
        } else {
          t.issueQty += taken.quantity;
          t.issueValue = money(t.issueValue + taken.value);
        }
      });
      if (f.onlyTransacted ? !moved : !moved && !opening.quantity && !closing.quantity) continue;
      rows.push({
        ...(!f.branchId && { group: h.branch }),
        partNumber: h.part.partNumber,
        description: h.part.name,
        flag: h.part.partFlag,
        category: h.part.priceCategoryCode,
        unit: h.part.uom,
        bin: h.bin,
        openingQty: opening.quantity,
        openingValue: opening.value,
        ...t,
        closingQty: closing.quantity,
        closingValue: closing.value,
      });
    }
    return rows;
  }

  /** Movements that left the balance below zero. */
  private async negativeStock(f: ReportFilters): Promise<Row[]> {
    const { gte: start, lt: end } = dateRange(f);
    const holdings = await this.holdings(f);
    const hits: { h: Holding; m: Movement; balance: number }[] = [];
    for (const h of holdings) {
      this.walk(h, "DEALER", new Map(), start, end, (m, _pieces, stock) => {
        if (stock.quantity < 0) hits.push({ h, m, balance: stock.quantity });
      });
    }
    const docOf = await this.documents(hits.map((x) => x.m));
    return hits.map(({ h, m, balance }) => {
      const { type, number, party } = docOf(m);
      return {
        ...(!f.branchId && { group: h.branch }),
        date: m.createdAt.toISOString(),
        partNumber: h.part.partNumber,
        description: h.part.name,
        type,
        number,
        party,
        quantity: m.quantity,
        balance,
        rate: h.part.unitPrice,
        value: money(balance * h.part.unitPrice),
      };
    });
  }

  /** Inventory to sales ratio: closing stock value over what was sold (issues less returns) at cost. */
  private async inventorySales(f: ReportFilters): Promise<Row[]> {
    const basis = this.basis(f);
    const { gte: start, lt: end } = dateRange(f);
    const holdings = await this.holdings(f);
    const rates = await this.receiptRates(holdings, basis);
    const rows: Row[] = [];
    for (const h of holdings) {
      let soldQty = 0;
      let sales = 0;
      const { opening, closing } = this.walk(h, basis, rates, start, end, (m, pieces) => {
        if (m.type !== "ISSUED" && m.type !== "RETURNED") return;
        const taken = sum(pieces);
        const sign = m.type === "ISSUED" ? 1 : -1;
        soldQty += sign * taken.quantity;
        sales = money(sales + sign * taken.value);
      });
      if (!opening.quantity && !closing.quantity && !soldQty) continue;
      rows.push({
        ...(!f.branchId && { group: h.branch }),
        partNumber: h.part.partNumber,
        description: h.part.name,
        openingQty: opening.quantity,
        openingValue: opening.value,
        soldQty,
        sales,
        closingQty: closing.quantity,
        closingValue: closing.value,
        ratio: sales > 0 ? money(closing.value / sales) : null,
      });
    }
    return rows;
  }

  // ── Stock on a date ───────────────────────────────────────────────────────

  /** Current Stock Balance (and List of Opening Balances, as on 31 December). */
  private async currentStock(f: ReportFilters): Promise<Row[]> {
    const basis = f.option === "FIFO" ? "FIFO" : "DEALER";
    const end = reportEnd(f.to);
    const holdings = await this.holdings(f);
    const rates = await this.receiptRates(holdings, basis);
    return holdings.flatMap((h) => {
      const { closing } = this.walk(h, basis, rates, end, end);
      if (!closing.quantity) return [];
      return [
        {
          ...(!f.branchId && { group: h.branch }),
          partNumber: h.part.partNumber,
          description: h.part.name,
          flag: h.part.partFlag,
          category: h.part.priceCategoryCode,
          bin: h.bin,
          quantity: closing.quantity,
          rate: money(closing.value / closing.quantity),
          value: closing.value,
        },
      ];
    });
  }

  /** Parts the branch stocks with nothing in stock on the date, and their last 12 months' consumption. */
  private async zeroBalance(f: ReportFilters): Promise<Row[]> {
    const end = reportEnd(f.to);
    const yearBefore = new Date(end);
    yearBefore.setUTCFullYear(yearBefore.getUTCFullYear() - 1);
    const holdings = await this.holdings(f);
    return holdings.flatMap((h) => {
      let consumption = 0;
      const { closing } = this.walk(h, "DEALER", new Map(), yearBefore, end, (m) => {
        if (ISSUE_MOVEMENTS.includes(m.type) || m.type === "RETURNED") consumption -= m.quantity;
      });
      if (closing.quantity !== 0) return [];
      return [{ ...(!f.branchId && { group: h.branch }), ...partColumns(h.part), unit: h.part.uom, bin: h.bin, consumption }];
    });
  }

  /** Parts in stock not issued for `days` days before the date, at dealer rate. */
  private async slowMoving(f: ReportFilters): Promise<Row[]> {
    const days = f.days ?? 90;
    const asOn = reportStart(f.to);
    const end = reportEnd(f.to);
    const holdings = await this.holdings(f);
    return holdings.flatMap((h) => {
      const issues = h.movements.filter((m) => ISSUE_MOVEMENTS.includes(m.type) && m.createdAt < end);
      const lastIssue = issues.length ? issues[issues.length - 1].createdAt : null;
      const { closing } = this.walk(h, "DEALER", new Map(), end, end);
      const idleDays = lastIssue ? daysOld(lastIssue, asOn) : null;
      if (closing.quantity <= 0 || (idleDays !== null && idleDays < days)) return [];
      return [
        {
          ...(!f.branchId && { group: h.branch }),
          ...partColumns(h.part),
          unit: h.part.uom,
          lastIssue: lastIssue?.toISOString() ?? null,
          idleDays,
          quantity: closing.quantity,
          rate: h.part.unitPrice,
          value: closing.value,
        },
      ];
    });
  }

  /** Ageing of Stock: the units in stock on the date by how long ago they were received. */
  private async ageing(f: ReportFilters): Promise<Row[]> {
    const basis = f.option === "FIFO" ? "FIFO" : "DEALER";
    const limits = f.ageLimits ?? DEFAULT_AGE_LIMITS;
    const asOn = reportStart(f.to);
    const end = reportEnd(f.to);
    const holdings = await this.holdings(f);
    const rates = await this.receiptRates(holdings, basis);
    return holdings.flatMap((h) => {
      const { closing } = this.walk(h, basis, rates, end, end);
      if (closing.quantity <= 0) return [];
      const row: Row = { ...(!f.branchId && { group: h.branch }), ...partColumns(h.part), quantity: closing.quantity, value: closing.value };
      for (const layer of closing.stock) {
        // Stock with no receipt on record is the oldest.
        const band = layer.date ? ageBucket(daysOld(layer.date, asOn), limits) : limits.length;
        row[`age${band}Qty`] = Number(row[`age${band}Qty`] ?? 0) + layer.quantity;
        row[`age${band}Value`] = money(Number(row[`age${band}Value`] ?? 0) + layer.quantity * layer.rate);
      }
      return [row];
    });
  }

  // ── Current stock ─────────────────────────────────────────────────────────

  /** Branch Wise Stock and Store Location Wise Current Stock: every branch, at dealer rate. */
  private async branchStock(f: ReportFilters): Promise<Row[]> {
    const holdings = (await this.holdings({ ...f, branchId: undefined }, false))
      .filter((h) => h.quantity !== 0 || h.reserved !== 0)
      .sort((a, b) => a.part.partNumber.localeCompare(b.part.partNumber) || a.branch.localeCompare(b.branch));
    const line = (h: Holding) => ({
      quantity: h.quantity,
      blocked: h.reserved,
      available: h.quantity - h.reserved,
      rate: h.part.unitPrice,
      value: money(h.quantity * h.part.unitPrice),
    });
    if (f.option !== "TOTAL") {
      return holdings.map((h) => ({ group: `${h.part.partNumber} · ${h.part.name}`, branch: h.branch, bin: h.bin, ...line(h) }));
    }
    const byPart = new Map<string, Row>();
    for (const h of holdings) {
      const row = byPart.get(h.part.id) ?? { ...partColumns(h.part), branches: 0, quantity: 0, blocked: 0, available: 0, rate: h.part.unitPrice, value: 0 };
      const l = line(h);
      row.branches = Number(row.branches) + (h.quantity !== 0 ? 1 : 0);
      for (const key of ["quantity", "blocked", "available"] as const) row[key] = Number(row[key]) + l[key];
      row.value = money(Number(row.value) + l.value);
      byPart.set(h.part.id, row);
    }
    return [...byPart.values()];
  }

  private async binLocation(f: ReportFilters): Promise<Row[]> {
    const bin = f.search?.toUpperCase();
    const holdings = await this.holdings(f, false);
    return holdings
      .filter((h) => (h.quantity !== 0 || h.bin) && (!bin || h.bin.toUpperCase().includes(bin)))
      .sort((a, b) => a.branch.localeCompare(b.branch) || a.bin.localeCompare(b.bin) || a.part.partNumber.localeCompare(b.part.partNumber))
      .map((h) => ({ ...(!f.branchId && { group: h.branch }), bin: h.bin, ...partColumns(h.part), binCard: h.binCard, quantity: h.quantity }));
  }

  /** Stock the branch holds, and what is reserved, for the given branch and parts. */
  private async stockOf(keys: { branchId: string; partId: string }[]) {
    if (!keys.length) return new Map<string, { quantity: number; reservedQuantity: number }>();
    const stocks = await prisma.inventoryStock.findMany({
      where: { OR: keys },
      select: { branchId: true, partId: true, quantity: true, reservedQuantity: true },
    });
    return new Map(stocks.map((s) => [`${s.branchId}:${s.partId}`, s]));
  }

  /** Stock picked for CPOs (reserved until billed) or for indents (until the STN is made). */
  private async partsBlocked(f: ReportFilters): Promise<Row[]> {
    const part = partWhere(f);
    const [cpoLines, pickLines] = await Promise.all([
      prisma.customerOrderLine.findMany({
        where: {
          pickedQuantity: { gt: 0 },
          part,
          order: { orderDate: dateRange(f), status: { in: [CustomerOrderStatus.OPEN, CustomerOrderStatus.PARTLY_BILLED] }, ...(f.branchId && { branchId: f.branchId }) },
        },
        select: {
          pickedQuantity: true,
          part: partSelect,
          order: { select: { cpoNumber: true, orderDate: true, branchId: true, branch: { select: { name: true } }, customer: customerSelect } },
        },
      }),
      prisma.pickingListLine.findMany({
        where: { pickedQuantity: { gt: 0 }, part, pickingList: { status: PickingListStatus.OPEN, createdAt: dateRange(f), ...(f.branchId && { branchId: f.branchId }) } },
        select: {
          pickedQuantity: true,
          part: partSelect,
          pickingList: {
            select: {
              pickingNumber: true,
              createdAt: true,
              pickerName: true,
              branchId: true,
              branch: { select: { name: true } },
              indent: { select: { requestingBranch: { select: { name: true } } } },
            },
          },
        },
      }),
    ]);
    const blocks = [
      ...cpoLines.map((l) => ({
        branchId: l.order.branchId,
        branch: l.order.branch.name,
        part: l.part,
        type: "CPO",
        document: l.order.cpoNumber,
        date: l.order.orderDate,
        party: partyName(l.order.customer),
        picker: null as string | null,
        quantity: l.pickedQuantity,
      })),
      ...pickLines.map((l) => ({
        branchId: l.pickingList.branchId,
        branch: l.pickingList.branch.name,
        part: l.part,
        type: "Branch indent",
        document: l.pickingList.pickingNumber,
        date: l.pickingList.createdAt,
        party: l.pickingList.indent.requestingBranch.name,
        picker: l.pickingList.pickerName,
        quantity: l.pickedQuantity,
      })),
    ].sort((a, b) => a.branch.localeCompare(b.branch) || a.part.partNumber.localeCompare(b.part.partNumber) || a.date.getTime() - b.date.getTime());
    const group = (b: { branch: string }): Row => (!f.branchId ? { group: b.branch } : {});
    if (f.option !== "SUMMARY") {
      return blocks.map((b) => ({ ...group(b), partNumber: b.part.partNumber, description: b.part.name, type: b.type, document: b.document, date: b.date.toISOString(), party: b.party, picker: b.picker, quantity: b.quantity }));
    }
    const stock = await this.stockOf(blocks.map((b) => ({ branchId: b.branchId, partId: b.part.id })));
    const byPart = new Map<string, Row>();
    for (const b of blocks) {
      const key = `${b.branchId}:${b.part.id}`;
      const onHand = stock.get(key)?.quantity ?? 0;
      const row = byPart.get(key) ?? { ...group(b), ...partColumns(b.part), stock: onHand, cpo: 0, indent: 0, blocked: 0, available: onHand };
      row[b.type === "CPO" ? "cpo" : "indent"] = Number(row[b.type === "CPO" ? "cpo" : "indent"]) + b.quantity;
      row.blocked = Number(row.blocked) + b.quantity;
      row.available = onHand - Number(row.blocked);
      byPart.set(key, row);
    }
    return [...byPart.values()];
  }

  /** Demand raised in the period that the branch could not supply. */
  private async unavailability(f: ReportFilters): Promise<Row[]> {
    const part = partWhere(f);
    const [cpoLines, indentLines] = await Promise.all([
      prisma.customerOrderLine.findMany({
        where: {
          part,
          order: { orderDate: dateRange(f), status: { in: [CustomerOrderStatus.OPEN, CustomerOrderStatus.PARTLY_BILLED] }, ...(f.branchId && { branchId: f.branchId }) },
        },
        select: {
          orderedQuantity: true,
          pickedQuantity: true,
          billedQuantity: true,
          cancelledQuantity: true,
          part: partSelect,
          order: { select: { branchId: true, branch: { select: { name: true } } } },
        },
      }),
      prisma.branchIndentLine.findMany({
        where: {
          backOrderQuantity: { gt: 0 },
          part,
          indent: {
            orderDate: dateRange(f),
            status: { notIn: [IndentStatus.DRAFT, IndentStatus.CANCELLED, IndentStatus.REJECTED] },
            ...(f.branchId && { sourceBranchId: f.branchId }),
          },
        },
        select: { backOrderQuantity: true, part: partSelect, indent: { select: { sourceBranchId: true, sourceBranch: { select: { name: true } } } } },
      }),
    ]);
    const demand = [
      ...cpoLines.map((l) => ({
        branchId: l.order.branchId,
        branch: l.order.branch.name,
        part: l.part,
        cpo: l.orderedQuantity - l.billedQuantity - l.cancelledQuantity - l.pickedQuantity,
        backOrder: 0,
      })),
      ...indentLines.map((l) => ({ branchId: l.indent.sourceBranchId, branch: l.indent.sourceBranch.name, part: l.part, cpo: 0, backOrder: l.backOrderQuantity })),
    ]
      .filter((d) => d.cpo + d.backOrder > 0)
      .sort((a, b) => a.branch.localeCompare(b.branch) || a.part.partNumber.localeCompare(b.part.partNumber));
    const stock = await this.stockOf(demand.map((d) => ({ branchId: d.branchId, partId: d.part.id })));
    const byPart = new Map<string, Row>();
    for (const d of demand) {
      const key = `${d.branchId}:${d.part.id}`;
      const s = stock.get(key);
      const row = byPart.get(key) ?? {
        ...(!f.branchId && { group: d.branch }),
        ...partColumns(d.part),
        cpo: 0,
        backOrder: 0,
        quantity: 0,
        free: s ? s.quantity - s.reservedQuantity : 0,
        rate: d.part.unitPrice,
        value: 0,
      };
      row.cpo = Number(row.cpo) + d.cpo;
      row.backOrder = Number(row.backOrder) + d.backOrder;
      row.quantity = Number(row.cpo) + Number(row.backOrder);
      row.value = money(Number(row.quantity) * d.part.unitPrice);
      byPart.set(key, row);
    }
    return [...byPart.values()];
  }
}
