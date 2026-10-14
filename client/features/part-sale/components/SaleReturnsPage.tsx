"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { useSaleReturns } from "../hooks/use-part-sale";
import { customerName, fmtCurrency, fmtDate } from "../lib/part-sale-format";
import type { SaleReturnListItem } from "../types/part-sale.types";

const PAGE_SIZE = 10;

/** Counter-sale returns (legacy Counter Sale Return screen). Returns are recorded from the bill. */
export function SaleReturnsPage() {
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useSaleReturns({ search: committed || undefined });
  const items = data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<SaleReturnListItem>[] = [
    { header: "Return #", render: (r) => <span className="font-mono text-sm font-medium">{r.returnNumber}</span> },
    {
      header: "Bill #",
      render: (r) => (
        <Link href={`/part-sale/counter-sales/${r.counterSale.id}`} className="font-mono text-sm hover:underline">
          {r.counterSale.invoice.invoiceNumber}
        </Link>
      ),
    },
    {
      header: "Customer",
      render: (r) => (
        <span>
          {customerName(r.customer)}
          {r.customer.code && <span className="block font-mono text-sm text-muted-foreground">{r.customer.code}</span>}
        </span>
      ),
    },
    { header: "Date", className: "whitespace-nowrap", render: (r) => <span className="text-muted-foreground">{fmtDate(r.returnDate)}</span> },
    { header: "Lines", render: (r) => <span className="text-muted-foreground">{r._count.lines}</span> },
    { header: "Credit", render: (r) => <span className="font-medium">{fmtCurrency(r.total)}</span> },
    { header: "Credit note", render: (r) => <span className="font-mono text-sm text-muted-foreground">{r.creditNote?.number ?? "—"}</span> },
    { header: "Reason", render: (r) => <span className="text-muted-foreground">{r.reason ?? "—"}</span> },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Sale Returns"
        description="Parts returned against counter-sale bills. Record a return from the bill; the credit is set off against it."
      />
      {isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">Failed to load sale returns.</CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={paged}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyMessage={committed ? "No returns match." : "No sale returns yet."}
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
            placeholder="Search by return #, bill # or customer…"
          />
        </DataTable>
      )}
    </div>
  );
}
