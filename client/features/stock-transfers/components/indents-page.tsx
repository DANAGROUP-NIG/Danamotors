"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Ban,
  CheckCircle,
  ChevronDown,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  Link2,
  PackageCheck,
  Plus,
  Send,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { PageHeader } from "@/components/headers/page-header";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import { copyToClipboard, downloadCsv, downloadExcel } from "@/lib/table-actions";
import { useIndents } from "../hooks/use-indents";
import { useSubmitIndent } from "../hooks/use-indent-mutations";
import { useIndentAbilities } from "../hooks/use-indent-abilities";
import {
  INDENT_FILTER_STATUSES,
  INDENT_STATUS_LABELS,
  INDENT_STATUS_TONES,
  fmtDate,
  personName,
} from "../lib/indent-status";
import type { IndentListItem, IndentStatus } from "../types/indent.types";

const PAGE_SIZE = 10;

const STATUS_FILTER_OPTIONS = [
  { label: "All", value: "" },
  ...INDENT_FILTER_STATUSES.map((s) => ({ label: INDENT_STATUS_LABELS[s], value: s })),
];

const EXPORT_COLUMNS = [
  { key: "indentNumber", label: "Indent #" },
  { key: "orderDate", label: "Order Date" },
  { key: "requestingBranch", label: "Requesting Branch" },
  { key: "sourceBranch", label: "Supplying Branch" },
  { key: "lines", label: "Lines" },
  { key: "stnNumber", label: "STN #" },
  { key: "requestedBy", label: "Requested By" },
  { key: "status", label: "Status" },
];

function exportRows(items: IndentListItem[]) {
  return items.map((i) => ({
    indentNumber: i.indentNumber,
    orderDate: fmtDate(i.orderDate),
    requestingBranch: i.requestingBranch.name,
    sourceBranch: i.sourceBranch.name,
    lines: i._count.lines,
    stnNumber: i.stn?.stnNumber ?? "",
    requestedBy: personName(i.requestedBy),
    status: INDENT_STATUS_LABELS[i.status],
  }));
}

export function IndentsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const { canCreate, abilities, myBranchId, crossBranch } = useIndentAbilities();
  const submit = useSubmitIndent();

  const { data, isLoading, isFetching, isError } = useIndents({
    status: (statusFilter || undefined) as IndentStatus | undefined,
    search: committedSearch || undefined,
    page,
    limit: PAGE_SIZE,
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selection = useDataTableSelection<IndentListItem>({ data: items, rowKey: (i) => i.id });

  function changeStatus(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  function commitSearch() {
    setCommittedSearch(search.trim());
    setPage(1);
  }

  function clearSearch() {
    setSearch("");
    setCommittedSearch("");
    setPage(1);
  }

  function exportIndents(list: IndentListItem[], format: "csv" | "excel") {
    const filename = `indents-${new Date().toISOString().split("T")[0]}`;
    const rows = exportRows(list);
    if (format === "csv") downloadCsv(filename, rows, EXPORT_COLUMNS);
    else downloadExcel(filename, rows, EXPORT_COLUMNS);
  }

  const open = (id: string, action?: string) =>
    router.push(`/transfers/indents/${id}${action ? `?action=${action}` : ""}`);

  const columns: Column<IndentListItem>[] = [
    {
      header: "Indent #",
      className: "whitespace-nowrap",
      render: (i) => (
        <Link href={`/transfers/indents/${i.id}`} className="flex items-center gap-2 hover:underline">
          <ArrowLeftRight className="size-4 text-muted-foreground" />
          <span className="font-mono text-sm font-medium">{i.indentNumber}</span>
        </Link>
      ),
    },
    {
      header: "From → To",
      className: "min-w-52",
      render: (i) => (
        <span className="text-muted-foreground">
          {i.sourceBranch.name} → {i.requestingBranch.name}
        </span>
      ),
    },
    {
      header: "Direction",
      render: (i) => {
        if (crossBranch) return <span className="text-muted-foreground">—</span>;
        const outgoing = i.sourceBranchId === myBranchId;
        return (
          <span className={outgoing ? "text-sm font-medium text-purple-700" : "text-sm font-medium text-blue-700"}>
            {outgoing ? "To supply" : "Requested"}
          </span>
        );
      },
    },
    {
      header: "Lines",
      render: (i) => (
        <span className="text-muted-foreground">
          {i._count.lines} {i._count.lines === 1 ? "part" : "parts"}
        </span>
      ),
    },
    {
      header: "STN #",
      render: (i) => <span className="font-mono text-sm text-muted-foreground">{i.stn?.stnNumber ?? "—"}</span>,
    },
    {
      header: "Requested By",
      render: (i) => <span className="text-muted-foreground">{personName(i.requestedBy)}</span>,
    },
    {
      header: "Order Date",
      className: "whitespace-nowrap",
      render: (i) => <span className="text-muted-foreground">{fmtDate(i.orderDate)}</span>,
    },
    {
      header: "Status",
      render: (i) => <StatusBadge status={INDENT_STATUS_LABELS[i.status]} tone={INDENT_STATUS_TONES[i.status]} />,
    },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (i) => {
        const can = abilities(i);
        return (
          <DataTableRowActions
            item={i}
            quickActions={[
              can.submit && {
                id: "submit",
                label: "Submit",
                icon: <Send className="size-4" />,
                disabled: submit.isPending,
                onClick: () => submit.mutate(i.id),
              },
              can.approve && {
                id: "approve",
                label: "Approve",
                icon: <CheckCircle className="size-4" />,
                onClick: () => open(i.id, "approve"),
              },
              can.dispatch && {
                id: "dispatch",
                label: "Dispatch",
                icon: <Truck className="size-4" />,
                onClick: () => open(i.id, "dispatch"),
              },
              can.receive && {
                id: "receive",
                label: "Receive",
                icon: <PackageCheck className="size-4" />,
                onClick: () => open(i.id, "receive"),
              },
            ]}
            actions={[
              { id: "view", label: "View details", icon: <Eye className="size-4" />, onClick: () => open(i.id) },
              {
                id: "copy-link",
                label: "Copy link",
                icon: <Link2 className="size-4" />,
                onClick: () =>
                  copyToClipboard(`${window.location.origin}/transfers/indents/${i.id}`, "Indent link copied"),
              },
              {
                id: "download",
                label: "Download CSV",
                icon: <Download className="size-4" />,
                onClick: () => exportIndents([i], "csv"),
              },
              can.cancel && {
                id: "cancel",
                label: "Cancel",
                icon: <Ban className="size-4" />,
                destructive: true,
                onClick: () => open(i.id, "cancel"),
              },
            ]}
          />
        );
      },
    },
  ];

  if (isError) {
    return (
      <div className="flex flex-col gap-5 p-4 lg:p-6">
        <PageHeader title="Stock Transfers" description="CPD and inter-branch transfers" />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-red-500">Failed to load indents.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Stock Transfers"
        description={
          data
            ? `${total} ${total === 1 ? "indent" : "indents"} · request, approve, dispatch and receive stock between branches`
            : "CPD and inter-branch transfers"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/transfers/legacy">
                <History className="size-4" />
                Earlier transfers
              </Link>
            </Button>
            <ActionMenu
              align="end"
              trigger={
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="size-4" />
                  Export
                  <ChevronDown className="size-3.5" />
                </Button>
              }
            >
              <ActionMenuItem icon={<Download />} onClick={() => exportIndents(items, "csv")}>
                Export CSV
              </ActionMenuItem>
              <ActionMenuItem icon={<FileSpreadsheet />} onClick={() => exportIndents(items, "excel")}>
                Export Excel
              </ActionMenuItem>
            </ActionMenu>
            {canCreate && (
              <Button asChild size="sm" className="gap-1.5">
                <Link href="/transfers/new">
                  <Plus className="size-4" />
                  New indent
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          statusFilter
            ? `No ${INDENT_STATUS_LABELS[statusFilter as IndentStatus].toLowerCase()} indents`
            : committedSearch
              ? "No indents match your search."
              : "No indents yet. Create one to request stock from CPD or another branch."
        }
        rowKey={(i) => i.id}
        skeletonRowCount={5}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
        selection={selection}
      >
        <div className="flex flex-col gap-4">
          <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            onSearch={commitSearch}
            onClearSearch={clearSearch}
            placeholder="Search by indent #, STN #, part # or reg no…"
            filters={
              <DataTableFilterChips options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={changeStatus} />
            }
          />
          <DataTableBulkToolbar
            selectedCount={selection.selectedIds.size}
            totalCount={total}
            selectedItems={selection.selectedItems}
            onClear={selection.clear}
            actions={[
              { id: "export", label: "CSV", icon: <Download />, onClick: (list) => exportIndents(list, "csv") },
              { id: "excel", label: "Excel", icon: <FileSpreadsheet />, onClick: (list) => exportIndents(list, "excel") },
            ]}
          />
        </div>
      </DataTable>
    </div>
  );
}
