import { corporateColumns, numberedRows } from './legacy-columns';
import prisma from "../../prisma/client";
import { ReportInput } from "./report.validation";
import { ReportResult, ReportRow } from "./report.types";
import { activeInvoice, jobScope } from "./report.repository";
import { dateBounds, dateKey, groups, totals } from "./report.logic";
import { customerName } from "./delivery-warranty.report";
import { money, sumMoney } from "../finance/money";
import { BadRequestError } from "../../shared/errors/appError";
import { Prisma } from "@prisma/client";
import {
  taxRegisterValues,
  taxRegisterSnapshotSchema,
  taxRegisterTotals,
  taxRegisterLabels,
  taxRegisterGroups,
  taxCategoryGroups,
  nullableMoneyTotals,
} from "./tax-register-layout";
import { reportBillType, reconciledTaxRows, sortTaxBills, TaxRow } from "./billing.logic";
export function taxAnnexure(
  rows: Array<{
    category: string;
    rate: number | null;
    saleAmount: number | null;
    discount: number | null;
    taxableAmount: number | null;
    vat: number;
  }>,
): ReportRow[] {
  const map = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.category + ":" + r.rate;
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map].map(([, rs]) => ({
    category: rs[0].category,
    rate: rs[0].rate,
    ...nullableMoneyTotals(rs as unknown as ReportRow[], [
      "saleAmount",
      "discount",
      "taxableAmount",
      "vat",
    ]),
  }));
}
export async function taxRegister(input: ReportInput): Promise<ReportResult> {
  const bills = await prisma.invoice.findMany({
    where: {
      ...activeInvoice,
      issuedDate: dateBounds(input.from!, input.to!),
      jobCard: { is: jobScope(input) },
    },
    include: { customer: true, jobCard: true, vatBreakdown: true },
    orderBy:
      input.order === "DATE"
        ? [{ issuedDate: "asc" }, { invoiceNumber: "asc" }]
        : [{ invoiceNumber: "asc" }],
  });
  let rows: ReportRow[] = [];
  const taxes: Array<{
    category: string;
    rate: number | null;
    saleAmount: number | null;
    discount: number | null;
    taxableAmount: number | null;
    vat: number;
  }> = [];
  let historical = 0;
  let incomplete = 0;
  let roundingDifferences = 0;
  let inconsistentBreakdowns = 0;
  for (const i of bills) {
    const layout = taxRegisterValues(i);
    const type = reportBillType(i.billType);
    if (input.billType !== "BOTH" && input.billType !== type) continue;
    const breakdown: TaxRow[] = i.vatBreakdown.map((r) => ({
      category: r.category,
      rate: Number(r.rate),
      saleAmount: Number(r.saleAmount),
      discount: Number(r.discount),
      taxableAmount: Number(r.taxableAmount),
      vat: Number(r.vat),
    }));
    const importedWithoutCategories = layout.source === 'LEGACY' && !breakdown.length;
    if (!breakdown.length) {
      historical++;
      breakdown.push({
        category: "LEGACY_UNALLOCATED",
        rate: null,
        saleAmount: importedWithoutCategories ? null : i.subtotal,
        discount: importedWithoutCategories ? null : sumMoney([i.partsDiscountAmount, i.labourDiscountAmount]),
        taxableAmount: importedWithoutCategories ? null : money(
          new Prisma.Decimal(i.subtotal)
            .minus(i.partsDiscountAmount)
            .minus(i.labourDiscountAmount)
            .toNumber(),
        ),
        vat: importedWithoutCategories && layout.values.labourVat != null ? money(new Prisma.Decimal(i.vatAmount).minus(layout.values.labourVat).toNumber()) : i.vatAmount,
      });
      if (importedWithoutCategories && layout.values.labourVat != null) breakdown.push({ category: 'LABOUR', rate: null, saleAmount: null, discount: null, taxableAmount: layout.values.labourAmount, vat: layout.values.labourVat });
    }
    const reconciled = reconciledTaxRows(breakdown, i.vatAmount);
    if (reconciled.difference !== 0) inconsistentBreakdowns++;
    taxes.push(...reconciled.rows);
    const categoryAmountsKnown = i.vatBreakdown.length > 0 && sumMoney(breakdown.filter(b => b.category !== "LABOUR").map(b => b.saleAmount ?? 0)) === i.partsTotal;
    const cat = (key: string) =>
      sumMoney(
        breakdown.filter((b) => b.category === key).map((b) => b.saleAmount ?? 0),
      );
    const partVat = sumMoney(
      breakdown
        .filter(
          (b) => b.category !== "LABOUR" && b.category !== "LEGACY_UNALLOCATED",
        )
        .map((b) => b.vat),
    );
    const importedPartVat = importedWithoutCategories && layout.values.upstGovernment != null && layout.values.upstNonGovernment != null ? sumMoney([layout.values.upstGovernment, layout.values.upstNonGovernment]) : null;
    if (layout.incomplete) incomplete++;
    if (layout.sourceRoundingDifference) roundingDifferences++;
    rows.push({
      serialNumber: rows.length + 1,
      billType: type,
      billNumber: layout.documentNumber ?? i.invoiceNumber,
      billDate: dateKey(i.issuedDate),
      customer: customerName(i.customer),
      ...(input.printAddress === "true"
        ? { address: i.customer.address, phone: i.customer.phoneNumber }
        : {}),
      taxId: null,
      spares: categoryAmountsKnown || breakdown.some((b) => b.category === "SPARES")
        ? cat("SPARES")
        : null,
      oil: categoryAmountsKnown || breakdown.some((b) => b.category === "OIL") ? cat("OIL") : null,
      accessories: categoryAmountsKnown || breakdown.some((b) => b.category === "ACCESSORIES")
        ? cat("ACCESSORIES")
        : null,
      unclassifiedParts: importedWithoutCategories ? null : cat("UNCLASSIFIED"),
      parts: importedWithoutCategories ? null : i.partsTotal,
      discount: importedWithoutCategories ? null : sumMoney([i.partsDiscountAmount, i.labourDiscountAmount]),
      taxableAmount: money(
        new Prisma.Decimal(i.subtotal)
          .minus(i.partsDiscountAmount)
          .minus(i.labourDiscountAmount)
          .toNumber(),
      ),
      partsVat: importedWithoutCategories ? importedPartVat : partVat,
      partsTaxableAmount: breakdown.some(b => b.category === "LEGACY_UNALLOCATED") ? null : sumMoney(breakdown.filter(b => b.category !== "LABOUR").map(b => b.taxableAmount ?? 0)),
      labour: importedWithoutCategories ? null : i.labourTotal,
      serviceCharge: importedWithoutCategories ? null : i.serviceTotal,
      labourVat: sumMoney(
        breakdown.filter((b) => b.category === "LABOUR").map((b) => b.vat),
      ),
      legacyVat: importedPartVat != null && layout.values.labourVat != null ? money(new Prisma.Decimal(i.vatAmount).minus(importedPartVat).minus(layout.values.labourVat).toNumber()) : sumMoney(
        breakdown
          .filter((b) => b.category === "LEGACY_UNALLOCATED")
          .map((b) => b.vat).concat(reconciled.difference),
      ),
      vat: i.vatAmount,
      roundOff: i.roundOff,
      billAmount: i.total,
      ...layout.values,
    });
  }
  rows = sortTaxBills(rows, input.order);
  const keys = [
    "spares",
    "oil",
    "accessories",
    "unclassifiedParts",
    "parts",
    "discount",
    "taxableAmount",
    "partsVat",
    "partsTaxableAmount",
    "labour",
    "serviceCharge",
    "labourVat",
    "legacyVat",
    "vat",
    "roundOff",
    "billAmount",
  ];
  const annexure = taxAnnexure(taxes);
  const detailGroups = input.layout === "LEGACY" ? taxRegisterGroups : taxCategoryGroups;
  const detailColumns = detailGroups.flatMap(g => g.columns);
  const sections: ReportResult["groups"] =
    input.view === "ANNEXURE"
      ? []
      : groups(rows, "billType", keys).map((g, i) => ({
          ...g,
          title:
            g.title === "UNCLASSIFIED" ? "Unclassified billing type" : g.title,
          columns: [
            ...detailColumns,
            ...(input.printAddress === "true" ? ["address", "phone"] : []),
          ],
          columnGroups: [
            ...detailGroups,
            ...(input.printAddress === "true"
              ? [{ title: "Customer contact", columns: ["address", "phone"] }]
              : []),
          ],
          columnLabels: taxRegisterLabels,
          totals: { ...nullableMoneyTotals(g.rows, keys), ...taxRegisterTotals(g.rows) },
          pageBreak: input.pageBreak === "true" && i > 0,
        }));
  if (input.view !== "DETAIL")
    sections.push({
      title: "VAT annexure",
      rows: annexure,
      totals: nullableMoneyTotals(annexure, [
        "saleAmount",
        "discount",
        "taxableAmount",
        "vat",
      ]),
      pageBreak: true,
    });
  return {
    rows: [],
    groups: sections,
    totals: {
      ...nullableMoneyTotals(rows, keys),
      ...taxRegisterTotals(rows),
      bills: rows.length,
    },
    summaryKeys: ["bills", "netTotal", "vat", "roundOff"],
    filters: input,
    warnings: [
      ...(inconsistentBreakdowns ? [`${inconsistentBreakdowns} bill VAT breakdowns differ from stored VAT. The difference is shown explicitly in the annexure; no invoice was changed.`] : []),
      ...(roundingDifferences
        ? [
            `${roundingDifferences} legacy bills have a one-kobo component rounding difference. Net total preserves the stored invoice amount.`,
          ]
        : []),
      ...(historical
        ? [
            `${historical} historical bills have no category breakdown. Stored VAT appears as legacy unallocated; no amounts were reconstructed.`,
          ]
        : []),
      ...(incomplete && !historical
        ? [
            `${incomplete} bills have unavailable legacy charge or government-split fields. Dashes and incomplete totals indicate unknown amounts, not zero.`,
          ]
        : []),
      ...(rows.some((r) => r.billType === "UNCLASSIFIED")
        ? [
            "Imported cash/credit flags are unconfirmed. Those bills are shown separately and excluded from Cash-only and Credit-only selections.",
          ]
        : []),
    ],
  };
}
export async function corporateBills(
  input: ReportInput,
): Promise<ReportResult> {
  // TODO(confirm): fleet membership is current only; historical membership is not recorded.
  const corporates = await prisma.corporateGroup.findMany({
    orderBy:
      input.order === "NAME"
        ? [{ name: "asc" }, { code: "asc" }]
        : [{ code: "asc" }],
  });
  const low = input.fromCorporateId
      ? corporates.findIndex((g) => g.id === input.fromCorporateId)
      : 0,
    high = input.toCorporateId
      ? corporates.findIndex((g) => g.id === input.toCorporateId)
      : corporates.length - 1;
  if (!corporates.length && !input.fromCorporateId && !input.toCorporateId) return { rows: [], groups: [], totals: totals([], ["parts", "labour", "serviceCharge", "vat", "billAmount", "outstanding"]), filters: input };
  if (low < 0 || high < 0 || (low > high && corporates.length))
    throw new BadRequestError("Choose a valid ordered corporate range");
  const selected = corporates.slice(low, high + 1);
  const bills = await prisma.invoice.findMany({
    where: {
      ...activeInvoice,
      issuedDate: dateBounds(input.from!, input.to!),
      jobCard: {
        is: {
          ...jobScope(input),
          vehicle: { corporateGroupId: { in: selected.map((g) => g.id) } },
        },
      },
    },
    include: {
      customer: true,
      jobCard: {
        include: {
          vehicle: {
            include: {
              corporateGroup: true,
              catalogModel: true,
              catalogue: { include: { parent: true } },
            },
          },
          serviceType: true,
          service: true,
        },
      },
    },
    orderBy: [{ issuedDate: "asc" }, { invoiceNumber: "asc" }],
  });
  const rows = bills.flatMap((i) => {
    const j = i.jobCard!,
      v = j.vehicle!,
      g = v.corporateGroup!,
      billType = reportBillType(i.billType);
    if (input.billType !== "BOTH" && billType !== input.billType) return [];
    const snapshot = taxRegisterSnapshotSchema.safeParse(i.taxRegisterSnapshot);
    return [
      {
        customer: customerName(i.customer) || 'Not recorded',
        corporate: g.code + " · " + g.name,
        billNumber: snapshot.success ? snapshot.data.documentNumber ?? i.invoiceNumber : i.invoiceNumber,
        billDate: dateKey(i.issuedDate),
        billType,
        jobNumber: j.jobNumber,
        registration: v.registrationNumber,
        vin: v.vin,
        model:
          v.catalogModel?.name ?? v.catalogue?.parent?.description ?? v.model,
        serviceType: j.serviceType?.description ?? j.service?.name ?? "",
        parts: i.partsTotal,
        labour: i.labourTotal,
        serviceCharge: i.serviceTotal,
        vat: i.vatAmount,
        billAmount: i.total,
        outstanding: i.outstandingAmount,
      },
    ];
  });
  rows.sort(
    (a, b) =>
      selected.findIndex((g) => a.corporate.startsWith(g.code + " ·")) -
      selected.findIndex((g) => b.corporate.startsWith(g.code + " ·")),
  );
  const keys = [
    "parts",
    "labour",
    "serviceCharge",
    "vat",
    "billAmount",
    "outstanding",
  ];
  return {
    rows: [],
    summaryKeys: ['billAmount'],
    groups: groups(rows, "corporate", keys).flatMap(g => [...groups(g.rows.map(r => ({ ...r, customerGroup: String(r.billType) + " / Customer: " + String(r.customer) })), "customerGroup", keys).map(customer => ({ ...customer, title: g.title + " / " + customer.title, ...corporateColumns, rows: numberedRows(customer.rows) })), { title: g.title + " subtotal", rows: [], totals: { billAmount: g.totals?.billAmount ?? 0 }, columns: ["billAmount"], columnLabels: { billAmount: "Amount" } }]).map((g, index) => ({ ...g, pageBreak: index > 0 && g.rows.length > 0 })),
    totals: totals(rows, keys),
    filters: input,
    warnings: rows.some(r => r.billType === "UNCLASSIFIED") ? ["Historical bill types are unclassified until their cash/credit mapping is confirmed."] : [],
  };
}
