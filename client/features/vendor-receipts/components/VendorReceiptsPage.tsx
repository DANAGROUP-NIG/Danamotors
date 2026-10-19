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
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { fmtDate, fmtNaira } from "@/features/mobis-receipts/lib/mobis-labels";
import { useVendorReceipts } from "../hooks/use-vendor-receipts";
import type { VendorReceiptListItem } from "../types/vendor-receipt.types";

const PAGE_SIZE = 10;

/** Local, used and repaired parts (and CPD's non-Mobis purchases) received from vendors on an MRN. */
export function VendorReceiptsPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canReceive = hasPermission(INVENTORY_PERMISSIONS.STOCK_UPDATE);
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useVendorReceipts(committed);
  const items = data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<VendorReceiptListItem>[] = [
    {
      header: "MRN #",
      render: (r) => (
        <Link href={`/inventory/vendor-receipts/${r.id}`} className="font-mono text-sm font-medium hover:underline">
          {r.mrnNumber}
        </Link>
      ),
    },
    { header: "Vendor", render: (r) => <span>{r.vendor}</span> },
    { header: "Vendor invoice", render: (r) => <span className="font-mono text-xs">{r.invoiceNumber}</span> },
    { header: "Invoice date", className: "whitespace-nowrap", render: (r) => <span className="text-muted-foreground">{fmtDate(r.invoiceDate)}</span> },
    { header: "Received", className: "whitespace-nowrap", render: (r) => <span className="text-muted-foreground">{fmtDate(r.receiptDate)}</span> },
    { header: "Branch", render: (r) => <span className="text-muted-foreground">{r.receivingBranch.name}</span> },
    { header: "Lines / Qty", render: (r) => <span className="text-muted-foreground">{r._count.lines} / {r.totalReceived}</span> },
    { header: "Value", render: (r) => <span className="text-muted-foreground">{fmtNaira(r.totalValue)}</span> },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (r) => (
        <DataTableRowActions
          item={r}
          actions={[{ id: "view", label: "View details", icon: <Eye className="size-4" />, onClick: () => router.push(`/inventory/vendor-receipts/${r.id}`) }]}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Vendor receipts"
        description="Parts bought from vendors other than Mobis: local, second-hand and repaired parts. Posting adds the stock and sets each part's dealer and retail rate."
        actions={
          canReceive && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/inventory/vendor-receipts/new">
                <Plus className="size-4" />
                New receipt
              </Link>
            </Button>
          )
        }
      />

      {isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">Failed to load vendor receipts.</CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={paged}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyMessage={committed ? "No vendor receipts match." : "No vendor receipts yet. Use New receipt to post one."}
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
            placeholder="Search by MRN #, vendor, invoice or part number…"
          />
        </DataTable>
      )}

      <p className="text-sm text-muted-foreground">
        Mobis invoices are received under MIT. Returns to vendors are not recorded here yet.
      </p>
    </div>
  );
}
