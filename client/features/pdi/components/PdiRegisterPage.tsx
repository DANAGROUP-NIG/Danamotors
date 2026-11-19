"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { DateInput } from "@/components/forms/DateInput";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { usePdiRegister } from "../hooks/use-pdi";
import { BILL_TYPES, formatDate, personName } from "../lib/pdi.logic";
import type { PdiBillListItem, PdiLabourSlip, PdiRequisition, PdiReturn } from "../types/pdi.types";
import { ChargePill, MoneyText, pdiInput } from "./pdi-ui";

type Kind = "requisitions" | "returns" | "labour-slips" | "bills";
type JobRef = { id: string; jobNumber: string; pdiRegistration: string | null; vehicle: { vin: string; model: string | null } | null } | undefined;

const COPY: Record<Kind, { title: string; description: string; empty: string }> = {
  requisitions: { title: "PDI requisitions", description: "Parts issued to PDI jobs (IPO), with their own number series; warranty requisitions start with PW.", empty: "No PDI requisitions yet." },
  returns: { title: "PDI requisition returns", description: "Parts returned from PDI requisitions; stock was added back.", empty: "No PDI returns yet." },
  "labour-slips": { title: "PDI labour slips", description: "Labour booked on PDI jobs, with totals by charge type.", empty: "No PDI labour slips yet." },
  bills: { title: "PDI bills", description: "PDI cash memos, invoices and zero bills, with the accounts voucher.", empty: "No PDI bills yet." },
};

const jobCell = (job: JobRef) => job ? (
  <div>
    <Link href={`/pdi/${job.id}`} className="font-mono text-primary hover:underline">{job.jobNumber}</Link>
    <p className="font-mono text-xs text-muted-foreground">{job.vehicle?.vin ?? "—"}</p>
  </div>
) : "—";

/** The PDI registers in the PDI menu: one screen, four document kinds. */
export function PdiRegisterPage({ kind }: { kind: Kind }) {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const query = usePdiRegister(kind, { search: search.trim() || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, limit: 25 });
  const copy = COPY[kind];

  const columns = useMemo(() => {
    if (kind === "requisitions") return [
      { header: "Requisition", render: row => <div><span className="font-mono font-semibold">{row.requisitionNumber}</span><p className="text-xs text-muted-foreground">{formatDate(row.requisitionDate)}</p></div> },
      { header: "PDI job", render: row => jobCell(row.jobCard) },
      { header: "Type", render: row => <ChargePill type={row.chargeType} /> },
      { header: "Engineer", render: row => personName(row.engineer) },
      { header: "Items", render: row => row.totals.numberOfItems },
      { header: "Net qty issued", render: row => row.totals.netQuantityIssued },
      { header: "Total amount", render: row => <MoneyText value={row.totals.totalAmount} /> },
      { header: "Approved", render: row => <MoneyText value={row.totals.approvedAmount} /> },
      { header: "Status", render: row => row.status === "CANCELLED" ? <span className="text-destructive">Cancelled</span> : "Issued" },
    ] satisfies Column<PdiRequisition>[];
    if (kind === "returns") return [
      { header: "Return", render: row => <div><span className="font-mono font-semibold">{row.returnNumber}</span><p className="text-xs text-muted-foreground">{formatDate(row.returnDate)}</p></div> },
      { header: "PDI job", render: row => jobCell(row.jobCard) },
      { header: "Requisition", render: row => <span className="font-mono">{row.requisition.requisitionNumber}</span> },
      { header: "Items", render: row => row.totals.numberOfItems },
      { header: "Net qty returned", render: row => row.totals.netQuantityReturned },
      { header: "Total amount", render: row => <MoneyText value={row.totals.totalAmount} /> },
      { header: "Status", render: row => row.status === "CANCELLED" ? <span className="text-destructive">Cancelled</span> : "Completed" },
    ] satisfies Column<PdiReturn>[];
    if (kind === "labour-slips") return [
      { header: "Labour slip", render: row => <div><span className="font-mono font-semibold">{row.slipNumber}</span><p className="text-xs text-muted-foreground">{formatDate(row.slipDate)}</p></div> },
      { header: "PDI job", render: row => jobCell(row.jobCard) },
      { header: "Group", render: row => row.group?.description ?? "—" },
      { header: "Engineer", render: row => personName(row.engineer) },
      { header: "Lines", render: row => row.lineCount ?? 0 },
      { header: "Warranty", render: row => <MoneyText value={row.totals.warranty} /> },
      { header: "Non-warranty", render: row => <MoneyText value={row.totals.nonWarranty} /> },
      { header: "FOC", render: row => <MoneyText value={row.totals.foc} /> },
      { header: "Total", render: row => <MoneyText value={row.totals.total} className="font-semibold" /> },
    ] satisfies Column<PdiLabourSlip>[];
    return [
      { header: "Bill", render: row => <div><Link href={`/pdi/bills/${row.id}`} className="font-mono font-semibold text-primary hover:underline">{row.invoiceNumber}</Link><p className="text-xs text-muted-foreground">{formatDate(row.issuedDate)}</p></div> },
      { header: "PDI job", render: row => jobCell(row.jobCard) },
      { header: "Bill type", render: row => BILL_TYPES.find(type => type.value === row.pdiBillType)?.label ?? row.pdiBillType },
      { header: "Customer", render: row => row.customer.companyName || `${row.customer.firstName} ${row.customer.lastName}` },
      { header: "Amount", render: row => <MoneyText value={row.total} className="font-semibold" /> },
      { header: "Voucher no.", render: row => row.tallyVoucherNo ?? (row.tallyPostedAt ? "Posted" : "—") },
      { header: "Status", render: row => row.cancelledAt ? <span className="text-destructive">Cancelled</span> : row.status },
    ] satisfies Column<PdiBillListItem>[];
  }, [kind]);

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <PageHeader title={copy.title} description={copy.description} />
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <input aria-label="Search" className={`${pdiInput} pl-9`} placeholder="Document no., PDI job no. or VIN" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </div>
        <DateInput value={dateFrom} onChange={value => { setDateFrom(value.slice(0, 10)); setPage(1); }} placeholder="From date" />
        <DateInput value={dateTo} onChange={value => { setDateTo(value.slice(0, 10)); setPage(1); }} placeholder="To date" />
      </div>
      <DataTable
        columns={columns as Column<unknown>[]}
        data={query.data?.items ?? []}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        rowKey={row => (row as { id: string }).id}
        emptyMessage={search || dateFrom || dateTo ? "Nothing matches these filters." : copy.empty}
        page={page}
        pageSize={25}
        total={query.data?.meta.total}
        totalPages={query.data?.meta.totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
