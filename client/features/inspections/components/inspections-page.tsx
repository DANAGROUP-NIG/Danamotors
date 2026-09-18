"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Link2,
  Mail,
  MessageCircle,
  SearchX,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { PageHeader } from "@/components/headers/page-header";
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
import { useInspections } from "../hooks/use-inspections";
import type { Inspection } from "../types/inspection.types";

const PAGE_SIZE = 10;

const STATUS_FILTERS = ["", "Pending", "Passed", "Failed", "Completed"] as const;
const STATUS_LABELS: Record<string, string> = {
  "": "All",
  Pending: "Pending",
  Passed: "Passed",
  Failed: "Failed",
  Completed: "Completed",
};
const STATUS_FILTER_OPTIONS = STATUS_FILTERS.map((s) => ({ label: STATUS_LABELS[s], value: s }));

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700",
  Passed: "bg-emerald-50 text-emerald-700",
  Failed: "bg-red-50 text-red-600",
  Completed: "bg-blue-50 text-blue-700",
};

function formatVehicle(inspection: Inspection): string {
  const { vehicle } = inspection.jobCard;
  return [vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.vin;
}

function formatInspectionText(i: Inspection) {
  const vehicle = formatVehicle(i);
  const registration = i.jobCard.vehicle.registrationNumber
    ? ` · ${i.jobCard.vehicle.registrationNumber}`
    : "";
  return `*Inspection Report – ${new Date(i.createdAt).toLocaleDateString()}*\nJob: ${i.jobCard.jobNumber}\nVehicle: ${vehicle}${registration}\nBranch: ${i.jobCard.branch.name}\nOutcome: ${i.status}\nFindings: ${i.findings}`;
}

function exportRows(inspections: Inspection[]) {
  return inspections.map((i) => ({
    reportDate: new Date(i.createdAt).toLocaleDateString(),
    jobNumber: i.jobCard.jobNumber,
    vehicle: formatVehicle(i),
    registrationNumber: i.jobCard.vehicle.registrationNumber ?? "",
    findings: i.findings,
    outcome: i.status,
    notes: i.notes ?? "",
    branch: i.jobCard.branch.name,
  }));
}

function exportColumns() {
  return [
    { key: "reportDate", label: "Report Date" },
    { key: "jobNumber", label: "Job #" },
    { key: "vehicle", label: "Vehicle" },
    { key: "registrationNumber", label: "Registration" },
    { key: "findings", label: "Findings" },
    { key: "outcome", label: "Outcome" },
    { key: "notes", label: "Notes" },
    { key: "branch", label: "Branch" },
  ];
}

function exportFilename() {
  return `inspections-${new Date().toISOString().split("T")[0]}`;
}

function ExportInspectionsButton({ branchId }: { branchId?: string }) {
  const { data } = useInspections({ page: 1, limit: 1000, branchId });
  const inspections = data?.inspections ?? [];
  const filename = exportFilename();

  return (
    <ActionMenu
      align="end"
      trigger={
        <Button
          variant="outline"
          size="sm"
          disabled={inspections.length === 0}
          className="h-9 gap-1.5"
        >
          <Download className="size-4" />
          Export
        </Button>
      }
    >
      <ActionMenuItem
        icon={<Download className="size-4" />}
        onClick={() => downloadCsv(filename, exportRows(inspections), exportColumns())}
      >
        Export as CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() => downloadExcel(filename, exportRows(inspections), exportColumns())}
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function InspectionsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const activeBranch = useBranchStore((s) => s.activeBranch);

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

  const { data, isLoading, isError, isFetching } = useInspections({
    page,
    limit: PAGE_SIZE,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
    branchId: activeBranch?.id,
  });

  const inspections = useMemo(() => data?.inspections ?? [], [data?.inspections]);
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  const selection = useDataTableSelection<Inspection>({
    data: inspections,
    rowKey: (i) => i.id,
  });

  function exportSelected(items: Inspection[]) {
    downloadCsv(exportFilename(), exportRows(items), exportColumns());
  }

  function exportSelectedExcel(items: Inspection[]) {
    downloadExcel(exportFilename(), exportRows(items), exportColumns());
  }

  function shareSelected(items: Inspection[]) {
    const text = items.map(formatInspectionText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Inspection${items.length === 1 ? "" : "s"}`,
      text,
    });
  }

  function emailSelected(items: Inspection[]) {
    const body = items.map(formatInspectionText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Inspection${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: Inspection[]) {
    const message = items.map(formatInspectionText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  const columns: Column<Inspection>[] = [
    {
      header: "Report",
      render: (i) => (
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{new Date(i.createdAt).toLocaleDateString()}</span>
        </div>
      ),
    },
    {
      header: "Job #",
      render: (i) => <span className="font-mono text-xs font-medium">{i.jobCard.jobNumber}</span>,
    },
    {
      header: "Vehicle",
      render: (i) => (
        <span className="text-muted-foreground">
          {formatVehicle(i)}
          {i.jobCard.vehicle.registrationNumber ? ` · ${i.jobCard.vehicle.registrationNumber}` : ""}
        </span>
      ),
    },
    {
      header: "Findings",
      render: (i) => (
        <span className="line-clamp-1 max-w-[260px] text-muted-foreground">{i.findings}</span>
      ),
    },
    {
      header: "Outcome",
      render: (i) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[i.status] || ""}`}>
          {i.status}
        </span>
      ),
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (i) => (
        <DataTableRowActions
          item={i}
          actions={[
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([i]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: `Inspection ${i.jobCard.jobNumber}`,
                  text: formatInspectionText(i),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Inspection ${i.jobCard.jobNumber}`,
                  body: formatInspectionText(i),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatInspectionText(i) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/inspections/${i.id}`,
                  "Inspection link copied",
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
        <PageHeader title="Inspections" description="Vehicle inspection reports and findings." />
        <Card>
          <CardContent className="py-12 text-center">
            <SearchX className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-red-500">Failed to load inspections.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Inspections"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "inspection" : "inspections"} on record`
            : "Vehicle inspection reports and findings."
        }
        actions={<ExportInspectionsButton branchId={activeBranch?.id} />}
      />

      <DataTable
        columns={columns}
        data={inspections}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          statusFilter || debouncedSearch
            ? "No inspections match the current filters."
            : "No inspection reports yet."
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
            placeholder="Search by job # or findings…"
            isLoading={isLoading}
            isFetching={isFetching}
            filters={<DataTableFilterChips options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />}
          />

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
