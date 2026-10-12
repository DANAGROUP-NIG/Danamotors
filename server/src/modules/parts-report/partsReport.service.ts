/**
 * Builds the rows for every parts report (see partsReport.definitions.ts).
 *
 * Dates are calendar days in Africa/Lagos. Counter-sale lines are priced with the same
 * rules as the bill (cash discount, then VAT on taxable lines), so line values agree
 * with the bills; only the bill-level round-off is reported separately. The stock reports
 * (ledger, summary, balances, ageing…) are built in stockReport.service.ts, and the MIS
 * reports in misReport.service.ts.
 */
import { IndentStatus, MitStatus, MrnSource, Prisma, StnStatus } from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, NotFoundError } from "../../shared/errors/appError";
import { money, sumMoney } from "../finance/money";
import { columnsFor, reportByKind, ReportColumn, ReportDefinition } from "./partsReport.definitions";
import { dateRange, lineValues, partWhere, partyName, ReportFilters, Row, statusLabel, userName } from "./partsReport.common";
import { MisReportService } from "./misReport.service";
import { StockReportService } from "./stockReport.service";
import { physicalStockRows } from "../stock-take/stockTake.report";

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
  select: { id: true, partNumber: true, name: true, binLocation: true, unitPrice: true, priceCategoryCode: true, priceCategory: { select: { description: true } } },
} as const;

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

  private async stnRegister(f: ReportFilters, byStore: boolean): Promise<Row[]> {
    const lines = await prisma.stockTransferNoteLine.findMany({
      where: {
        part: partWhere(f),
        stn: {
          documentDate: dateRange(f),
          ...(f.branchId && { sourceBranchId: f.branchId }),
          ...(f.otherBranchId && { destinationBranchId: f.otherBranchId }),
        },
      },
      include: {
        part: partSelect,
        indentLine: { select: { indent: { select: { indentNumber: true } } } },
        stn: { select: { stnNumber: true, documentDate: true, status: true, destinationBranch: { select: { name: true } } } },
      },
      orderBy: [{ stn: { documentDate: "asc" } }, { stn: { stnNumber: "asc" } }],
    });
    const rows = lines.map((l) => ({
      ...(byStore && { group: l.stn.destinationBranch.name }),
      stnNumber: l.stn.stnNumber,
      date: l.stn.documentDate.toISOString(),
      toBranch: l.stn.destinationBranch.name,
      indents: l.indentLine?.indent.indentNumber ?? "Direct",
      partNumber: l.part.partNumber,
      description: l.part.name,
      quantity: l.quantity,
      rate: l.unitRate,
      amount: l.amount,
      accounted: l.receivedQuantity + l.damagedQuantity + l.shortQuantity,
      status: statusLabel(l.stn.status),
    }));
    return byStore ? rows.sort((a, b) => String(a.group).localeCompare(String(b.group))) : rows;
  }

  private async srnRegister(f: ReportFilters): Promise<Row[]> {
    const lines = await prisma.materialReceiptLine.findMany({
      where: {
        part: partWhere(f),
        mrn: { source: "BRANCH_TRANSFER", receiptDate: dateRange(f), ...(f.branchId && { receivingBranchId: f.branchId }) },
      },
      include: {
        part: partSelect,
        mrn: { select: { mrnNumber: true, receiptDate: true, sourceBranch: { select: { name: true } }, stn: { select: { stnNumber: true } } } },
      },
      orderBy: [{ mrn: { receiptDate: "asc" } }, { mrn: { mrnNumber: "asc" } }],
    });
    return lines.map((l) => ({
      mrnNumber: l.mrn.mrnNumber,
      date: l.mrn.receiptDate.toISOString(),
      fromBranch: l.mrn.sourceBranch?.name ?? "",
      stnNumber: l.mrn.stn?.stnNumber ?? "",
      partNumber: l.part.partNumber,
      description: l.part.name,
      received: l.receivedQuantity,
      damaged: l.damagedQuantity,
      short: l.shortQuantity,
      rate: l.unitCost,
      value: l.amount,
    }));
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
          ...(f.status === "CANCELLED" && { status: { in: [IndentStatus.CANCELLED, IndentStatus.REJECTED] } }),
        },
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

  private async consumption(f: ReportFilters): Promise<Row[]> {
    const includeReturns = f.includeReturns !== false;
    const txns = await this.stockTransactions(f, ["ISSUED", "TRANSFER_OUT", "RETURNED"]);
    const byPart = new Map<string, Row>();
    for (const t of txns) {
      const key = f.summary ? (t.part.priceCategoryCode ?? "") : t.partId;
      const row = byPart.get(key) ?? {
        ...(f.summary
          ? { categoryName: t.part.priceCategory?.description ?? "No price category" }
          : { partNumber: t.part.partNumber, description: t.part.name }),
        category: t.part.priceCategoryCode,
        issued: 0,
        transferred: 0,
        returned: 0,
        net: 0,
        rate: t.part.unitPrice,
        value: 0,
      };
      if (t.type === "ISSUED") row.issued = Number(row.issued) + Math.abs(t.quantity);
      else if (t.type === "TRANSFER_OUT") row.transferred = Number(row.transferred) + Math.abs(t.quantity);
      else row.returned = Number(row.returned) + Math.abs(t.quantity);
      // Valued at each part's dealer rate, so a category adds up its parts.
      const sign = t.type === "RETURNED" ? (includeReturns ? -1 : 0) : 1;
      row.value = money(Number(row.value) + sign * Math.abs(t.quantity) * t.part.unitPrice);
      byPart.set(key, row);
    }
    return [...byPart.values()]
      .map((row): Row => {
        const net = Number(row.issued) + Number(row.transferred) - (includeReturns ? Number(row.returned) : 0);
        return { ...row, ...(includeReturns ? {} : { returned: 0 }), net };
      })
      .sort((a, b) => String(a.partNumber ?? a.category ?? "").localeCompare(String(b.partNumber ?? b.category ?? "")));
  }

  private async issueChecklist(f: ReportFilters): Promise<Row[]> {
    const txns = await this.stockTransactions(f, ["ISSUED", "TRANSFER_OUT"]);
    const rack = await this.racks(f, txns.map((t) => t.partId));
    return txns
      .map((t) => ({
        bin: rack.get(t.partId) ?? t.part.binLocation ?? "",
        partNumber: t.part.partNumber,
        description: t.part.name,
        date: t.createdAt.toISOString(),
        type: t.type === "TRANSFER_OUT" ? "STN" : t.notes?.startsWith("Counter sale") ? "Counter sale" : "Issue",
        reference: t.notes,
        quantity: Math.abs(t.quantity),
        by: userName(t.recordedBy),
      }))
      .sort((a, b) => a.bin.localeCompare(b.bin) || a.partNumber.localeCompare(b.partNumber) || a.date.localeCompare(b.date));
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
