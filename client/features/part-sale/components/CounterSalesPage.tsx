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
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { PART_SALE_PERMISSIONS } from "@/features/auth/roles";
import { useCounterSales } from "../hooks/use-part-sale";
import { BILL_STATUS_TONES, customerName, fmtCurrency, fmtDate } from "../lib/part-sale-format";
import type { CounterSaleListItem } from "../types/part-sale.types";

const PAGE_SIZE = 10;

/** CPD counter-sale bills (legacy Counter Sale screen). */
export function CounterSalesPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canBill = hasPermission(PART_SALE_PERMISSIONS.BILL);
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useCounterSales({ search: committed || undefined });
  const items = data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<CounterSaleListItem>[] = [
    {
      header: "Bill #",
      render: (s) => (
        <Link href={`/part-sale/counter-sales/${s.id}`} className="font-mono text-sm font-medium hover:underline">
          {s.invoice.invoiceNumber}
        </Link>
      ),
    },
    {
      header: "Customer",
      render: (s) => (
        <span>
          {customerName(s.invoice.customer)}
          {s.invoice.customer.code && <span className="block font-mono text-sm text-muted-foreground">{s.invoice.customer.code}</span>}
        </span>
      ),
    },
    { header: "Date", className: "whitespace-nowrap", render: (s) => <span className="text-muted-foreground">{fmtDate(s.invoice.issuedDate)}</span> },
    {
      header: "Lines",
      render: (s) => (
        <span className="text-muted-foreground">
          {s.invoice._count.lines}
          {s._count.returns ? ` · ${s._count.returns} return${s._count.returns === 1 ? "" : "s"}` : ""}
        </span>
      ),
    },
    { header: "Net amount", render: (s) => <span className="font-medium">{fmtCurrency(s.invoice.total)}</span> },
    { header: "Outstanding", render: (s) => <span className="text-muted-foreground">{fmtCurrency(s.invoice.outstandingAmount)}</span> },
    { header: "Status", render: (s) => <StatusBadge status={s.invoice.status} tone={BILL_STATUS_TONES[s.invoice.status] ?? "gray"} /> },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (s) => (
        <DataTableRowActions
          item={s}
          actions={[
            { id: "view", label: "View details", icon: <Eye className="size-4" />, onClick: () => router.push(`/part-sale/counter-sales/${s.id}`) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Counter Sales"
        description="Parts sold from CPD against customer orders. Bills appear in receipts, outstanding and the party ledger like any other bill."
        actions={
          canBill && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/part-sale/counter-sales/new">
                <Plus className="size-4" />
                New counter sale
              </Link>
            </Button>
          )
        }
      />

      {isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">Failed to load counter sales.</CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={paged}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyMessage={committed ? "No counter sales match." : "No counter sales yet. Bill an open customer order to create one."}
          rowKey={(s) => s.id}
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
            placeholder="Search by bill #, customer or CPO #…"
          />
        </DataTable>
      )}
    </div>
  );
}
