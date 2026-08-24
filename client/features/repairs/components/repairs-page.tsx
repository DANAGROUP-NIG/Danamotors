"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchX, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import { PageHeader } from "@/components/headers/page-header";
import { useBranchStore } from "@/store/branch.store";
import { useRepairs } from "../hooks/use-repairs";
import type { JobCard, JobCardStatus } from "@/features/job-cards";

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<JobCardStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

const STATUS_TONES: Record<JobCardStatus, StatusTone> = {
  pending: "amber",
  in_progress: "blue",
  completed: "emerald",
  on_hold: "gray",
  cancelled: "red",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS) as JobCardStatus[];

export function RepairsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const router = useRouter();

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch, activeBranch?.id]);

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }
  function changeFilter(s: string) { setStatusFilter(s); setPage(1); }

  const { data, isLoading, isError } = useRepairs({
    page,
    limit: PAGE_SIZE,
    branchId: activeBranch?.id,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
  });

  const repairs = data?.jobCards ?? [];

  const columns: Column<JobCard>[] = [
    {
      header: "Job #",
      render: (jc) => (
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" />
          <span className="font-mono text-xs font-medium">{jc.jobNumber}</span>
        </div>
      ),
    },
    {
      header: "Vehicle",
      render: (jc) => (
        <span className="text-muted-foreground">
          {[jc.vehicle?.make, jc.vehicle?.model].filter(Boolean).join(" ") || "—"}
          {jc.vehicle?.registrationNumber ? ` · ${jc.vehicle.registrationNumber}` : ""}
        </span>
      ),
    },
    {
      header: "Customer",
      render: (jc) => (
        <span className="text-muted-foreground">
          {jc.customer ? `${jc.customer.firstName} ${jc.customer.lastName}` : "—"}
        </span>
      ),
    },
    {
      header: "Fault",
      render: (jc) => (
        <span className="line-clamp-1 max-w-[240px] text-muted-foreground">{jc.description}</span>
      ),
    },
    {
      header: "Technician",
      render: (jc) => (
        <span className="text-muted-foreground">
          {jc.technician ? `${jc.technician.firstName} ${jc.technician.lastName}` : "—"}
        </span>
      ),
    },
    {
      header: "Started",
      render: (jc) => <span className="text-muted-foreground">{new Date(jc.createdAt).toLocaleDateString()}</span>,
    },
    {
      header: "Status",
      render: (jc) => {
        const tone = STATUS_TONES[jc.status as JobCardStatus] ?? "gray";
        return <StatusBadge status={STATUS_LABELS[jc.status as JobCardStatus] ?? jc.status} tone={tone} />;
      },
    },
  ];

  if (isError) {
    return (
      <div className="flex flex-col gap-5 p-4 lg:p-6">
        <PageHeader title="Repairs" description="Active and historical vehicle repair work orders." />
        <Card>
          <CardContent className="py-12 text-center">
            <SearchX className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-red-500">Failed to load repairs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Repairs"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "repair" : "repairs"} on record`
            : "Active and historical vehicle repair work orders."
        }
      />

      <DataTable
        columns={columns}
        data={repairs}
        isLoading={isLoading}
        emptyMessage={
          statusFilter || debouncedSearch
            ? "No repairs match the current filters."
            : "No repair records yet."
        }
        rowKey={(jc) => jc.id}
        onRowClick={(jc) => router.push(`/job-cards/${jc.id}`)}
        skeletonRowCount={5}
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.meta?.total ?? 0}
        totalPages={data?.meta?.totalPages ?? 1}
        onPageChange={setPage}
      >
        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          onSearch={commitSearch}
          onClearSearch={clearSearch}
          placeholder="Search by job #, customer, or vehicle…"
          filters={
            <DataTableFilterChips
              options={[{ label: "All", value: "" }, ...ALL_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s }))]}
              selected={statusFilter}
              onChange={changeFilter}
            />
          }
        />
      </DataTable>
    </div>
  );
}
