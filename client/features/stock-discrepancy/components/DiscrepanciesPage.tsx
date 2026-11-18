"use client";

import Link from "next/link";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { usePendingDiscrepancies } from "../hooks";
import { receiptLink, type PendingDiscrepancy } from "../types";
import { ApproveDiscrepancyButton } from "./DiscrepancyPanel";

const documentLabel = (row: PendingDiscrepancy) =>
  row.source === "MOBIS"
    ? `MIT ${row.mit?.mitNumber ?? ""}${row.mit?.invoiceNumber ? ` · invoice ${row.mit.invoiceNumber}` : ""}`
    : `STN ${row.stn?.stnNumber ?? ""}${row.sourceBranch ? ` from ${row.sourceBranch.name}` : ""}`;

/** Legacy S/E approval: Mobis and branch-transfer receipts whose shortage or damage still waits for approval. */
export function DiscrepanciesPage() {
  const { hasPermission } = useAuth();
  const allowed = hasPermission(INVENTORY_PERMISSIONS.STOCK_DISCREPANCY_APPROVE);
  const query = usePendingDiscrepancies(allowed);
  const items = query.data?.items ?? [];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Shortage Approvals"
        description={query.data
          ? `${items.length} MIT or STN ${items.length === 1 ? "receipt" : "receipts"} with damaged or short units waiting for approval. Stock was posted at receipt.`
          : "MIT and STN receipts with damaged or short units wait here for approval. Stock was posted at receipt."} />

      {!allowed ? (
        <p className="text-sm text-muted-foreground">You do not have permission to approve shortages.</p>
      ) : query.isError ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load the receipts.
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>Retry</Button>
        </div>
      ) : (
        <DataTable
          data={items}
          rowKey={(row) => row.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          emptyMessage="Nothing waiting: every shortage has been approved."
          columns={[
            { header: "MRN", className: "whitespace-nowrap font-mono text-sm", render: (row) => row.mrnNumber },
            {
              header: "Received against",
              render: (row) => <Link href={receiptLink(row)} className="text-primary hover:underline">{documentLabel(row)}</Link>,
            },
            { header: "Branch", render: (row) => row.receivingBranch.name },
            { header: "Date", className: "whitespace-nowrap", render: (row) => new Date(row.receiptDate).toLocaleDateString() },
            { header: "Received", className: "text-right tabular-nums", headerClassName: "text-right", render: (row) => row.totalReceived },
            { header: "Damaged", className: "text-right tabular-nums text-amber-700", headerClassName: "text-right", render: (row) => row.totalDamaged },
            { header: "Short", className: "text-right tabular-nums text-amber-700", headerClassName: "text-right", render: (row) => row.totalShort },
            { header: "Received by", render: (row) => (row.receivedBy ? `${row.receivedBy.firstName} ${row.receivedBy.lastName}` : "—") },
            {
              header: <span className="sr-only">Approve</span>,
              className: "text-right",
              render: (row) => <ApproveDiscrepancyButton mrn={row} />,
            },
          ]} />
      )}
    </div>
  );
}
