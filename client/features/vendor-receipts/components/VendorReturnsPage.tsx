"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { fmtDate, fmtNaira } from "@/features/mobis-receipts/lib/mobis-labels";
import { useVendorReturns } from "../hooks/use-vendor-receipts";
import type { VendorReturnListItem } from "../types/vendor-receipt.types";

const PAGE_SIZE = 10;

/** Parts sent back to vendors against vendor MRNs (legacy MRN Return). */
export function VendorReturnsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useVendorReturns(committed);
  const items = data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<VendorReturnListItem>[] = [
    {
      header: "Return #",
      render: (r) => (
        <Link href={`/inventory/mrn-returns/${r.id}`} className="font-mono text-sm font-medium hover:underline">
          {r.returnNumber}
        </Link>
      ),
    },
    { header: "Date", className: "whitespace-nowrap", render: (r) => <span className="text-muted-foreground">{fmtDate(r.returnDate)}</span> },
    {
      header: "MRN",
      render: (r) => (
        <Link href={`/inventory/mrn/${r.mrn.id}`} className="font-mono text-xs hover:underline">
          {r.mrn.mrnNumber}
        </Link>
      ),
    },
    { header: "Vendor", render: (r) => <span>{r.vendorName}</span> },
    { header: "Branch", render: (r) => <span className="text-muted-foreground">{r.branch.name}</span> },
    { header: "Lines / Qty", render: (r) => <span className="text-muted-foreground">{r._count.lines} / {r.totalQuantity}{r.fullReturn ? " (full)" : ""}</span> },
    { header: "Amount", render: (r) => <span className="text-muted-foreground">{fmtNaira(r.netAmount)}</span> },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (r) => (
        <DataTableRowActions
          item={r}
          actions={[{ id: "view", label: "View details", icon: <Eye className="size-4" />, onClick: () => router.push(`/inventory/mrn-returns/${r.id}`) }]}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="MRN returns"
        description="Parts sent back to vendors against an MRN. To make one, open the MRN and use Return to vendor."
      />
      {isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">Failed to load MRN returns.</CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={paged}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyMessage={committed ? "No MRN returns match." : "No MRN returns yet."}
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
            placeholder="Search by return #, MRN #, invoice, vendor or part number…"
          />
        </DataTable>
      )}
    </div>
  );
}
