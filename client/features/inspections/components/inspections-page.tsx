"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, SearchX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { PageHeader } from "@/components/headers/page-header";
import { useInspections } from "../hooks/use-inspections";
import type { Inspection } from "../types/inspection.types";

const PAGE_SIZE = 10;

const STATUS_FILTERS = ["", "Pending", "Passed", "Failed", "Completed"] as const;
const STATUS_LABELS: Record<string, string> = {
  "": "All",
  Pending: "Pending",
  Passed: "Passed",
  Failed: "Failed",
  Completed: "Completed",
};
const STATUS_FILTER_OPTIONS = STATUS_FILTERS.map((s) => ({ label: STATUS_LABELS[s], value: s }));

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700",
  Passed: "bg-emerald-50 text-emerald-700",
  Failed: "bg-red-50 text-red-600",
  Completed: "bg-blue-50 text-blue-700",
};

export function InspectionsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

  const { data, isLoading, isError } = useInspections({
    page,
    limit: PAGE_SIZE,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
  });

  const inspections = data?.inspections ?? [];

  const columns: Column<Inspection>[] = [
    {
      header: "Report",
      render: (i) => (
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{new Date(i.createdAt).toLocaleDateString()}</span>
        </div>
      ),
    },
    {
      header: "Job #",
      render: (i) => <span className="font-mono text-xs font-medium">{i.jobCard.jobNumber}</span>,
    },
    {
      header: "Vehicle",
      render: (i) => (
        <span className="text-muted-foreground">
          {[i.jobCard.vehicle.make, i.jobCard.vehicle.model].filter(Boolean).join(" ") || i.jobCard.vehicle.vin}
          {i.jobCard.vehicle.registrationNumber ? ` · ${i.jobCard.vehicle.registrationNumber}` : ""}
        </span>
      ),
    },
    {
      header: "Findings",
      render: (i) => (
        <span className="line-clamp-1 max-w-[260px] text-muted-foreground">{i.findings}</span>
      ),
    },
    {
      header: "Outcome",
      render: (i) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[i.status] || ""}`}>
          {i.status}
        </span>
      ),
    },
  ];

  if (isError) {
    return (
      <div className="flex flex-col gap-5 p-4 lg:p-6">
        <PageHeader title="Inspections" description="Vehicle inspection reports and findings." />
        <Card>
          <CardContent className="py-12 text-center">
            <SearchX className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-red-500">Failed to load inspections.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Inspections"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "inspection" : "inspections"} on record`
            : "Vehicle inspection reports and findings."
        }
      />

      <DataTable
        columns={columns}
        data={inspections}
        isLoading={isLoading}
        emptyMessage={
          statusFilter || debouncedSearch
            ? "No inspections match the current filters."
            : "No inspection reports yet."
        }
        rowKey={(i) => i.id}
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
          placeholder="Search by job # or findings…"
          filters={<DataTableFilterChips options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />}
        />
      </DataTable>
    </div>
  );
}
