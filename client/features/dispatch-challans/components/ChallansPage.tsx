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
import { CHALLAN_PERMISSIONS } from "@/features/auth/roles";
import { customerName, fmtCurrency, fmtDate } from "@/features/part-sale/lib/part-sale-format";
import { useChallans } from "../hooks/use-challans";
import { challanStatus } from "./ChallanDetail";
import type { ChallanListItem } from "../types/challan.types";

const PAGE_SIZE = 10;

/** Legacy Dispatch Challan: unbilled issues of fuel and consumables to cost centres. */
export function ChallansPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canIssue = hasPermission(CHALLAN_PERMISSIONS.ISSUE);
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useChallans({ search: committed || undefined });
  const items = data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<ChallanListItem>[] = [
    {
      header: "Challan #",
      render: (c) => (
        <Link href={`/part-sale/challans/${c.id}`} className="font-mono text-sm font-medium hover:underline">
          {c.challanNumber}
        </Link>
      ),
    },
    {
      header: "Cost centre",
      render: (c) => (
        <span>
          {customerName(c.customer)}
          {c.customer.code && <span className="block font-mono text-sm text-muted-foreground">{c.customer.code}</span>}
        </span>
      ),
    },
    { header: "Date", className: "whitespace-nowrap", render: (c) => <span className="text-muted-foreground">{fmtDate(c.challanDate)}</span> },
    {
      header: "Parts",
      render: (c) => (
        <span className="text-muted-foreground">
          {c.lineCount === 1 ? (c.firstPartName ?? c.parts[0]) : `${c.parts[0]} +${c.lineCount - 1} more`}
        </span>
      ),
    },
    { header: "Qty", render: (c) => <span className="text-muted-foreground">{c.totalQuantity}</span> },
    { header: "Value", render: (c) => <span className="font-medium">{fmtCurrency(c.totalAmount)}</span> },
    { header: "Gate pass", render: (c) => <span className="font-mono text-sm text-muted-foreground">{c.gatePassNumber}</span> },
    {
      header: "Status",
      render: (c) => {
        const s = challanStatus(c.totalQuantity, c.returnedQuantity);
        return <StatusBadge status={s.label} tone={s.tone} />;
      },
    },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (c) => (
        <DataTableRowActions
          item={c}
          actions={[{ id: "view", label: "View details", icon: <Eye className="size-4" />, onClick: () => router.push(`/part-sale/challans/${c.id}`) }]}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Dispatch Challans"
        description="Fuel and consumables issued to internal cost centres (vehicles, PDI, Allen 5, gensets…). Never billed: the stock goes out at retail rate with a gate pass."
        actions={
          canIssue && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/part-sale/challans/new">
                <Plus className="size-4" />
                New challan
              </Link>
            </Button>
          )
        }
      />

      {isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">Failed to load dispatch challans.</CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={paged}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyMessage={committed ? "No challans match." : "No dispatch challans yet."}
          rowKey={(c) => c.id}
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
            placeholder="Search by challan #, gate pass, cost centre or part #…"
          />
        </DataTable>
      )}
    </div>
  );
}
