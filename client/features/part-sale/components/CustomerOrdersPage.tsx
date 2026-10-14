"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Plus, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { PART_SALE_PERMISSIONS } from "@/features/auth/roles";
import { useCustomerOrders } from "../hooks/use-part-sale";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES, customerName, fmtCurrency, fmtDate } from "../lib/part-sale-format";
import type { CustomerOrderListItem, CustomerOrderStatus } from "../types/part-sale.types";

const PAGE_SIZE = 10;
const FILTERS = [
  { label: "All", value: "" },
  { label: "Open", value: "OPEN" },
  { label: "Partly billed", value: "PARTLY_BILLED" },
  { label: "Billed", value: "BILLED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const sum = (o: CustomerOrderListItem, key: "pickedQuantity" | "billedQuantity") => o.lines.reduce((s, l) => s + l[key], 0);

/** CPD customer purchase orders (legacy Customer Purchase Order and Pick List screens). */
export function CustomerOrdersPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canOrder = hasPermission(PART_SALE_PERMISSIONS.ORDER);
  const canBill = hasPermission(PART_SALE_PERMISSIONS.BILL);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useCustomerOrders({
    status: (status || undefined) as CustomerOrderStatus | undefined,
    search: committed || undefined,
  });
  const items = data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const billable = (o: CustomerOrderListItem) => o.status === "OPEN" || o.status === "PARTLY_BILLED";

  const columns: Column<CustomerOrderListItem>[] = [
    {
      header: "CPO #",
      render: (o) => (
        <Link href={`/part-sale/orders/${o.id}`} className="font-mono text-sm font-medium hover:underline">
          {o.cpoNumber}
        </Link>
      ),
    },
    {
      header: "Customer",
      render: (o) => (
        <span>
          {customerName(o.customer)}
          {o.customer.code && <span className="block font-mono text-sm text-muted-foreground">{o.customer.code}</span>}
        </span>
      ),
    },
    { header: "Customer ref.", render: (o) => <span className="text-muted-foreground">{o.customerRefNo ?? "—"}</span> },
    { header: "Date", className: "whitespace-nowrap", render: (o) => <span className="text-muted-foreground">{fmtDate(o.orderDate)}</span> },
    {
      header: "Ordered / picked / billed",
      render: (o) => (
        <span className="text-muted-foreground">
          {o.totalQuantity} / {sum(o, "pickedQuantity")} / {sum(o, "billedQuantity")}
        </span>
      ),
    },
    { header: "Value", render: (o) => <span className="text-muted-foreground">{fmtCurrency(o.totalAmount)}</span> },
    { header: "Status", render: (o) => <StatusBadge status={ORDER_STATUS_LABELS[o.status]} tone={ORDER_STATUS_TONES[o.status]} /> },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (o) => (
        <DataTableRowActions
          item={o}
          actions={[
            { id: "view", label: "View details", icon: <Eye className="size-4" />, onClick: () => router.push(`/part-sale/orders/${o.id}`) },
            ...(canBill && billable(o)
              ? [
                  {
                    id: "bill",
                    label: "Bill (counter sale)",
                    icon: <ReceiptText className="size-4" />,
                    onClick: () => router.push(`/part-sale/counter-sales/new?orderId=${o.id}`),
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Customer Orders"
        description="CPD customer purchase orders (CPO). Pick stock against an order, then bill it as a counter sale."
        actions={
          canOrder && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/part-sale/orders/new">
                <Plus className="size-4" />
                New CPO
              </Link>
            </Button>
          )
        }
      />

      {isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">Failed to load customer orders.</CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={paged}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyMessage={committed || status ? "No orders match." : "No customer orders yet. Use New CPO to create one."}
          rowKey={(o) => o.id}
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
            placeholder="Search by CPO #, customer, reference or part number…"
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
