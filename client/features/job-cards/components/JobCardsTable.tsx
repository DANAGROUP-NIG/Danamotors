"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { DataTableSearchHeader } from "@/components/ui/table-components/DataTableSearchHeader";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DateInput } from "@/components/forms/DateInput";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import { useBranchStore } from "@/store/branch.store";
import { useJobCards } from "../hooks/use-job-cards";
import type { JobCard, JobCardStatus } from "../types/job-card.types";

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

export function JobCardsTable() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const activeBranch = useBranchStore((s) => s.activeBranch);

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id, statusFilter, committedSearch, dateFrom, dateTo]);

  const { data, isLoading, isError, isFetching } = useJobCards({
    page,
    limit: PAGE_SIZE,
    branchId: activeBranch?.id,
    status: statusFilter || undefined,
    search: committedSearch || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const router = useRouter();

  function changeFilter(s: string) {
    setStatusFilter(s);
    setPage(1);
  }

  function handleCommitSearch() {
    setCommittedSearch(search);
    setPage(1);
  }

  function handleClearSearch() {
    setSearch("");
    setCommittedSearch("");
    setPage(1);
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-red-500">
            Failed to load job cards. Check the API connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  const columns: Column<JobCard>[] = [
    {
      header: "Job #",
      render: (jc) => <span className="font-medium">{jc.jobNumber}</span>,
    },
    {
      header: "Vehicle Reg No",
      render: (jc) => (
        <span className="font-medium text-muted-foreground">
          {jc.vehicle?.registrationNumber ?? "—"}
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
      header: "Branch",
      render: (jc) => (
        <span className="text-muted-foreground">{jc.branch?.name ?? "—"}</span>
      ),
    },
    {
      header: "Agent",
      render: (jc) => (
        <span className="text-muted-foreground">
          {jc.createdBy ? jc.createdBy.firstName : <span className="text-border">—</span>}
        </span>
      ),
    },
    {
      header: "Progress",
      render: (jc) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${jc.progress}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">{jc.progress}%</span>
        </div>
      ),
    },
    {
      header: "Status",
      render: (jc) => {
        const tone = STATUS_TONES[jc.status as JobCardStatus] ?? "gray";
        return <StatusBadge status={STATUS_LABELS[jc.status as JobCardStatus] ?? jc.status} tone={tone} />;
      },
    },
  ];

  return (
    <div className="grid gap-4">
      <DataTable<JobCard>
        columns={columns}
        data={data?.jobCards ?? []}
        isLoading={isLoading}
        isFetching={isFetching}
        searchQuery={committedSearch || (statusFilter ? STATUS_LABELS[statusFilter as JobCardStatus] : undefined)}
        rowKey={(jc) => jc.id}
        onRowClick={(jc) => router.push(`/job-cards/${jc.id}`)}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
      >
        <DataTableSearchHeader
          search={search}
          onSearchChange={setSearch}
          onCommitSearch={handleCommitSearch}
          onClearSearch={handleClearSearch}
          placeholder="Search by job #, customer, vehicle..."
          isLoading={isLoading}
          isFetching={isFetching}
        >
          <div className="flex items-center gap-2">
            <DateInput
              value={dateFrom}
              onChange={(v) => { setDateFrom(v); setPage(1); }}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <DateInput
              value={dateTo}
              onChange={(v) => { setDateTo(v); setPage(1); }}
            />
          </div>
          <DataTableFilterChips
            options={[{ label: "All", value: "" }, ...ALL_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s }))]}
            selected={statusFilter}
            onChange={changeFilter}
          />
        </DataTableSearchHeader>
      </DataTable>
    </div>
  );
}
