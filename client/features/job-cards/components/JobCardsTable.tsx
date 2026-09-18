"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Eye,
  FileSpreadsheet,
  Link2,
  Mail,
  MessageCircle,
  Share2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTableSearchHeader } from "@/components/ui/table-components/DataTableSearchHeader";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DateInput } from "@/components/forms/DateInput";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import {
  copyToClipboard,
  downloadCsv,
  downloadExcel,
  openMailto,
  openWhatsApp,
  shareItems,
} from "@/lib/table-actions";
import { useBranchStore } from "@/store/branch.store";
import { useJobCards } from "../hooks/use-job-cards";
import type { JobCard, JobCardStatus } from "../types/job-card.types";

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<JobCardStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

const STATUS_TONES: Record<JobCardStatus, StatusTone> = {
  pending: "amber",
  in_progress: "blue",
  completed: "emerald",
  on_hold: "gray",
  cancelled: "red",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS).filter(isJobCardStatus);

function isJobCardStatus(status: string): status is JobCardStatus {
  return status in STATUS_LABELS;
}

function formatJobCardText(jobCard: JobCard) {
  const customer = jobCard.customer
    ? `${jobCard.customer.firstName} ${jobCard.customer.lastName}`
    : "N/A";
  return `*Job Card ${jobCard.jobNumber}*\nCustomer: ${customer}\nVehicle: ${jobCard.vehicle?.registrationNumber ?? "N/A"}\nBranch: ${jobCard.branch?.name ?? "N/A"}\nProgress: ${jobCard.progress}%\nStatus: ${STATUS_LABELS[jobCard.status]}`;
}

function exportRows(jobCards: JobCard[]) {
  return jobCards.map((jobCard) => ({
    jobNumber: jobCard.jobNumber,
    vehicleRegistration: jobCard.vehicle?.registrationNumber ?? "",
    customer: jobCard.customer
      ? `${jobCard.customer.firstName} ${jobCard.customer.lastName}`
      : "",
    branch: jobCard.branch?.name ?? "",
    agent: jobCard.createdBy
      ? `${jobCard.createdBy.firstName} ${jobCard.createdBy.lastName}`
      : "",
    progress: jobCard.progress,
    status: STATUS_LABELS[jobCard.status],
    createdAt: jobCard.createdAt,
  }));
}

function exportColumns() {
  return [
    { key: "jobNumber", label: "Job #" },
    { key: "vehicleRegistration", label: "Vehicle Reg No" },
    { key: "customer", label: "Customer" },
    { key: "branch", label: "Branch" },
    { key: "agent", label: "Agent" },
    { key: "progress", label: "Progress (%)" },
    { key: "status", label: "Status" },
    { key: "createdAt", label: "Created At" },
  ];
}

function exportFilename() {
  return `job-cards-${new Date().toISOString().split("T")[0]}`;
}

export function JobCardsTable() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const activeBranch = useBranchStore((s) => s.activeBranch);

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id, statusFilter, committedSearch, dateFrom, dateTo]);

  const { data, isLoading, isError, isFetching } = useJobCards({
    page,
    limit: PAGE_SIZE,
    branchId: activeBranch?.id,
    status: statusFilter || undefined,
    search: committedSearch || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const jobCards = useMemo(() => data?.jobCards ?? [], [data?.jobCards]);
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const router = useRouter();
  const selection = useDataTableSelection<JobCard>({
    data: jobCards,
    rowKey: (jobCard) => jobCard.id,
  });

  function exportSelected(items: JobCard[]) {
    downloadCsv(exportFilename(), exportRows(items), exportColumns());
  }

  function exportSelectedExcel(items: JobCard[]) {
    downloadExcel(exportFilename(), exportRows(items), exportColumns());
  }

  function shareSelected(items: JobCard[]) {
    void shareItems({
      title: `${items.length} Dana Motors Job Card${items.length === 1 ? "" : "s"}`,
      text: items.map(formatJobCardText).join("\n\n---\n\n"),
    });
  }

  function emailSelected(items: JobCard[]) {
    openMailto({
      subject: `${items.length} Job Card${items.length === 1 ? "" : "s"} from Dana Motors`,
      body: items.map(formatJobCardText).join("\n\n---\n\n"),
    });
  }

  function whatsappSelected(items: JobCard[]) {
    openWhatsApp({ message: items.map(formatJobCardText).join("\n\n---\n\n") });
  }

  function changeFilter(s: string) {
    setStatusFilter(s);
    setPage(1);
  }

  function handleCommitSearch() {
    setCommittedSearch(search);
    setPage(1);
  }

  function handleClearSearch() {
    setSearch("");
    setCommittedSearch("");
    setPage(1);
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-red-500">
            Failed to load job cards. Check the API connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  const columns: Column<JobCard>[] = [
    {
      header: "Job #",
      render: (jc) => <span className="font-medium">{jc.jobNumber}</span>,
    },
    {
      header: "Vehicle Reg No",
      render: (jc) => (
        <span className="font-medium text-muted-foreground">
          {jc.vehicle?.registrationNumber ?? "—"}
        </span>
      ),
    },
    {
      header: "Customer",
      render: (jc) => (
        <span className="text-muted-foreground">
          {jc.customer ? `${jc.customer.firstName} ${jc.customer.lastName}` : "—"}
        </span>
      ),
    },
    {
      header: "Branch",
      render: (jc) => (
        <span className="text-muted-foreground">{jc.branch?.name ?? "—"}</span>
      ),
    },
    {
      header: "Agent",
      render: (jc) => (
        <span className="text-muted-foreground">
          {jc.createdBy ? jc.createdBy.firstName : <span className="text-border">—</span>}
        </span>
      ),
    },
    {
      header: "Progress",
      render: (jc) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${jc.progress}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">{jc.progress}%</span>
        </div>
      ),
    },
    {
      header: "Status",
      render: (jc) => (
        <StatusBadge status={STATUS_LABELS[jc.status]} tone={STATUS_TONES[jc.status]} />
      ),
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (jc) => (
        <DataTableRowActions
          item={jc}
          actions={[
            {
              id: "view",
              label: "View details",
              icon: <Eye className="size-4" />,
              onClick: () => router.push(`/job-cards/${jc.id}`),
            },
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([jc]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                void shareItems({
                  title: `Job Card ${jc.jobNumber}`,
                  text: formatJobCardText(jc),
                  url: `${window.location.origin}/job-cards/${jc.id}`,
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Job Card ${jc.jobNumber}`,
                  body: formatJobCardText(jc),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatJobCardText(jc) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              shortcut: "⌘C",
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/job-cards/${jc.id}`,
                  "Job card link copied",
                ),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <DataTable<JobCard>
        columns={columns}
        data={jobCards}
        isLoading={isLoading}
        isFetching={isFetching}
        searchQuery={
          committedSearch ||
          (isJobCardStatus(statusFilter) ? STATUS_LABELS[statusFilter] : undefined)
        }
        rowKey={(jc) => jc.id}
        onRowClick={(jc) => router.push(`/job-cards/${jc.id}`)}
        selection={selection}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
      >
        <div className="flex flex-col gap-4">
          <DataTableSearchHeader
            search={search}
            onSearchChange={setSearch}
            onCommitSearch={handleCommitSearch}
            onClearSearch={handleClearSearch}
            placeholder="Search by job #, customer, vehicle..."
            isLoading={isLoading}
            isFetching={isFetching}
          >
            <div className="flex items-center gap-2">
              <DateInput
                value={dateFrom}
                onChange={(v) => {
                  setDateFrom(v);
                  setPage(1);
                }}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <DateInput
                value={dateTo}
                onChange={(v) => {
                  setDateTo(v);
                  setPage(1);
                }}
              />
            </div>
            <DataTableFilterChips
              options={[
                { label: "All", value: "" },
                ...ALL_STATUSES.map((status) => ({
                  label: STATUS_LABELS[status],
                  value: status,
                })),
              ]}
              selected={statusFilter}
              onChange={changeFilter}
            />
          </DataTableSearchHeader>
          <DataTableBulkToolbar
            selectedCount={selection.selectedIds.size}
            totalCount={total}
            selectedItems={selection.selectedItems}
            onClear={selection.clear}
            actions={[
              {
                id: "export",
                label: "CSV",
                icon: <Download className="size-3.5" />,
                variant: "ghost",
                onClick: exportSelected,
              },
              {
                id: "excel",
                label: "Excel",
                icon: <FileSpreadsheet className="size-3.5" />,
                variant: "ghost",
                onClick: exportSelectedExcel,
              },
              {
                id: "share",
                label: "Share",
                icon: <Share2 className="size-3.5" />,
                variant: "ghost",
                onClick: shareSelected,
              },
              {
                id: "email",
                label: "Email",
                icon: <Mail className="size-3.5" />,
                variant: "ghost",
                onClick: emailSelected,
              },
              {
                id: "whatsapp",
                label: "WhatsApp",
                icon: <MessageCircle className="size-3.5" />,
                variant: "ghost",
                onClick: whatsappSelected,
              },
            ]}
          />
        </div>
      </DataTable>
    </div>
  );
}
