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
import { useStockTakes } from "../hooks/use-stock-taking";
import { AUDIT_LEVEL_LABELS, KINDS, STATUS_LABELS, STATUS_TONES, TYPE_LABELS, fmtDate, userName } from "../lib/stock-taking-format";
import type { Kind, StockTakeListItem, StockTakeStatus } from "../types/stock-taking.types";

const PAGE_SIZE = 10;
const FILTERS = [
  { label: "All", value: "" },
  { label: "Counting", value: "ACTIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "S/E confirmed", value: "CONFIRMED" },
  { label: "Cancelled", value: "CANCELLED" },
];
// A completed audit is final; it is never S/E confirmed.
const AUDIT_FILTERS = FILTERS.filter((f) => f.value !== "CONFIRMED");

/** Stock taking batches or stock audits (legacy Batch Creation for Physical Stock Taking / Stock Audit and their documents). */
export function StockTakesPage({ kind = "COUNT" }: { kind?: Kind }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const k = KINDS[kind];
  const audit = kind === "AUDIT";
  const canManage = hasPermission(k.permissions.MANAGE);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useStockTakes({
    kind,
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
        <Link href={`${k.base}/${t.id}`} className="font-mono text-sm font-medium hover:underline">
          {t.batchNumber}
        </Link>
      ),
    },
    audit
      ? { header: "Audit", render: (t) => (t.auditLevel ? AUDIT_LEVEL_LABELS[t.auditLevel] : "—") }
      : { header: "Type", render: (t) => TYPE_LABELS[t.type] },
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
    audit
      ? { header: "Auditors", render: (t) => <span className="text-muted-foreground">{t.auditors || "—"}</span> }
      : { header: "Created by", render: (t) => <span className="text-muted-foreground">{userName(t.createdBy) || "—"}</span> },
    { header: "Status", render: (t) => <StatusBadge status={STATUS_LABELS[t.status]} tone={STATUS_TONES[t.status]} /> },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (t) => (
        <DataTableRowActions
          item={t}
          actions={[{ id: "view", label: "View details", icon: <Eye className="size-4" />, onClick: () => router.push(`${k.base}/${t.id}`) }]}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title={k.title}
        description={
          audit
            ? "Internal audit, audit by audit head or by visiting management. Auditors count blind; the audit reports shortage and excess against system stock and never adjusts it."
            : "Physical stock taking, annual or perpetual. Issue count sheets to checkers, compare the count with system stock, then confirm the shortage and excess."
        }
        actions={
          canManage && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href={`${k.base}/new`}>
                <Plus className="size-4" />
                {audit ? "New audit" : "New batch"}
              </Link>
            </Button>
          )
        }
      />

      {isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">Failed to load {audit ? "stock audits" : "stock takings"}.</CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={paged}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyMessage={
            committed || status
              ? `No ${audit ? "stock audits" : "stock takings"} match.`
              : audit
                ? "No stock audits yet. Use New audit to start one."
                : "No stock takings yet. Use New batch to start one."
          }
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
                options={audit ? AUDIT_FILTERS : FILTERS}
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
