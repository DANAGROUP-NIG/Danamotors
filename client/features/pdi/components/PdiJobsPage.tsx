"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CarFront, ClipboardCheck, Plus, Receipt, Search, Wrench } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/forms/DateInput";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { usePdiList } from "../hooks/use-pdi";
import { formatDate, PDI_PERMISSIONS, PDI_STATUS, personName } from "../lib/pdi.logic";
import type { PdiListItem, PdiStatus } from "../types/pdi.types";
import { FilterPills, KpiCard, PdiStatusPill, pdiInput } from "./pdi-ui";

type StatusFilter = "" | PdiStatus;
const FILTERS: StatusFilter[] = ["", "OPEN", "IN_PROGRESS", "QC", "READY", "BILLED", "CANCELLED"];

/** PDI job cards: the PDI menu's landing page, with status tiles, filters and the register. */
export function PdiJobsPage() {
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState<StatusFilter>("");
  const [search, setSearch] = useState("");
  const [vin, setVin] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const params = { status: status || undefined, search: search.trim() || undefined, vin: vin.trim() || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, limit: 20 };
  const { data, isLoading, isFetching, isError, refetch } = usePdiList(params);
  const counts = data?.statusCounts ?? {};
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const columns = useMemo<Column<PdiListItem>[]>(() => [
    {
      header: "PDI job",
      render: row => (
        <div>
          <Link href={`/pdi/${row.id}`} className="font-mono font-semibold text-primary hover:underline">{row.jobNumber}</Link>
          <p className="text-xs text-muted-foreground">{formatDate(row.createdAt)} · {row.branch.name}</p>
        </div>
      ),
    },
    {
      header: "Vehicle",
      render: row => (
        <div className="min-w-0">
          <p className="font-medium text-foreground">{row.vehicle?.catalogue?.description ?? row.vehicle?.model ?? "—"}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.vehicle?.vin ?? "—"}</p>
        </div>
      ),
    },
    { header: "PDI reg.", render: row => <span className="font-mono">{row.pdiRegistration ?? "—"}</span> },
    { header: "Service", render: row => row.serviceType ? `${row.serviceType.code} · ${row.serviceType.description}` : "—" },
    { header: "Engineer", render: row => personName(row.engineer) },
    {
      header: "Work",
      render: row => <span className="text-xs text-muted-foreground">{row._count.complaints} defects · {row._count.requisitions} req. · {row._count.labourSlips} labour</span>,
    },
    { header: "Status", render: row => <PdiStatusPill status={row.status} /> },
  ], []);

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <PageHeader
        title="PDI job cards"
        description="Pre-delivery inspections of new vehicles. Kept apart from service jobs and never shown in a vehicle's service history."
        actions={hasPermission(PDI_PERMISSIONS.CREATE) && (
          <Button asChild className="gap-1.5"><Link href="/pdi/new"><Plus className="size-4" /> Open PDI</Link></Button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open" icon={<ClipboardCheck />} value={(counts.OPEN ?? 0)} sub="Waiting for work" />
        <KpiCard label="In workshop" icon={<Wrench />} value={(counts.IN_PROGRESS ?? 0) + (counts.WAITING_PARTS ?? 0) + (counts.QC ?? 0)} sub="Work in progress or done" />
        <KpiCard label="Ready to bill" icon={<CarFront />} dot="amber" value={counts.READY ?? 0} sub="Vehicle ready" />
        <KpiCard label="Billed" icon={<Receipt />} dot="emerald" value={(counts.BILLED ?? 0) + (counts.DELIVERED ?? 0)} sub={`${total} PDI jobs in all`} />
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <FilterPills<StatusFilter>
          value={status}
          onChange={value => { setStatus(value); setPage(1); }}
          options={FILTERS.map(value => ({
            value,
            label: value ? PDI_STATUS[value].label : "All",
            count: value ? counts[value] ?? 0 : total,
          }))}
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <input aria-label="Search PDI jobs" className={`${pdiInput} pl-9`} placeholder="Job no, PDI reg., model" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
          </div>
          <input aria-label="VIN" className={`${pdiInput} font-mono uppercase`} placeholder="VIN (or its ending)" value={vin} onChange={event => { setVin(event.target.value); setPage(1); }} />
          <DateInput value={dateFrom} onChange={value => { setDateFrom(value.slice(0, 10)); setPage(1); }} placeholder="From date" />
          <DateInput value={dateTo} onChange={value => { setDateTo(value.slice(0, 10)); setPage(1); }} placeholder="To date" />
        </div>
      </div>

      {isError ? (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Could not load PDI job cards.
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={row => row.id}
          emptyMessage={status || search || vin || dateFrom || dateTo ? "No PDI job cards match these filters." : "No PDI job cards yet. Open the first PDI from the button above."}
          page={page}
          pageSize={20}
          total={data?.meta.total}
          totalPages={data?.meta.totalPages}
          onPageChange={setPage}
        />
      )}
      <p className="sr-only" aria-live="polite">{isFetching ? "Updating list" : ""}</p>
    </div>
  );
}
