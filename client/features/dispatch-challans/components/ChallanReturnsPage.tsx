"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { customerName, fmtCurrency, fmtDate } from "@/features/part-sale/lib/part-sale-format";
import { useChallanReturns } from "../hooks/use-challans";
import type { ChallanReturnListItem } from "../types/challan.types";

const PAGE_SIZE = 10;

/** Legacy Dispatch Challan Return. Returns are recorded from the challan. */
export function ChallanReturnsPage() {
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useChallanReturns({ search: committed || undefined });
  const items = data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<ChallanReturnListItem>[] = [
    {
      header: "Return #",
      render: (r) => (
        <span className="font-mono text-sm font-medium">
          {r.returnNumber}
          {r.fullReturn && <span className="ml-1.5 text-xs font-normal text-muted-foreground">full</span>}
        </span>
      ),
    },
    {
      header: "Challan #",
      render: (r) => (
        <Link href={`/part-sale/challans/${r.challan.id}`} className="font-mono text-sm hover:underline">
          {r.challan.challanNumber}
        </Link>
      ),
    },
    {
      header: "Cost centre",
      render: (r) => (
        <span>
          {customerName(r.challan.customer)}
          {r.challan.customer.code && <span className="block font-mono text-sm text-muted-foreground">{r.challan.customer.code}</span>}
        </span>
      ),
    },
    { header: "Date", className: "whitespace-nowrap", render: (r) => <span className="text-muted-foreground">{fmtDate(r.returnDate)}</span> },
    { header: "Qty", render: (r) => <span className="text-muted-foreground">{r.totalQuantity}</span> },
    { header: "Value", render: (r) => <span className="font-medium">{fmtCurrency(r.totalAmount)}</span> },
    { header: "Reason", render: (r) => <span className="text-muted-foreground">{r.reason ?? "—"}</span> },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader title="Challan Returns" description="Parts returned against dispatch challans. Record a return from the challan; the stock goes back." />
      {isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">Failed to load challan returns.</CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={paged}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyMessage={committed ? "No returns match." : "No challan returns yet."}
          rowKey={(r) => r.id}
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
            placeholder="Search by return # or challan #…"
          />
        </DataTable>
      )}
    </div>
  );
}
