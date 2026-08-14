"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ModalFame from "@/components/modals/ModalFame";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { useServices } from "../hooks/use-services";
import { ServiceEditForm } from "./ServiceEditForm";
import { ServiceDeleteButton } from "./ServiceDeleteButton";
import type { ServiceItem } from "../types/service-catalog.types";

const PAGE_SIZE = 10;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(amount);
}

export function ServicesTable() {
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading, isError, isFetching } = useServices({
    page,
    limit: PAGE_SIZE,
    search: committedSearch || undefined,
  });
  const services = data?.services ?? [];
  const meta = data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  const editingService =
    services.find((s) => s.id === editingId) ?? null;

  function commitSearch() {
    setPage(1);
    setCommittedSearch(search);
  }
  function clearSearch() {
    setSearch("");
    setCommittedSearch("");
    setPage(1);
  }

  const columns: Column<ServiceItem>[] = [
    {
      header: "Name",
      render: (s) => <span className="font-medium">{s.name}</span>,
    },
    {
      header: "Category",
      render: (s) => (
        <span className="text-muted-foreground">
          {s.category ?? <span className="text-border">—</span>}
        </span>
      ),
    },
    {
      header: "Duration",
      render: (s) => (
        <span className="text-muted-foreground">
          {s.durationMins != null ? `${s.durationMins} min` : "—"}
        </span>
      ),
    },
    {
      header: "Price",
      render: (s) => <span className="text-muted-foreground">{formatCurrency(s.price)}</span>,
    },
    {
      header: "Bookings",
      render: (s) => (
        <span className="text-muted-foreground">{s.appointmentsCount ?? 0}</span>
      ),
    },
    {
      header: "Status",
      render: (s) => (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            s.isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700",
          )}
        >
          {s.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      render: (s) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label={`Edit ${s.name}`}
            onClick={() => setEditingId(s.id)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <ServiceDeleteButton service={s} />
        </div>
      ),
    },
  ];

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-red-500">
            Failed to load services. Check the API connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={services}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          committedSearch
            ? `No services matching "${committedSearch}"`
            : "No services yet. Add one above."
        }
        rowKey={(s) => s.id}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
      >
        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          onSearch={commitSearch}
          onClearSearch={clearSearch}
          placeholder="Search services…"
          isLoading={isLoading}
          isFetching={isFetching}
        />
      </DataTable>

      <ModalFame
        isOpen={!!editingId}
        onClose={() => setEditingId(null)}
        title="Edit service"
      >
        {editingService && (
          <ServiceEditForm
            service={editingService}
            onSuccess={() => setEditingId(null)}
          />
        )}
      </ModalFame>
    </>
  );
}
