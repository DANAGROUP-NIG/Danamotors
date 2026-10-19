"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Send, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { useStns } from "../hooks/use-stns";
import { STN_STATUS_LABELS, STN_STATUS_TONES, fmtCurrency, fmtDate } from "../lib/indent-status";
import type { StnListItem } from "../types/indent.types";

const PAGE_SIZE = 10;
const FILTERS = [
  { label: "All", value: "" },
  { label: "In transit", value: "DISPATCHED" },
  { label: "Partly received", value: "PARTIALLY_RECEIVED" },
  { label: "Received", value: "RECEIVED" },
];

/** Register of stock transfer notes: indent STNs, multi-indent STNs and direct STNs. */
export function StnsPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canDispatch = hasPermission(INVENTORY_PERMISSIONS.TRANSFER_DISPATCH);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useStns({ status: (status || undefined) as StnListItem["status"] | undefined });
  const items = data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<StnListItem>[] = [
    {
      header: "STN #",
      render: (s) => (
        <Link href={`/transfers/stn/${s.id}`} className="font-mono text-sm font-medium hover:underline">
          {s.stnNumber}
        </Link>
      ),
    },
    {
      header: "From → To",
      className: "min-w-52",
      render: (s) => (
        <span className="text-muted-foreground">
          {s.sourceBranch.name} → {s.destinationBranch.name}
        </span>
      ),
    },
    {
      header: "Indents",
      render: (s) =>
        s.indents.length ? (
          <span className="font-mono text-sm text-muted-foreground">{s.indents.map((i) => i.indentNumber).join(", ")}</span>
        ) : (
          <span className="text-sm text-muted-foreground">Direct{s.remarks ? ` · ${s.remarks}` : ""}</span>
        ),
    },
    { header: "Date", className: "whitespace-nowrap", render: (s) => <span className="text-muted-foreground">{fmtDate(s.documentDate)}</span> },
    {
      header: "Qty / value",
      render: (s) => (
        <span className="text-muted-foreground">
          {s.totalQuantity} · {fmtCurrency(s.totalValue)}
        </span>
      ),
    },
    {
      header: "Gate pass",
      render: (s) => <span className="font-mono text-sm text-muted-foreground">{s.packingList?.gatePassNumber ?? "—"}</span>,
    },
    { header: "Status", render: (s) => <StatusBadge status={STN_STATUS_LABELS[s.status]} tone={STN_STATUS_TONES[s.status]} /> },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (s) => (
        <DataTableRowActions
          item={s}
          actions={[{ id: "view", label: "View STN", icon: <Eye className="size-4" />, onClick: () => router.push(`/transfers/stn/${s.id}`) }]}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <Link href="/transfers" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Stock Transfers
      </Link>
      <PageHeader
        title="Stock Transfer Notes"
        description="Every STN between branches: against indents, several indents of one branch together, or direct."
        actions={
          canDispatch && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/transfers/stn/direct">
                  <Send className="size-4" />
                  Direct STN
                </Link>
              </Button>
              <Button asChild size="sm" className="gap-1.5">
                <Link href="/transfers/stn/dispatch">
                  <Truck className="size-4" />
                  Dispatch to branch
                </Link>
              </Button>
            </div>
          )
        }
      />
      {isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">Failed to load STNs.</CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={paged}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyMessage={status ? "No STNs match." : "No STNs yet."}
          rowKey={(s) => s.id}
          page={page}
          pageSize={PAGE_SIZE}
          total={items.length}
          totalPages={totalPages}
          onPageChange={setPage}
        >
          <div className="flex flex-wrap items-center gap-2 p-3">
            <DataTableFilterChips
              options={FILTERS}
              selected={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            />
          </div>
        </DataTable>
      )}
    </div>
  );
}
