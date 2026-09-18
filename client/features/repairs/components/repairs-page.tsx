"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SearchX,
  Wrench,
  Download,
  Share2,
  Mail,
  MessageCircle,
  Link2,
  Eye,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { PageHeader } from "@/components/headers/page-header";
import { useBranchStore } from "@/store/branch.store";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import {
  downloadCsv,
  downloadExcel,
  shareItems,
  openMailto,
  openWhatsApp,
  copyToClipboard,
} from "@/lib/table-actions";
import { useRepairs } from "../hooks/use-repairs";
import type { JobCard, JobCardStatus } from "@/features/job-cards";

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

const ALL_STATUSES = Object.keys(STATUS_LABELS) as JobCardStatus[];

function formatRepairText(jc: JobCard) {
  const vehicle = [jc.vehicle?.make, jc.vehicle?.model].filter(Boolean).join(" ") || "—";
  const registration = jc.vehicle?.registrationNumber;
  const customer = jc.customer
    ? `${jc.customer.firstName} ${jc.customer.lastName}`
    : "—";
  const technician = jc.technician
    ? `${jc.technician.firstName} ${jc.technician.lastName}`
    : "—";

  return `*${jc.jobNumber}*\nVehicle: ${vehicle}${registration ? ` · ${registration}` : ""}\nCustomer: ${customer}\nFault: ${jc.description}\nTechnician: ${technician}\nStatus: ${STATUS_LABELS[jc.status] ?? jc.status}`;
}

function exportColumns() {
  return [
    { key: "jobNumber", label: "Job #" },
    { key: "vehicle", label: "Vehicle" },
    { key: "registrationNumber", label: "Reg No" },
    { key: "customer", label: "Customer" },
    { key: "technician", label: "Technician" },
    { key: "fault", label: "Fault" },
    { key: "status", label: "Status" },
    { key: "started", label: "Started" },
  ];
}

function exportRows(items: JobCard[]) {
  return items.map((jc) => ({
    jobNumber: jc.jobNumber,
    vehicle: [jc.vehicle?.make, jc.vehicle?.model].filter(Boolean).join(" ") || "",
    registrationNumber: jc.vehicle?.registrationNumber ?? "",
    customer: jc.customer
      ? `${jc.customer.firstName} ${jc.customer.lastName}`
      : "",
    technician: jc.technician
      ? `${jc.technician.firstName} ${jc.technician.lastName}`
      : "",
    fault: jc.description,
    status: STATUS_LABELS[jc.status] ?? jc.status,
    started: new Date(jc.createdAt).toLocaleDateString(),
  }));
}

function exportSelected(items: JobCard[]) {
  const filename = `dana-motors-repairs-${new Date().toISOString().split("T")[0]}`;
  downloadCsv(filename, exportRows(items), exportColumns());
}

function exportSelectedExcel(items: JobCard[]) {
  const filename = `dana-motors-repairs-${new Date().toISOString().split("T")[0]}`;
  downloadExcel(filename, exportRows(items), exportColumns());
}

function shareSelected(items: JobCard[]) {
  const text = items.map(formatRepairText).join("\n\n---\n\n");
  shareItems({
    title: `${items.length} Dana Motors Repair${items.length === 1 ? "" : "s"}`,
    text,
  });
}

function emailSelected(items: JobCard[]) {
  const body = items.map(formatRepairText).join("\n\n---\n\n");
  openMailto({
    subject: `${items.length} Repair${items.length === 1 ? "" : "s"} from Dana Motors`,
    body,
  });
}

function whatsappSelected(items: JobCard[]) {
  const message = items.map(formatRepairText).join("\n\n---\n\n");
  openWhatsApp({ message });
}

function RepairsExportButton({
  branchId,
  status,
  search,
}: {
  branchId?: string;
  status?: string;
  search?: string;
}) {
  const { data } = useRepairs({
    page: 1,
    limit: 1000,
    branchId,
    status,
    search,
  });
  const allRepairs = data?.jobCards ?? [];
  const filename = `dana-motors-repairs-${new Date().toISOString().split("T")[0]}`;

  return (
    <ActionMenu
      align="end"
      trigger={
        <Button
          variant="outline"
          size="sm"
          disabled={allRepairs.length === 0}
          className="h-9 gap-1.5"
        >
          <Download className="size-4" />
          Export
        </Button>
      }
    >
      <ActionMenuItem
        icon={<Download className="size-4" />}
        onClick={() => downloadCsv(filename, exportRows(allRepairs), exportColumns())}
      >
        Export as CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() => downloadExcel(filename, exportRows(allRepairs), exportColumns())}
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function RepairsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const router = useRouter();

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch, activeBranch?.id]);

  function commitSearch() {
    setDebouncedSearch(search);
    setPage(1);
  }
  function clearSearch() {
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  }
  function changeFilter(s: string) {
    setStatusFilter(s);
    setPage(1);
  }

  const { data, isLoading, isFetching, isError } = useRepairs({
    page,
    limit: PAGE_SIZE,
    branchId: activeBranch?.id,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
  });

  const repairs = useMemo(() => data?.jobCards ?? [], [data?.jobCards]);

  const selection = useDataTableSelection<JobCard>({
    data: repairs,
    rowKey: (jc) => jc.id,
  });

  const columns: Column<JobCard>[] = [
    {
      header: "Job #",
      render: (jc) => (
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" />
          <span className="font-mono text-xs font-medium">{jc.jobNumber}</span>
        </div>
      ),
    },
    {
      header: "Vehicle",
      render: (jc) => (
        <span className="text-muted-foreground">
          {[jc.vehicle?.make, jc.vehicle?.model].filter(Boolean).join(" ") || "—"}
          {jc.vehicle?.registrationNumber ? ` · ${jc.vehicle.registrationNumber}` : ""}
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
      header: "Fault",
      render: (jc) => (
        <span className="line-clamp-1 max-w-[240px] text-muted-foreground">{jc.description}</span>
      ),
    },
    {
      header: "Technician",
      render: (jc) => (
        <span className="text-muted-foreground">
          {jc.technician ? `${jc.technician.firstName} ${jc.technician.lastName}` : "—"}
        </span>
      ),
    },
    {
      header: "Started",
      render: (jc) => (
        <span className="text-muted-foreground">{new Date(jc.createdAt).toLocaleDateString()}</span>
      ),
    },
    {
      header: "Status",
      render: (jc) => {
        const tone = STATUS_TONES[jc.status as JobCardStatus] ?? "gray";
        return (
          <StatusBadge
            status={STATUS_LABELS[jc.status as JobCardStatus] ?? jc.status}
            tone={tone}
          />
        );
      },
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
              onClick: () => {
                const filename = `dana-motors-repair-${jc.jobNumber}-${new Date().toISOString().split("T")[0]}`;
                downloadCsv(filename, exportRows([jc]), exportColumns());
              },
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: `Repair: ${jc.jobNumber}`,
                  text: formatRepairText(jc),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Repair: ${jc.jobNumber}`,
                  body: formatRepairText(jc),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatRepairText(jc) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/job-cards/${jc.id}`,
                  "Repair link copied",
                ),
            },
          ]}
        />
      ),
    },
  ];

  if (isError) {
    return (
      <div className="flex flex-col gap-5 p-4 lg:p-6">
        <PageHeader title="Repairs" description="Active and historical vehicle repair work orders." />
        <Card>
          <CardContent className="py-12 text-center">
            <SearchX className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-red-500">Failed to load repairs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Repairs"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "repair" : "repairs"} on record`
            : "Active and historical vehicle repair work orders."
        }
        actions={
          <RepairsExportButton
            branchId={activeBranch?.id}
            status={statusFilter || undefined}
            search={debouncedSearch || undefined}
          />
        }
      />

      <DataTable
        columns={columns}
        data={repairs}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          statusFilter || debouncedSearch
            ? "No repairs match the current filters."
            : "No repair records yet."
        }
        rowKey={(jc) => jc.id}
        skeletonRowCount={5}
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.meta?.total ?? 0}
        totalPages={data?.meta?.totalPages ?? 1}
        onPageChange={setPage}
        selection={selection}
      >
        <div className="flex flex-col gap-4">
          <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            onSearch={commitSearch}
            onClearSearch={clearSearch}
            placeholder="Search by job #, customer, or vehicle…"
            filters={
              <DataTableFilterChips
                options={[
                  { label: "All", value: "" },
                  ...ALL_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s })),
                ]}
                selected={statusFilter}
                onChange={changeFilter}
              />
            }
          />

          <DataTableBulkToolbar
            selectedCount={selection.selectedIds.size}
            totalCount={data?.meta?.total ?? 0}
            selectedItems={selection.selectedItems}
            onClear={selection.clear}
            actions={[
              {
                id: "export-csv",
                label: "CSV",
                icon: <Download className="size-3.5" />,
                variant: "ghost",
                onClick: exportSelected,
              },
              {
                id: "export-excel",
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
