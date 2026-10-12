"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { STOCK_TAKE_PERMISSIONS } from "@/features/auth/roles";
import { useStockTakes } from "../hooks/use-stock-taking";
import { STATUS_LABELS, STATUS_TONES, TYPE_LABELS, fmtDate, userName } from "../lib/stock-taking-format";
import type { StockTakeListItem, StockTakeStatus } from "../types/stock-taking.types";

const PAGE_SIZE = 10;
const FILTERS = [
  { label: "All", value: "" },
  { label: "Counting", value: "ACTIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "S/E confirmed", value: "CONFIRMED" },
  { label: "Cancelled", value: "CANCELLED" },
];

/** Physical stock taking batches (legacy Batch Creation for Physical Stock Taking and its documents). */
export function StockTakesPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(STOCK_TAKE_PERMISSIONS.MANAGE);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useStockTakes({
    status: (status || undefined) as StockTakeStatus | undefined,
    search: committed || undefined,
  });
  const items = data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<StockTakeListItem>[] = [
    {
      header: "Batch #",
      render: (t) => (
        <Link href={`/inventory/stock-taking/${t.id}`} className="font-mono text-sm font-medium hover:underline">
          {t.batchNumber}
        </Link>
      ),
    },
    { header: "Type", render: (t) => TYPE_LABELS[t.type] },
    { header: "Branch", render: (t) => <span className="text-muted-foreground">{t.branch.name}</span> },
    { header: "Date", className: "whitespace-nowrap", render: (t) => <span className="text-muted-foreground">{fmtDate(t.createdAt)}</span> },
    {
      header: "Counted / parts",
      render: (t) => (
        <span className="text-muted-foreground">
          {t.countedLines} / {t._count.lines}
        </span>
      ),
    },
    { header: "Created by", render: (t) => <span className="text-muted-foreground">{userName(t.createdBy) || "—"}</span> },
    { header: "Status", render: (t) => <StatusBadge status={STATUS_LABELS[t.status]} tone={STATUS_TONES[t.status]} /> },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (t) => (
        <DataTableRowActions
          item={t}
          actions={[{ id: "view", label: "View details", icon: <Eye className="size-4" />, onClick: () => router.push(`/inventory/stock-taking/${t.id}`) }]}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Stock Taking"
        description="Physical stock taking, annual or perpetual. Issue count sheets to checkers, compare the count with system stock, then confirm the shortage and excess."
        actions={
          canManage && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/inventory/stock-taking/new">
                <Plus className="size-4" />
                New batch
              </Link>
            </Button>
          )
        }
      />

      {isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">Failed to load stock takings.</CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={paged}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyMessage={committed || status ? "No stock takings match." : "No stock takings yet. Use New batch to start one."}
          rowKey={(t) => t.id}
          page={page}
          pageSize={PAGE_SIZE}
          total={items.length}
          totalPages={totalPages}
          onPageChange={setPage}
        >
          <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            onSearch={() => {
              setCommitted(search.trim());
              setPage(1);
            }}
            onClearSearch={() => {
              setSearch("");
              setCommitted("");
              setPage(1);
            }}
            placeholder="Search by batch #, sheet # or part number…"
            filters={
              <DataTableFilterChips
                options={FILTERS}
                selected={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
              />
            }
          />
        </DataTable>
      )}
    </div>
  );
}
