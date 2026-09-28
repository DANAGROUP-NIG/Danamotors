"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { useMobisMits } from "../hooks/use-mobis";
import {
  MIT_STATUS_LABELS,
  MIT_STATUS_TONES,
  RECEIVED_MODE_LABELS,
  fmtDate,
  fmtNaira,
  fmtPrice,
} from "../lib/mobis-labels";
import type { MitStatus, MobisMitListItem } from "../types/mobis.types";

const PAGE_SIZE = 10;
const FILTERS = [
  { label: "All", value: "" },
  { label: "Awaiting MRN", value: "IN_TRANSIT" },
  { label: "Received", value: "RECEIVED" },
  { label: "Cancelled", value: "CANCELLED" },
];

/** Mobis purchase receiving: invoices imported as MIT, then posted to stock with an MRN. */
export function MobisReceiptsPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canUpload = hasPermission(INVENTORY_PERMISSIONS.STOCK_UPDATE);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useMobisMits({
    status: (status || undefined) as MitStatus | undefined,
    search: committed || undefined,
  });
  const items = data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<MobisMitListItem>[] = [
    {
      header: "MIT #",
      render: (m) => (
        <Link href={`/inventory/mobis-receipts/${m.id}`} className="font-mono text-xs font-medium hover:underline">
          {m.mitNumber}
        </Link>
      ),
    },
    { header: "Mobis invoice", render: (m) => <span className="font-mono text-xs">{m.invoiceNumber}</span> },
    { header: "Received", render: (m) => <span className="text-muted-foreground">{fmtDate(m.physicalReceiptDate)}</span> },
    {
      header: "Mode",
      render: (m) => <span className="text-muted-foreground">{m.receivedMode ? RECEIVED_MODE_LABELS[m.receivedMode] : "—"}</span>,
    },
    {
      header: "Lines / Qty",
      render: (m) => (
        <span className="text-muted-foreground">
          {m._count.lines} / {m.totalQuantity}
          {m.totalCases ? ` · ${m.totalCases} case${m.totalCases === 1 ? "" : "s"}` : ""}
        </span>
      ),
    },
    {
      header: "Invoice value",
      render: (m) => (
        <span className="text-muted-foreground">
          {fmtPrice(m.totalAmount)}
          <span className="block text-xs">{fmtNaira(m.totalAmount * m.conversionRate)} @ {m.conversionRate}</span>
        </span>
      ),
    },
    {
      header: "MRN #",
      render: (m) => <span className="font-mono text-xs text-muted-foreground">{m.mrn?.mrnNumber ?? "—"}</span>,
    },
    { header: "Status", render: (m) => <StatusBadge status={MIT_STATUS_LABELS[m.status]} tone={MIT_STATUS_TONES[m.status]} /> },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (m) => (
        <DataTableRowActions
          item={m}
          actions={[
            { id: "view", label: "View details", icon: <Eye className="size-4" />, onClick: () => router.push(`/inventory/mobis-receipts/${m.id}`) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Mobis Receipts"
        description="Parts bought from Mobis: upload the invoice (MIT format), check the shipment, then post it to CPD stock with an MRN."
        actions={
          canUpload && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/inventory/mobis-receipts/new">
                <Upload className="size-4" />
                Upload MIT
              </Link>
            </Button>
          )
        }
      />

      {isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">Failed to load Mobis receipts.</CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={paged}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyMessage={
            committed || status ? "No Mobis invoices match." : "No Mobis invoices yet. Use Upload MIT to import one."
          }
          rowKey={(m) => m.id}
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
            placeholder="Search by MIT #, invoice, Mobis order or part number…"
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

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileSpreadsheet className="size-3.5" />
        Only Mobis invoices are uploaded. Transfers between branches need no files: they are shared in the app.
      </p>
    </div>
  );
}
