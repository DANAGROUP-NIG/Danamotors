/**
 * Builds the rows for every parts report (see partsReport.definitions.ts).
 *
 * Dates are calendar days in Africa/Lagos. Counter-sale lines are priced with the same
 * rules as the bill (cash discount, then VAT on taxable lines), so line values agree
 * with the bills; only the bill-level round-off is reported separately. The stock reports
 * (ledger, summary, balances, ageing…) are built in stockReport.service.ts, and the MIS
 * reports in misReport.service.ts.
 */
import { ChargeType, IndentStatus, MitStatus, MrnSource, Prisma, StnStatus } from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, NotFoundError } from "../../shared/errors/appError";
import { money, sumMoney } from "../finance/money";
import { columnsFor, reportByKind, ReportColumn, ReportDefinition } from "./partsReport.definitions";
import { dateRange, lineValues, partWhere, partyName, ReportFilters, Row, statusLabel, userName } from "./partsReport.common";
import { MisReportService } from "./misReport.service";
import { StockReportService } from "./stockReport.service";
import { STOCK_MOVEMENTS } from "./stockReport.logic";
import { physicalStockRows, stockTakeLogRows } from "../stock-take/stockTake.report";

export type { ReportFilters };

export interface ReportResult {
  kind: string;
  title: string;
  columns: ReportColumn[];
  rows: Row[];
  totals: Record<string, number>;
  grouped: boolean;
  truncated: boolean;
}

const MAX_ROWS = 5000;
const LAGOS_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" });

const customerSelect = {
  select: { id: true, code: true, companyName: true, firstName: true, lastName: true, house: true, street: true, address: true, city: true, state: true },
} as const;
const partSelect = {
  select: { id: true, partNumber: true, name: true, uom: true, partFlag: true, binLocation: true, unitPrice: true, retailRate: true, priceCategoryCode: true, priceCategory: { select: { description: true } } },
} as const;

/** Consumption Report issue columns (legacy order): workshop issues by job type and who pays the line, then the other issues. */
const CONSUMPTION_COLUMNS = ["pdi", "job", "foc", "goodwill", "pdiWarranty", "warranty", "counterSale", "consumable", "samples", "stn"];
const CHARGE_COLUMN: Record<ChargeType, string> = { CUSTOMER: "job", WARRANTY: "warranty", GOODWILL: "goodwill", FREE: "foc" };
/** Legacy prints an amount beside these issue columns; the others count only in the total amount. */
const CONSUMPTION_AMOUNTS: Record<string, string> = { job: "jobAmount", counterSale: "counterSaleAmount" };
/** Legacy part flag F: samples, issued at no value. */
const SAMPLE_FLAG = "F";

/** A document's heading line, as legacy prints it: "number · dd/mm/yyyy · store". */
const documentHeading = (number: string, date: Date, store: string) =>
  `${number} · ${LAGOS_DAY.format(date).split("-").reverse().join("/")} · ${store}`;

/** The last line of each group: a running balance's closing value. */
const closingLines = (rows: Row[]) => rows.filter((r, i) => i === rows.length - 1 || rows[i + 1].group !== r.group);

export class PartsReportService {
  private stock = new StockReportService();
  private mis = new MisReportService(this.stock);

  async run(kind: string, filters: ReportFilters): Promise<ReportResult> {
    const definition = reportByKind.get(kind);
    if (!definition) throw new NotFoundError("Report not found");
    if (!filters.from || !filters.to || filters.from > filters.to) throw new BadRequestError("Choose a valid date range");
    const option = filters.option || definition.options?.[0]?.value;
    const rows = await this.rows(definition, { ...filters, option });
    const columns = columnsFor(definition, { ...filters, option });
    const totals: Record<string, number> = {};
    for (const column of columns.filter((c) => c.total)) {
      const counted = column.total === "last" ? closingLines(rows) : rows.filter((r) => r.status !== "Cancelled");
      totals[column.key] = sumMoney(counted.map((r) => Number(r[column.key] ?? 0)));
    }
    for (const { key, ratio } of columns.filter((c) => c.ratio)) {
      const over = sumMoney(ratio!.over.map((k) => totals[k] ?? 0));
      totals[key] = over ? money(((totals[ratio!.of] ?? 0) / over) * 100) : 0;
    }
    if (kind === "inventory-sales-ratio") {
      totals.ratio = totals.sales > 0 ? money(totals.closingValue / totals.sales) : 0;
    }
    return {
      kind,
      title: definition.title,
      columns,
      rows: rows.slice(0, MAX_ROWS),
      totals,
      grouped: !!definition.grouped && rows.some((r) => r.group != null),
      truncated: rows.length > MAX_ROWS,
    };
  }

  private rows(definition: ReportDefinition, f: ReportFilters): Promise<Row[]> {
    const stockRows = this.stock.rows(definition.kind, f) ?? this.mis.rows(definition.kind, f);
    if (stockRows) return stockRows;
    switch (definition.kind) {
      case "counter-sales":
        return this.counterSalesLines(f);
      case "counter-sales-summary":
        return this.counterSalesSummary(f);
      case "counter-sales-tax-datewise":
        return this.taxDatewise(f);
      case "counter-sales-tax-annexure":
        return this.taxAnnexure(f);
      case "counter-sales-returns":
        return this.returns(f);
      case "counter-sales-cancellations":
        return this.cancellations(f);
      case "counter-sales-revenue":
        return this.revenue(f);
      case "sales-executive-register":
        return this.executiveRegister(f);
      case "cpo-register":
        return this.cpoRegister(f);
      case "mrn-register":
        return this.mrnRegister(f);
      case "mit-register":
        return this.mitRegister(f);
      case "receipt-checklist":
        return this.receiptChecklist(f);
      case "receipt-shortage":
        return this.receiptShortage(f);
      case "picking-register":
        return this.pickingRegister(f);
      case "stn-register":
        return f.option === "SRN" ? this.srnRegister(f) : this.stnRegister(f, false);
      case "store-wise-stn":
        return this.stnRegister(f, true);
      case "indent-inward-register":
        return this.indentRegister(f, false);
      case "indent-outward-register":
        return this.indentRegister(f, true);
      case "branch-in-transit":
        return this.branchInTransit(f);
      case "consumption":
        return this.consumption(f);
      case "issue-checklist":
        return this.issueChecklist(f);
      case "stock-adjustments":
        return this.adjustments(f);
      case "physical-stock":
        return physicalStockRows(f);
      case "stock-audit":
        return physicalStockRows(f, "AUDIT");
      case "stock-take-log":
        return stockTakeLogRows(f, "COUNT");
      case "stock-audit-log":
        return stockTakeLogRows(f, "AUDIT");
      default:
        throw new NotFoundError("Report not found");
    }
  }

  // ── Counter sales ─────────────────────────────────────────────────────────

  private saleInvoiceWhere(f: ReportFilters, cancelled = false): Prisma.InvoiceWhereInput {
    return {
      counterSale: { is: { ...(f.branchId && { branchId: f.branchId }), ...(f.executiveId && { salesExecutiveId: f.executiveId }) } },
      issuedDate: dateRange(f),
      ...(f.customerId && { customerId: f.customerId }),
      ...(cancelled ? {} : { cancelledAt: null }),
    };
  }

  private async counterSalesLines(f: ReportFilters): Promise<Row[]> {
    const lines = await prisma.invoiceLine.findMany({
      where: { invoice: this.saleInvoiceWhere(f), part: partWhere(f) },
      include: {
        part: partSelect,
        invoice: { select: { invoiceNumber: true, issuedDate: true, partsDiscountPercent: true, customer: customerSelect } },
        customerOrderLine: { select: { order: { select: { cpoNumber: true } } } },
      },
      orderBy: [{ invoice: { issuedDate: "asc" } }, { invoice: { invoiceNumber: "asc" } }, { part: { partNumber: "asc" } }],
    });
    return lines.map((l) => ({
      billNumber: l.invoice.invoiceNumber,
      date: l.invoice.issuedDate.toISOString(),
      customerCode: l.invoice.customer.code,
      customer: partyName(l.invoice.customer),
      cpoNumber: l.customerOrderLine?.order.cpoNumber ?? null,
      partNumber: l.part?.partNumber ?? "",
      description: l.description,
      quantity: l.quantity,
      rate: l.rate,
      ...lineValues(l.quantity, l.rate, l.invoice.partsDiscountPercent, l.vatPercent),
    }));
  }

  private async saleInvoices(f: ReportFilters, cancelled = false) {
    return prisma.invoice.findMany({
      where: this.saleInvoiceWhere(f, cancelled),
      include: {
        customer: customerSelect,
        cancelledBy: { select: { firstName: true, lastName: true } },
        counterSale: { select: { salesExecutive: { select: { id: true, firstName: true, lastName: true } } } },
        lines: { select: { quantity: true, rate: true, vatPercent: true } },
      },
      orderBy: [{ issuedDate: "asc" }, { invoiceNumber: "asc" }],
    });
  }

  /** Splits a bill into taxable and exempt value after the cash discount. */
  private taxSplit(invoice: { partsDiscountPercent: number; lines: { quantity: number; rate: number; vatPercent: number | null }[] }) {
    let taxable = 0;
    let exempt = 0;
    for (const line of invoice.lines) {
      const v = lineValues(line.quantity, line.rate, invoice.partsDiscountPercent, line.vatPercent);
      if ((line.vatPercent ?? 0) > 0) taxable += v.gross - v.discount;
      else exempt += v.gross - v.discount;
    }
    return { taxable: money(taxable), exempt: money(exempt) };
  }

  private async counterSalesSummary(f: ReportFilters): Promise<Row[]> {
    const invoices = await this.saleInvoices(f);
    return invoices.map((i) => ({
      billNumber: i.invoiceNumber,
      date: i.issuedDate.toISOString(),
      customer: partyName(i.customer),
      lines: i.lines.length,
      quantity: i.lines.reduce((s, l) => s + l.quantity, 0),
      gross: i.partsTotal,
      discount: i.partsDiscountAmount,
      vat: i.vatAmount,
      roundOff: i.roundOff,
      net: i.total,
      outstanding: i.outstandingAmount,
      status: i.status,
    }));
  }

  private async taxDatewise(f: ReportFilters): Promise<Row[]> {
    const invoices = await this.saleInvoices(f);
    const days = new Map<string, Row>();
    for (const i of invoices) {
      const day = LAGOS_DAY.format(i.issuedDate);
      const row = days.get(day) ?? { date: `${day}T12:00:00+01:00`, bills: 0, gross: 0, discount: 0, taxable: 0, exempt: 0, vat: 0, roundOff: 0, net: 0 };
      const split = this.taxSplit(i);
      row.bills = Number(row.bills) + 1;
      for (const [key, value] of Object.entries({
        gross: i.partsTotal,
        discount: i.partsDiscountAmount,
        taxable: split.taxable,
        exempt: split.exempt,
        vat: i.vatAmount,
        roundOff: i.roundOff,
        net: i.total,
      })) {
        row[key] = money(Number(row[key]) + value);
      }
      days.set(day, row);
    }
    return [...days.values()];
  }

  private async taxAnnexure(f: ReportFilters): Promise<Row[]> {
    const invoices = await this.saleInvoices(f, f.includeCancelled);
    return invoices.map((i) => ({
      billNumber: i.invoiceNumber,
      date: i.issuedDate.toISOString(),
      customerCode: i.customer.code,
      customer: partyName(i.customer),
      address: [i.customer.house, i.customer.street, i.customer.address, i.customer.city, i.customer.state].filter(Boolean).join(", "),
      ...this.taxSplit(i),
      vat: i.vatAmount,
      net: i.total,
      status: i.cancelledAt ? "Cancelled" : i.status,
    }));
  }

  private async returns(f: ReportFilters): Promise<Row[]> {
    const lines = await prisma.counterSaleReturnLine.findMany({
      where: {
        part: partWhere(f),
        saleReturn: {
          returnDate: dateRange(f),
          ...(f.branchId && { branchId: f.branchId }),
          ...(f.customerId && { customerId: f.customerId }),
        },
      },
      include: {
        part: partSelect,
        invoiceLine: { select: { vatPercent: true, description: true } },
        saleReturn: {
          select: {
            returnNumber: true,
            returnDate: true,
            customer: customerSelect,
            creditNote: { select: { number: true } },
            counterSale: { select: { invoice: { select: { invoiceNumber: true, partsDiscountPercent: true } } } },
          },
        },
      },
      orderBy: [{ saleReturn: { returnDate: "asc" } }, { saleReturn: { returnNumber: "asc" } }],
    });
    return lines.map((l) => ({
      returnNumber: l.saleReturn.returnNumber,
      date: l.saleReturn.returnDate.toISOString(),
      billNumber: l.saleReturn.counterSale.invoice.invoiceNumber,
      customer: partyName(l.saleReturn.customer),
      partNumber: l.part.partNumber,
      description: l.invoiceLine.description,
      quantity: l.quantity,
      rate: l.rate,
      ...lineValues(l.quantity, l.rate, l.saleReturn.counterSale.invoice.partsDiscountPercent, l.invoiceLine.vatPercent),
      creditNote: l.saleReturn.creditNote?.number ?? null,
    }));
  }

  private async cancellations(f: ReportFilters): Promise<Row[]> {
    const invoices = await prisma.invoice.findMany({
      where: { ...this.saleInvoiceWhere(f, true), cancelledAt: { not: null } },
      include: { customer: customerSelect, cancelledBy: { select: { firstName: true, lastName: true } } },
      orderBy: [{ issuedDate: "asc" }, { invoiceNumber: "asc" }],
    });
    return invoices
      .map((i) => ({ i, foc: i.partsDiscountPercent >= 100 }))
      .filter(({ foc }) => f.option === "ALL" || (f.option === "FOC" ? foc : !foc))
      .map(({ i, foc }) => ({
        billNumber: i.invoiceNumber,
        date: i.issuedDate.toISOString(),
        customer: partyName(i.customer),
        type: foc ? "FOC" : "Counter sale",
        gross: i.partsTotal,
        net: i.total,
        cancelledOn: i.cancelledAt!.toISOString(),
        cancelledBy: userName(i.cancelledBy),
        remark: i.cancelRemark,
      }));
  }

  /** Sales less returns by price category (and customer), against the dealer cost recorded at billing. */
  private async revenue(f: ReportFilters): Promise<Row[]> {
    const [lines, returned] = await Promise.all([
      prisma.invoiceLine.findMany({
        where: { invoice: this.saleInvoiceWhere(f), partId: { not: null } },
        include: { part: partSelect, invoice: { select: { partsDiscountPercent: true, customer: customerSelect } } },
      }),
      prisma.counterSaleReturnLine.findMany({
        where: { saleReturn: { returnDate: dateRange(f), ...(f.branchId && { branchId: f.branchId }) } },
        include: {
          part: partSelect,
          invoiceLine: { select: { unitCost: true } },
          saleReturn: { select: { customer: customerSelect, counterSale: { select: { invoice: { select: { partsDiscountPercent: true } } } } } },
        },
      }),
    ]);
    const byCustomer = f.option === "CUSTOMER";
    const buckets = new Map<string, Row>();
    const bucket = (customer: { id: string; code: string | null; companyName: string | null; firstName: string; lastName: string }, part: (typeof lines)[number]["part"]) => {
      const category = part?.priceCategoryCode ?? "—";
      const key = `${byCustomer ? customer.id : ""}|${category}`;
      let row = buckets.get(key);
      if (!row) {
        row = {
          ...(byCustomer && { group: [customer.code, partyName(customer)].filter(Boolean).join(" · ") }),
          category,
          categoryName: part?.priceCategory?.description ?? "No price category",
          quantity: 0,
          sales: 0,
          returns: 0,
          netSales: 0,
          cost: 0,
          margin: 0,
          marginPercent: 0,
        };
        buckets.set(key, row);
      }
      return row;
    };
    for (const l of lines) {
      const row = bucket(l.invoice.customer, l.part);
      const v = lineValues(l.quantity, l.rate, l.invoice.partsDiscountPercent, 0);
      row.quantity = Number(row.quantity) + l.quantity;
      row.sales = money(Number(row.sales) + v.gross - v.discount);
      row.cost = money(Number(row.cost) + l.quantity * (l.unitCost ?? l.part?.unitPrice ?? 0));
    }
    for (const r of returned) {
      const row = bucket(r.saleReturn.customer, r.part);
      const v = lineValues(r.quantity, r.rate, r.saleReturn.counterSale.invoice.partsDiscountPercent, 0);
      row.quantity = Number(row.quantity) - r.quantity;
      row.returns = money(Number(row.returns) + v.gross - v.discount);
      row.cost = money(Number(row.cost) - r.quantity * (r.invoiceLine.unitCost ?? r.part.unitPrice));
    }
    const rows = [...buckets.values()].map((row): Row => {
      const netSales = money(Number(row.sales) - Number(row.returns));
      const margin = money(netSales - Number(row.cost));
      return { ...row, netSales, margin, marginPercent: netSales ? money((margin / netSales) * 100) : 0 };
    });
    return rows.sort((a, b) => String(a.group ?? "").localeCompare(String(b.group ?? "")) || String(a.category).localeCompare(String(b.category)));
  }

  private async executiveRegister(f: ReportFilters): Promise<Row[]> {
    const invoices = await this.saleInvoices(f);
    return invoices
      .map((i) => ({
        group: userName(i.counterSale?.salesExecutive) || "No sales executive",
        billNumber: i.invoiceNumber,
        date: i.issuedDate.toISOString(),
        customer: partyName(i.customer),
        gross: i.partsTotal,
        discount: i.partsDiscountAmount,
        vat: i.vatAmount,
        net: i.total,
      }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }

  // ── Customer orders ───────────────────────────────────────────────────────

  private async cpoRegister(f: ReportFilters): Promise<Row[]> {
    const lines = await prisma.customerOrderLine.findMany({
      where: {
        part: partWhere(f),
        order: {
          orderDate: dateRange(f),
          ...(f.branchId && { branchId: f.branchId }),
          ...(f.customerId && { customerId: f.customerId }),
          ...(f.search && { cpoNumber: { contains: f.search } }),
        },
      },
      include: { part: partSelect, order: { select: { cpoNumber: true, orderDate: true, status: true, customerRefNo: true, customer: customerSelect } } },
      orderBy: [{ order: { orderDate: "asc" } }, { order: { cpoNumber: "asc" } }, { part: { partNumber: "asc" } }],
    });
    return lines
      .map((l) => ({ l, pending: l.orderedQuantity - l.billedQuantity - l.cancelledQuantity }))
      .filter(({ l, pending }) => {
        const active = l.order.status === "OPEN" || l.order.status === "PARTLY_BILLED";
        if (f.status === "PENDING") return active && pending > 0;
        if (f.status === "CANCELLED") return l.order.status === "CANCELLED" || l.cancelledQuantity > 0;
        if (f.status === "EXECUTED") return f.fullyExecuted ? l.billedQuantity === l.orderedQuantity : l.billedQuantity > 0;
        return true;
      })
      .map(({ l, pending }) => ({
        cpoNumber: l.order.cpoNumber,
        date: l.order.orderDate.toISOString(),
        customer: partyName(l.order.customer),
        reference: l.order.customerRefNo,
        partNumber: l.part.partNumber,
        description: l.part.name,
        ordered: l.orderedQuantity,
        picked: l.pickedQuantity,
        billed: l.billedQuantity,
        cancelled: l.cancelledQuantity,
        pending,
        rate: l.retailRate,
        value: l.amount,
        status: statusLabel(l.order.status),
      }));
  }

  // ── Purchase ──────────────────────────────────────────────────────────────

  /** Vendor (Mobis) MRN lines; branch-transfer MRNs are on the SRN register. */
  private async mrnRegister(f: ReportFilters): Promise<Row[]> {
    const lines = await prisma.materialReceiptLine.findMany({
      where: {
        part: partWhere(f),
        mrn: {
          source: { not: MrnSource.BRANCH_TRANSFER },
          receiptDate: dateRange(f),
          ...(f.branchId && { receivingBranchId: f.branchId }),
          ...(f.vendor && { vendor: f.vendor }),
          ...(f.search && { mrnNumber: { contains: f.search } }),
        },
      },
      include: {
        part: partSelect,
        mrn: { select: { id: true, mrnNumber: true, receiptDate: true, vendor: true, invoiceNumber: true, mit: { select: { mitNumber: true, invoiceDate: true } } } },
      },
      orderBy: [{ mrn: { vendor: "asc" } }, { mrn: { receiptDate: "asc" } }, { mrn: { mrnNumber: "asc" } }, { part: { partNumber: "asc" } }],
    });
    if (f.option !== "SUMMARY") {
      return lines.map((l) => ({
        group: l.mrn.vendor ?? "No vendor",
        mrnNumber: l.mrn.mrnNumber,
        date: l.mrn.receiptDate.toISOString(),
        invoiceNumber: l.mrn.invoiceNumber,
        mitNumber: l.mrn.mit?.mitNumber ?? null,
        partNumber: l.part.partNumber,
        description: l.part.name,
        received: l.receivedQuantity,
        damaged: l.damagedQuantity,
        short: l.shortQuantity,
        unitPrice: l.unitPrice,
        rate: l.unitCost,
        value: l.amount,
      }));
    }
    // One line per MRN (a vendor MRN receives one supplier invoice), totalled from the matching lines.
    const byMrn = new Map<string, Row>();
    for (const l of lines) {
      const row = byMrn.get(l.mrn.id) ?? {
        mrnNumber: l.mrn.mrnNumber,
        date: l.mrn.receiptDate.toISOString(),
        vendor: l.mrn.vendor,
        invoiceNumber: l.mrn.invoiceNumber,
        invoiceDate: l.mrn.mit?.invoiceDate?.toISOString() ?? null,
        mitNumber: l.mrn.mit?.mitNumber ?? null,
        lines: 0,
        received: 0,
        damaged: 0,
        short: 0,
        value: 0,
      };
      row.lines = Number(row.lines) + 1;
      row.received = Number(row.received) + l.receivedQuantity;
      row.damaged = Number(row.damaged) + l.damagedQuantity;
      row.short = Number(row.short) + l.shortQuantity;
      row.value = money(Number(row.value) + l.amount);
      byMrn.set(l.mrn.id, row);
    }
    return [...byMrn.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.mrnNumber).localeCompare(String(b.mrnNumber)));
  }

  private async mitRegister(f: ReportFilters): Promise<Row[]> {
    const lines = await prisma.materialInTransitLine.findMany({
      where: {
        part: partWhere(f),
        mit: {
          transitDate: dateRange(f),
          ...(f.branchId && { destinationBranchId: f.branchId }),
          ...(f.vendor && { vendor: f.vendor }),
          ...(f.search && { OR: [{ mitNumber: { contains: f.search } }, { invoiceNumber: { contains: f.search } }] }),
          // An MIT is in transit until its MRN closes it.
          ...(f.option === "PENDING" && { status: { in: [MitStatus.IN_TRANSIT, MitStatus.VERIFIED] } }),
        },
      },
      include: {
        part: partSelect,
        mit: { select: { mitNumber: true, transitDate: true, invoiceNumber: true, conversionRate: true, status: true } },
      },
      orderBy: [{ mit: { transitDate: "asc" } }, { mit: { mitNumber: "asc" } }, { lineNumber: "asc" }, { part: { partNumber: "asc" } }],
    });
    return lines.map((l) => {
      const cancelled = l.mit.status === MitStatus.CANCELLED;
      return {
        mitNumber: l.mit.mitNumber,
        date: l.mit.transitDate.toISOString(),
        invoiceNumber: l.mit.invoiceNumber,
        caseNumber: l.caseNumbers,
        orderNumber: l.orderNumber,
        partNumber: l.part.partNumber,
        description: l.part.name,
        quantity: l.quantity,
        received: l.receivedQuantity,
        damaged: l.damagedQuantity,
        short: l.shortQuantity,
        pending: cancelled ? 0 : l.quantity - l.receivedQuantity - l.damagedQuantity - l.shortQuantity,
        unitPrice: l.unitPrice,
        value: money(l.amount * (l.mit.conversionRate ?? 1)),
        // "Cancelled" (capitalised) keeps the line out of the totals.
        status: cancelled ? "Cancelled" : statusLabel(l.mit.status),
      };
    });
  }

  private async receiptChecklist(f: ReportFilters): Promise<Row[]> {
    const lines = await prisma.materialReceiptLine.findMany({
      where: {
        receivedQuantity: { gt: 0 },
        part: partWhere(f),
        mrn: { receiptDate: dateRange(f), ...(f.branchId && { receivingBranchId: f.branchId }) },
      },
      include: {
        part: partSelect,
        mrn: {
          select: {
            mrnNumber: true,
            receiptDate: true,
            vendor: true,
            sourceBranch: { select: { name: true } },
            receivedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    const rack = await this.racks(f, lines.map((l) => l.partId));
    return lines
      .map((l) => ({
        bin: rack.get(l.partId) ?? l.part.binLocation ?? "",
        partNumber: l.part.partNumber,
        description: l.part.name,
        date: l.mrn.receiptDate.toISOString(),
        mrnNumber: l.mrn.mrnNumber,
        from: l.mrn.sourceBranch?.name ?? l.mrn.vendor ?? "",
        quantity: l.receivedQuantity,
        by: userName(l.mrn.receivedBy),
      }))
      .sort((a, b) => a.bin.localeCompare(b.bin) || a.partNumber.localeCompare(b.partNumber) || a.date.localeCompare(b.date));
  }

  /** Receipt lines with damaged or short quantities: vendor MRNs, or transfer SRNs. */
  private async receiptShortage(f: ReportFilters): Promise<Row[]> {
    const srn = f.option === "SRN";
    const lines = await prisma.materialReceiptLine.findMany({
      where: {
        OR: [{ damagedQuantity: { gt: 0 } }, { shortQuantity: { gt: 0 } }],
        part: partWhere(f),
        mrn: {
          source: srn ? MrnSource.BRANCH_TRANSFER : { not: MrnSource.BRANCH_TRANSFER },
          receiptDate: dateRange(f),
          ...(f.branchId && { receivingBranchId: f.branchId }),
          ...(f.otherBranchId && { sourceBranchId: f.otherBranchId }),
          ...(f.vendor && !srn && { vendor: f.vendor }),
          ...(f.search && {
            OR: [
              { mrnNumber: { contains: f.search } },
              { mit: { mitNumber: { contains: f.search } } },
              { stn: { stnNumber: { contains: f.search } } },
            ],
          }),
        },
      },
      include: {
        part: partSelect,
        mitLine: { select: { caseNumbers: true } },
        stnLine: { select: { caseLines: { select: { case: { select: { caseNumber: true } } } } } },
        mrn: {
          select: {
            mrnNumber: true,
            receiptDate: true,
            vendor: true,
            invoiceNumber: true,
            mit: { select: { mitNumber: true } },
            sourceBranch: { select: { name: true } },
            stn: { select: { stnNumber: true, packingList: { select: { packingNumber: true } } } },
          },
        },
      },
      orderBy: [{ mrn: { receiptDate: "asc" } }, { mrn: { mrnNumber: "asc" } }, { part: { partNumber: "asc" } }],
    });
    return lines.map((l) => ({
      mrnNumber: l.mrn.mrnNumber,
      date: l.mrn.receiptDate.toISOString(),
      from: (srn ? l.mrn.sourceBranch?.name : l.mrn.vendor) ?? "",
      ...(srn
        ? {
            stnNumber: l.mrn.stn?.stnNumber ?? "",
            packingNumber: l.mrn.stn?.packingList?.packingNumber ?? "",
            caseNumber: (l.stnLine?.caseLines ?? []).map((c) => c.case.caseNumber).join(", "),
          }
        : { invoiceNumber: l.mrn.invoiceNumber, mitNumber: l.mrn.mit?.mitNumber ?? null, caseNumber: l.mitLine?.caseNumbers ?? null }),
      partNumber: l.part.partNumber,
      description: l.part.name,
      expected: l.receivedQuantity + l.damagedQuantity + l.shortQuantity,
      received: l.receivedQuantity,
      damaged: l.damagedQuantity,
      short: l.shortQuantity,
      rate: l.unitCost,
      value: money((l.damagedQuantity + l.shortQuantity) * l.unitCost),
    }));
  }

  // ── Transfers ─────────────────────────────────────────────────────────────

  private async pickingRegister(f: ReportFilters): Promise<Row[]> {
    const lines = await prisma.pickingListLine.findMany({
      where: {
        part: partWhere(f),
        pickingList: { createdAt: dateRange(f), ...(f.branchId && { branchId: f.branchId }) },
      },
      include: {
        part: partSelect,
        requestedPart: { select: { partNumber: true } },
        pickingList: {
          select: {
            pickingNumber: true,
            createdAt: true,
            pickerName: true,
            status: true,
            createdBy: { select: { firstName: true, lastName: true } },
            indent: { select: { indentNumber: true, requestingBranch: { select: { name: true } } } },
          },
        },
      },
      orderBy: [{ pickingList: { createdAt: "asc" } }, { pickingList: { pickingNumber: "asc" } }],
    });
    return lines.map((l) => ({
      pickingNumber: l.pickingList.pickingNumber,
      date: l.pickingList.createdAt.toISOString(),
      indentNumber: l.pickingList.indent.indentNumber,
      toBranch: l.pickingList.indent.requestingBranch.name,
      partNumber: l.part.partNumber,
      description: l.part.name,
      requestedPart: l.isAlternate ? l.requestedPart.partNumber : null,
      bin: l.binLocation ?? l.part.binLocation,
      picked: l.pickedQuantity,
      picker: l.pickingList.pickerName || userName(l.pickingList.createdBy),
      status: statusLabel(l.pickingList.status),
    }));
  }

  /**
   * Legacy STN/SRN Register: one block per document headed "number · date · store", lines in part
   * number order, a total under each. STNs are valued at the dealer rate on dispatch; SRNs at the
   * STN rate on the quantity received. Cancelled STNs are left out: their stock went back.
   *
   * The Store Wise STN Register is legacy's "Storelocation" layout: the same STNs and totals,
   * sorted by the sending store, with the receiving store and rate left off. Its heading names the
   * sending branch in place of the receiver.
   */
  private async stnRegister(f: ReportFilters, byStore: boolean): Promise<Row[]> {
    const lines = await prisma.stockTransferNoteLine.findMany({
      where: {
        part: partWhere(f),
        stn: {
          documentDate: dateRange(f),
          status: { not: StnStatus.CANCELLED },
          ...(f.branchId && { sourceBranchId: f.branchId }),
          ...(f.otherBranchId && { destinationBranchId: f.otherBranchId }),
        },
      },
      include: {
        part: partSelect,
        stn: {
          select: {
            stnNumber: true,
            documentDate: true,
            sourceBranch: { select: { name: true } },
            destinationBranch: { select: { name: true } },
          },
        },
      },
      orderBy: [{ stn: { documentDate: "asc" } }, { stn: { stnNumber: "asc" } }, { part: { partNumber: "asc" } }],
    });
    const rows = lines.map((l) => ({
      group: documentHeading(l.stn.stnNumber, l.stn.documentDate, (byStore ? l.stn.sourceBranch : l.stn.destinationBranch).name),
      fromBranch: l.stn.sourceBranch.name,
      stnNumber: l.stn.stnNumber,
      date: l.stn.documentDate.toISOString(),
      toBranch: l.stn.destinationBranch.name,
      partNumber: l.part.partNumber,
      partFlag: l.part.partFlag,
      description: l.part.name,
      quantity: l.quantity,
      rate: l.unitRate,
      amount: l.amount,
    }));
    // A stable sort keeps each store's STNs in date order.
    return byStore ? rows.sort((a, b) => a.fromBranch.localeCompare(b.fromBranch)) : rows;
  }

  private async srnRegister(f: ReportFilters): Promise<Row[]> {
    const lines = await prisma.materialReceiptLine.findMany({
      where: {
        part: partWhere(f),
        mrn: { source: "BRANCH_TRANSFER", receiptDate: dateRange(f), ...(f.branchId && { receivingBranchId: f.branchId }) },
      },
      include: {
        part: partSelect,
        mrn: { select: { mrnNumber: true, receiptDate: true, sourceBranch: { select: { name: true } } } },
      },
      orderBy: [{ mrn: { receiptDate: "asc" } }, { mrn: { mrnNumber: "asc" } }, { part: { partNumber: "asc" } }],
    });
    return lines.map((l) => {
      const store = l.mrn.sourceBranch?.name ?? "";
      return {
        group: documentHeading(l.mrn.mrnNumber, l.mrn.receiptDate, store),
        mrnNumber: l.mrn.mrnNumber,
        date: l.mrn.receiptDate.toISOString(),
        fromBranch: store,
        partNumber: l.part.partNumber,
        partFlag: l.part.partFlag,
        description: l.part.name,
        quantity: l.receivedQuantity,
        rate: l.unitCost,
        amount: l.amount,
      };
    });
  }

  /** STN lines dispatched to the branch: what has arrived and what is still on the way. */
  private async branchInTransit(f: ReportFilters): Promise<Row[]> {
    const open: StnStatus[] = [StnStatus.DISPATCHED, StnStatus.PARTIALLY_RECEIVED];
    const pendingOnly = f.option === "PENDING";
    const lines = await prisma.stockTransferNoteLine.findMany({
      where: {
        part: partWhere(f),
        stn: {
          documentDate: dateRange(f),
          status: { in: pendingOnly ? open : [...open, StnStatus.RECEIVED] },
          ...(f.branchId && { destinationBranchId: f.branchId }),
          ...(f.otherBranchId && { sourceBranchId: f.otherBranchId }),
          ...(f.search && { stnNumber: { contains: f.search } }),
        },
      },
      include: {
        part: partSelect,
        stn: { select: { stnNumber: true, documentDate: true, status: true, sourceBranch: { select: { name: true } }, packingList: { select: { packingNumber: true } } } },
      },
      orderBy: [{ stn: { documentDate: "asc" } }, { stn: { stnNumber: "asc" } }, { part: { partNumber: "asc" } }],
    });
    return lines
      .map((l) => ({ l, pending: l.quantity - l.receivedQuantity - l.damagedQuantity - l.shortQuantity }))
      .filter(({ pending }) => !pendingOnly || pending > 0)
      .map(({ l, pending }) => ({
        stnNumber: l.stn.stnNumber,
        date: l.stn.documentDate.toISOString(),
        fromBranch: l.stn.sourceBranch.name,
        packingNumber: l.stn.packingList?.packingNumber ?? "",
        partNumber: l.part.partNumber,
        description: l.part.name,
        quantity: l.quantity,
        received: l.receivedQuantity,
        damaged: l.damagedQuantity,
        short: l.shortQuantity,
        pending,
        rate: l.unitRate,
        value: money(pending * l.unitRate),
        status: statusLabel(l.stn.status),
      }));
  }

  /** Inward: indents raised on the branch. Outward: indents the branch raised on others. */
  private async indentRegister(f: ReportFilters, outward: boolean): Promise<Row[]> {
    const pending: IndentStatus[] = [IndentStatus.SUBMITTED, IndentStatus.APPROVED, IndentStatus.PICKED, IndentStatus.PARTLY_DISPATCHED];
    const lines = await prisma.branchIndentLine.findMany({
      where: {
        part: partWhere(f),
        indent: {
          orderDate: dateRange(f),
          status: { not: IndentStatus.DRAFT },
          ...(f.branchId && (outward ? { requestingBranchId: f.branchId } : { sourceBranchId: f.branchId })),
          ...(f.otherBranchId && (outward ? { sourceBranchId: f.otherBranchId } : { requestingBranchId: f.otherBranchId })),
          ...(f.search && { indentNumber: { contains: f.search } }),
          ...(f.status === "PENDING" && { status: { in: pending } }),
        },
        // Cancelled: whole indents cancelled or rejected, and lines with a quantity cancelled.
        ...(f.status === "CANCELLED" && {
          OR: [{ cancelledQuantity: { gt: 0 } }, { indent: { status: { in: [IndentStatus.CANCELLED, IndentStatus.REJECTED] } } }],
        }),
      },
      include: {
        part: partSelect,
        indent: { select: { indentNumber: true, orderDate: true, status: true, requestingBranch: { select: { name: true } }, sourceBranch: { select: { name: true } } } },
      },
      orderBy: [{ indent: { orderDate: "asc" } }, { indent: { indentNumber: "asc" } }, { lineNumber: "asc" }],
    });
    return lines
      .filter((l) => {
        if (f.status !== "EXECUTED") return true;
        return f.fullyExecuted ? l.approvedQuantity != null && l.approvedQuantity > 0 && l.dispatchedQuantity >= l.approvedQuantity : l.dispatchedQuantity > 0;
      })
      .map((l) => ({
        indentNumber: l.indent.indentNumber,
        date: l.indent.orderDate.toISOString(),
        ...(outward ? { toBranch: l.indent.sourceBranch.name } : { fromBranch: l.indent.requestingBranch.name }),
        partNumber: l.part.partNumber,
        description: l.part.name,
        requested: l.requestedQuantity,
        approved: l.approvedQuantity ?? 0,
        dispatched: l.dispatchedQuantity,
        backOrder: l.backOrderQuantity,
        cancelled: l.cancelledQuantity,
        rate: l.unitRate,
        value: l.amount,
        status: statusLabel(l.indent.status),
      }));
  }

  // ── Stock ─────────────────────────────────────────────────────────────────

  private stockTransactions(f: ReportFilters, types: string[]) {
    return prisma.stockTransaction.findMany({
      where: {
        type: { in: types },
        createdAt: dateRange(f),
        ...(f.branchId && { branchId: f.branchId }),
        part: partWhere(f),
      },
      include: { part: partSelect, recordedBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Legacy Consumption Report (Consolidated): what each part was issued for in the period. Workshop
   * issues are split by job type (PDI or not) and who pays the job card line; an issue with no job
   * card is a consumable issue; sample parts (flag F) have their own column at no value. Returns
   * (optional) come off the column of the issue they undo. Valued at the retail rate on each line
   * (job card line, bill line, return line); STNs and consumable issues carry no retail rate, so the
   * part's. Cancelled bills are left out altogether, as on legacy. SAN is the stock taken out by SAN
   * subtractions (additions are ignored), shown for reference only: it is not in the total issues. Closing is the stock at `to`.
   */
  private async consumption(f: ReportFilters): Promise<Row[]> {
    const includeReturns = f.includeReturns !== false;
    const txns = (await this.stockTransactions(f, ["ISSUED", "TRANSFER_OUT", "RETURNED", "ADJUSTMENT"])).filter((t) => includeReturns || t.type !== "RETURNED");
    const refs = [...new Set(txns.filter((t) => t.type !== "TRANSFER_OUT" && t.referenceId).map((t) => t.referenceId!))];
    const [issuances, billLines, returnLines] = await Promise.all([
      prisma.partIssuance.findMany({
        where: { id: { in: refs } },
        select: { id: true, jobCard: { select: { serviceType: { select: { preDelivery: true } } } }, jobCardLine: { select: { chargeType: true, rate: true } } },
      }),
      prisma.invoiceLine.findMany({
        where: { invoiceId: { in: refs }, partId: { not: null } },
        select: { invoiceId: true, partId: true, quantity: true, rate: true, invoice: { select: { cancelledAt: true } } },
      }),
      prisma.counterSaleReturnLine.findMany({ where: { returnId: { in: refs } }, select: { returnId: true, partId: true, quantity: true, rate: true } }),
    ]);
    const jobs = new Map(issuances.map((i) => [i.id, i]));
    const cancelledBills = new Set(billLines.filter((l) => l.invoice.cancelledAt).map((l) => l.invoiceId));
    // A bill (or return) can carry a part on more than one line: its average rate.
    const lineRates = new Map<string, { quantity: number; value: number }>();
    for (const l of [...billLines.map((b) => ({ doc: b.invoiceId, ...b })), ...returnLines.map((r) => ({ doc: r.returnId, ...r }))]) {
      const key = `${l.doc}:${l.partId}`;
      const sofar = lineRates.get(key) ?? { quantity: 0, value: 0 };
      lineRates.set(key, { quantity: sofar.quantity + l.quantity, value: sofar.value + l.quantity * l.rate });
    }

    const byPart = new Map<string, Row>();
    for (const t of txns) {
      const ref = t.referenceId ?? "";
      if (cancelledBills.has(ref)) continue;
      // SAN counts only subtractions (legacy SAN type S); a SAN addition is stock found, not an issue.
      if (t.type === "ADJUSTMENT" && t.quantity >= 0) continue;
      const retailRate = t.part.retailRate ?? 0;
      const key = f.summary ? (t.part.priceCategoryCode ?? "") : t.partId;
      const row = byPart.get(key) ?? {
        ...(f.summary
          ? { categoryName: t.part.priceCategory?.description ?? "No price category" }
          : { partNumber: t.part.partNumber, flag: t.part.partFlag, description: t.part.name }),
        category: t.part.priceCategoryCode,
        ...(!f.summary && { dealerRate: t.part.unitPrice, retailRate }),
        ...Object.fromEntries([...CONSUMPTION_COLUMNS, ...Object.values(CONSUMPTION_AMOUNTS)].map((c) => [c, 0])),
        quantity: 0,
        value: 0,
        san: 0,
      };
      byPart.set(key, row);
      // Issues and SAN subtractions are negative movements, returns positive.
      const consumed = -t.quantity;
      if (t.type === "ADJUSTMENT") {
        row.san = Number(row.san) + consumed;
        continue;
      }
      const job = jobs.get(ref);
      const line = lineRates.get(`${ref}:${t.partId}`);
      const chargeType = job?.jobCardLine?.chargeType ?? "CUSTOMER";
      const pdi = !!job?.jobCard?.serviceType?.preDelivery && (chargeType === "CUSTOMER" || chargeType === "WARRANTY");
      const [column, rate] =
        t.type === "TRANSFER_OUT" ? ["stn", retailRate]
        : t.part.partFlag === SAMPLE_FLAG ? ["samples", 0]
        : job?.jobCard ? [pdi ? (chargeType === "WARRANTY" ? "pdiWarranty" : "pdi") : CHARGE_COLUMN[chargeType], job.jobCardLine?.rate ?? retailRate]
        : line ? ["counterSale", line.quantity ? line.value / line.quantity : retailRate]
        : ["consumable", retailRate];
      row[column] = Number(row[column]) + consumed;
      row.quantity = Number(row.quantity) + consumed;
      row.value = money(Number(row.value) + consumed * rate);
      const amount = CONSUMPTION_AMOUNTS[column];
      if (amount) row[amount] = money(Number(row[amount]) + consumed * rate);
    }
    const rows = [...byPart.entries()].filter(([, row]) => [...CONSUMPTION_COLUMNS, "san"].some((c) => row[c] !== 0));
    if (!f.summary) {
      const closing = await this.stockAt(f, rows.map(([partId]) => partId));
      for (const [partId, row] of rows) row.closing = closing.get(partId) ?? 0;
    }
    return rows
      .map(([, row]) => row)
      .sort((a, b) => String(a.partNumber ?? a.category ?? "").localeCompare(String(b.partNumber ?? b.category ?? "")));
  }

  /** Each part's stock at the end of `to` (all branches when none is chosen): today's stock less later movements. */
  private async stockAt(f: ReportFilters, partIds: string[]) {
    const where = { ...(f.branchId && { branchId: f.branchId }), partId: { in: partIds } };
    const [stocks, later] = await Promise.all([
      prisma.inventoryStock.groupBy({ by: ["partId"], where, _sum: { quantity: true } }),
      prisma.stockTransaction.groupBy({ by: ["partId"], where: { ...where, type: { in: STOCK_MOVEMENTS }, createdAt: { gte: dateRange(f).lt } }, _sum: { quantity: true } }),
    ]);
    const balance = new Map(stocks.map((s) => [s.partId, s._sum.quantity ?? 0]));
    for (const m of later) balance.set(m.partId, (balance.get(m.partId) ?? 0) - (m._sum.quantity ?? 0));
    return balance;
  }

  /**
   * Every issue in the period, voucher wise, in sections: STNs at the STN rate, counter sales at
   * the billed value, workshop issues at the job card rate and other issues at retail rate.
   * Required is what was asked for: the indent line (approved, else requested) or the CPO line;
   * a direct STN, a bill without a CPO and a part issue were asked for as issued.
   * Cancelled bills and STNs are left out: their stock went back.
   */
  private async issueChecklist(f: ReportFilters): Promise<Row[]> {
    const [stnLines, saleLines, issuances] = await Promise.all([
      prisma.stockTransferNoteLine.findMany({
        where: {
          part: partWhere(f),
          stn: { documentDate: dateRange(f), stockDeducted: true, status: { not: StnStatus.CANCELLED }, ...(f.branchId && { sourceBranchId: f.branchId }) },
        },
        include: {
          part: partSelect,
          indentLine: { select: { requestedQuantity: true, approvedQuantity: true } },
          stn: { select: { stnNumber: true, documentDate: true, destinationBranch: { select: { code: true, name: true } } } },
        },
      }),
      prisma.invoiceLine.findMany({
        where: { invoice: this.saleInvoiceWhere(f), part: partWhere(f) },
        include: {
          part: partSelect,
          customerOrderLine: { select: { orderedQuantity: true } },
          invoice: { select: { invoiceNumber: true, issuedDate: true, partsDiscountPercent: true, customer: customerSelect } },
        },
      }),
      prisma.partIssuance.findMany({
        where: { issuedAt: dateRange(f), sparePart: partWhere(f), ...(f.branchId && { branchId: f.branchId }) },
        include: {
          sparePart: { select: { partNumber: true, name: true, uom: true, partFlag: true, retailRate: true } },
          jobCard: { select: { jobNumber: true, customer: customerSelect } },
          jobCardLine: { select: { amount: true } },
        },
      }),
    ]);
    const sections: Row[][] = [
      stnLines.map((l) => ({
        group: "STN",
        voucher: l.stn.stnNumber,
        date: l.stn.documentDate.toISOString(),
        code: l.stn.destinationBranch.code,
        issuedTo: l.stn.destinationBranch.name,
        partNumber: l.part.partNumber,
        partFlag: l.part.partFlag,
        description: l.part.name,
        unit: l.part.uom,
        required: l.indentLine ? (l.indentLine.approvedQuantity ?? l.indentLine.requestedQuantity) : l.quantity,
        quantity: l.quantity,
        amount: l.amount,
      })),
      saleLines.map((l) => ({
        group: "Counter sales",
        voucher: l.invoice.invoiceNumber,
        date: l.invoice.issuedDate.toISOString(),
        code: l.invoice.customer.code,
        issuedTo: partyName(l.invoice.customer),
        partNumber: l.part?.partNumber ?? "",
        partFlag: l.part?.partFlag ?? "",
        description: l.description,
        unit: l.part?.uom ?? "",
        required: l.customerOrderLine?.orderedQuantity ?? l.quantity,
        quantity: l.quantity,
        amount: lineValues(l.quantity, l.rate, l.invoice.partsDiscountPercent, l.vatPercent).net,
      })),
      ...[true, false].map((toJob) =>
        issuances
          .filter((i) => !!i.jobCard === toJob)
          .map((i) => ({
            group: toJob ? "Workshop issues" : "Other issues",
            voucher: i.jobCard?.jobNumber ?? "",
            date: i.issuedAt.toISOString(),
            code: i.jobCard?.customer?.code ?? "",
            issuedTo: i.jobCard?.customer ? partyName(i.jobCard.customer) : (i.notes ?? ""),
            partNumber: i.sparePart.partNumber,
            partFlag: i.sparePart.partFlag,
            description: i.sparePart.name,
            unit: i.sparePart.uom,
            required: i.quantity,
            quantity: i.quantity,
            amount: i.jobCardLine?.amount ?? money(i.quantity * (i.sparePart.retailRate ?? 0)),
          })),
      ),
    ];
    const byVoucher = (a: Row, b: Row) =>
      String(a.date).localeCompare(String(b.date)) ||
      String(a.voucher).localeCompare(String(b.voucher)) ||
      String(a.partNumber).localeCompare(String(b.partNumber));
    return sections.flatMap((rows) => rows.sort(byVoucher));
  }

  /** The branch's rack location per part, for the checklists (none for all branches). */
  private async racks(f: ReportFilters, partIds: string[]) {
    const stocks = f.branchId
      ? await prisma.inventoryStock.findMany({
          where: { branchId: f.branchId, partId: { in: [...new Set(partIds)] } },
          select: { partId: true, rackLocation: true },
        })
      : [];
    return new Map(stocks.map((s) => [s.partId, s.rackLocation]));
  }

  private async adjustments(f: ReportFilters): Promise<Row[]> {
    const txns = await this.stockTransactions(f, ["ADJUSTMENT"]);
    return txns
      .filter((t) => f.option === "ALL" || (f.option === "ADDITION" ? t.quantity > 0 : t.quantity < 0))
      .map((t) => ({
        date: t.createdAt.toISOString(),
        partNumber: t.part.partNumber,
        description: t.part.name,
        quantity: t.quantity,
        rate: t.part.unitPrice,
        value: money(t.quantity * t.part.unitPrice),
        notes: t.notes,
        by: userName(t.recordedBy),
      }));
  }
}

export default PartsReportService;
