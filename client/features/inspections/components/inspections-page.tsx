"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  Download,
  FileSpreadsheet,
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
  downloadCsv,
  downloadExcel,
  openMailto,
  openWhatsApp,
  shareItems,
} from "@/lib/table-actions";
import { useBranchStore } from "@/store/branch.store";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { formatDate, formatDateTime, NOT_PROVIDED } from "@/lib/format";
import { QC_RESULT_BADGE } from "@/features/job-cards/lib/quality-check.logic";
import { useInspections } from "../hooks/use-inspections";
import type { Inspection } from "../types/inspection.types";

const PAGE_SIZE = 10;

const RESULT_FILTER_OPTIONS = [
  { label: "All", value: "" },
  { label: "Passed", value: "PASSED" },
  { label: "Failed", value: "FAILED" },
];

const person = (value: Inspection["inspector"]) => (value ? `${value.firstName} ${value.lastName}`.trim() : NOT_PROVIDED);

function formatVehicle(inspection: Inspection): string {
  const { vehicle } = inspection.jobCard;
  const name = [vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.vin;
  return vehicle.registrationNumber ? `${vehicle.registrationNumber}, ${name}` : name;
}

function formatInspectionText(i: Inspection) {
  return [
    `Quality check, ${formatDateTime(i.createdAt)}`,
    `Job: ${i.jobCard.jobNumber}`,
    `Vehicle: ${formatVehicle(i)}`,
    `Branch: ${i.jobCard.branch.name}`,
    `Result: ${QC_RESULT_BADGE[i.result].label}`,
    `Checked by: ${person(i.inspector)}`,
    `Notes: ${i.notes ?? NOT_PROVIDED}`,
  ].join("\n");
}

function exportRows(inspections: Inspection[]) {
  return inspections.map((i) => ({
    checkedAt: formatDateTime(i.createdAt),
    jobNumber: i.jobCard.jobNumber,
    vehicle: formatVehicle(i),
    result: QC_RESULT_BADGE[i.result].label,
    inspector: person(i.inspector),
    notes: i.notes ?? "",
    branch: i.jobCard.branch.name,
  }));
}

function exportColumns() {
  return [
    { key: "checkedAt", label: "Checked" },
    { key: "jobNumber", label: "Job number" },
    { key: "vehicle", label: "Vehicle" },
    { key: "result", label: "Result" },
    { key: "inspector", label: "Checked by" },
    { key: "notes", label: "Notes" },
    { key: "branch", label: "Branch" },
  ];
}

function exportFilename() {
  return `quality-checks-${formatDate(new Date().toISOString()).replace(/\s/g, "-")}`;
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
  const [resultFilter, setResultFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const activeBranch = useBranchStore((s) => s.activeBranch);

  useEffect(() => {
    setPage(1);
  }, [resultFilter, debouncedSearch, activeBranch?.id]);

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
    result: resultFilter || undefined,
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
      title: `${items.length} Dana Motors quality check${items.length === 1 ? "" : "s"}`,
      text,
    });
  }

  function emailSelected(items: Inspection[]) {
    const body = items.map(formatInspectionText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} quality check${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: Inspection[]) {
    const message = items.map(formatInspectionText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  const columns: Column<Inspection>[] = [
    {
      header: "Checked",
      render: (i) => (
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">{formatDateTime(i.createdAt)}</span>
        </div>
      ),
    },
    {
      header: "Job number",
      render: (i) => (
        <Link href={`/job-cards/${i.jobCard.id}`} className="font-mono text-sm font-medium text-primary underline-offset-2 hover:underline">
          {i.jobCard.jobNumber}
        </Link>
      ),
    },
    {
      header: "Vehicle",
      render: (i) => <span className="text-muted-foreground">{formatVehicle(i)}</span>,
    },
    {
      header: "Result",
      render: (i) => <StatusBadge status={QC_RESULT_BADGE[i.result].label} tone={QC_RESULT_BADGE[i.result].tone} className="text-xs normal-case" />,
    },
    {
      header: "Checked by",
      render: (i) => <span className="text-sm">{person(i.inspector)}</span>,
    },
    {
      header: "Notes",
      render: (i) => (
        <span className="line-clamp-1 max-w-[260px] text-muted-foreground" title={i.notes ?? undefined}>
          {i.notes ?? NOT_PROVIDED}
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
              onClick: () => shareItems({ title: `Quality check ${i.jobCard.jobNumber}`, text: formatInspectionText(i) }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () => openMailto({ subject: `Quality check ${i.jobCard.jobNumber}`, body: formatInspectionText(i) }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatInspectionText(i) }),
            },
          ]}
        />
      ),
    },
  ];

  if (isError) {
    return (
      <div className="flex flex-col gap-5 p-4 lg:p-6">
        <PageHeader title="Inspections" description="Quality checks recorded on job cards." />
        <Card>
          <CardContent className="py-12 text-center">
            <SearchX className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-destructive">The quality checks could not be loaded. Check your connection and refresh the page.</p>
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
            ? `${data.meta.total} ${data.meta.total === 1 ? "quality check" : "quality checks"} recorded on job cards`
            : "Quality checks recorded on job cards."
        }
        actions={<ExportInspectionsButton branchId={activeBranch?.id} />}
      />

      <DataTable
        columns={columns}
        data={inspections}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          resultFilter || debouncedSearch
            ? "No quality checks match the current filters. Clear the search or choose All."
            : "No quality checks yet. They appear here when a supervisor passes or fails a job at the quality check."
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
            placeholder="Search by job number, customer or notes"
            isLoading={isLoading}
            isFetching={isFetching}
            filters={<DataTableFilterChips options={RESULT_FILTER_OPTIONS} selected={resultFilter} onChange={setResultFilter} />}
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
