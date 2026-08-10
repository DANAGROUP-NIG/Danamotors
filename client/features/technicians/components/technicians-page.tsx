"use client";

import { useEffect, useState } from "react";
import { SearchX, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { PageHeader } from "@/components/headers/page-header";
import { useTechnicians } from "../hooks/use-technicians";
import type { Technician } from "../types/technician.types";

const PAGE_SIZE = 10;

export function TechniciansPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

  const { data, isLoading, isError } = useTechnicians({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
  });

  const technicians = data?.technicians ?? [];

  const columns: Column<Technician>[] = [
    {
      header: "Name",
      render: (t) => (
        <div className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <span className="font-medium">
            {t.firstName} {t.lastName}
            {!t.isActive && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inactive</span>}
          </span>
        </div>
      ),
    },
    {
      header: "Branch",
      render: (t) => <span className="text-muted-foreground">{t.branch?.name ?? "—"}</span>,
    },
    {
      header: "Active Jobs",
      render: (t) => (
        <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          {t._count.technicianAssignments}
        </span>
      ),
    },
    {
      header: "Email",
      render: (t) => <span className="text-muted-foreground">{t.email}</span>,
    },
    {
      header: "Phone",
      render: (t) => <span className="text-muted-foreground">{t.phoneNumber ?? "—"}</span>,
    },
    {
      header: "Joined",
      render: (t) => <span className="text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</span>,
    },
  ];

  if (isError) {
    return (
      <div className="flex flex-col gap-5 p-4 lg:p-6">
        <PageHeader title="Technicians" description="Workshop staff and technician assignments." />
        <Card>
          <CardContent className="py-12 text-center">
            <SearchX className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-red-500">Failed to load technicians.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Technicians"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "technician" : "technicians"} on record`
            : "Workshop staff and technician assignments."
        }
      />

      <DataTable
        columns={columns}
        data={technicians}
        isLoading={isLoading}
        emptyMessage={
          debouncedSearch
            ? "No technicians match your search."
            : "No technicians yet."
        }
        rowKey={(t) => t.id}
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
          placeholder="Search by name or email…"
        />
      </DataTable>
    </div>
  );
}
