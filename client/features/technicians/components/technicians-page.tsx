"use client";

import { useEffect, useState } from "react";
import {
  SearchX,
  User,
  Download,
  FileSpreadsheet,
  Share2,
  Mail,
  MessageCircle,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { PageHeader } from "@/components/headers/page-header";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import {
  downloadCsv,
  downloadExcel,
  shareItems,
  openMailto,
  openWhatsApp,
  copyToClipboard,
} from "@/lib/table-actions";
import { useTechnicians } from "../hooks/use-technicians";
import type { Technician } from "../types/technician.types";

const PAGE_SIZE = 10;

type ExportRow = Record<string, string | number | boolean | null | undefined>;

function technicianName(t: Technician) {
  return `${t.firstName} ${t.lastName}`.trim();
}

function formatTechnicianText(t: Technician) {
  return `*${technicianName(t)}*\nEmail: ${t.email}\nPhone: ${t.phoneNumber ?? "—"}\nBranch: ${t.branch?.name ?? "—"}\nActive jobs: ${t._count.technicianAssignments}\nStatus: ${t.isActive ? "Active" : "Inactive"}`;
}

function exportColumns() {
  return [
    { key: "firstName", label: "First name" },
    { key: "lastName", label: "Last name" },
    { key: "email", label: "Email" },
    { key: "phoneNumber", label: "Phone" },
    { key: "branchName", label: "Branch" },
    { key: "activeJobs", label: "Active jobs" },
    { key: "isActive", label: "Active" },
    { key: "createdAt", label: "Joined" },
  ];
}

function toExportRows(items: Technician[]): ExportRow[] {
  return items.map((t) => ({
    firstName: t.firstName,
    lastName: t.lastName,
    email: t.email,
    phoneNumber: t.phoneNumber,
    branchName: t.branch?.name ?? null,
    activeJobs: t._count.technicianAssignments,
    isActive: t.isActive,
    createdAt: t.createdAt,
  }));
}

function ExportTechniciansButton() {
  const { data } = useTechnicians({ page: 1, limit: 1000 });
  const technicians = data?.technicians ?? [];
  const disabled = technicians.length === 0;

  function filename() {
    return `dana-motors-technicians-${new Date().toISOString().split("T")[0]}`;
  }

  return (
    <ActionMenu
      align="end"
      trigger={
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-9 gap-1.5"
        >
          <Download className="size-4" />
          Export
        </Button>
      }
    >
      <ActionMenuItem
        icon={<Download className="size-4" />}
        onClick={() =>
          downloadCsv(filename(), toExportRows(technicians), exportColumns())
        }
      >
        Export as CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() =>
          downloadExcel(filename(), toExportRows(technicians), exportColumns())
        }
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function TechniciansPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

  const { data, isLoading, isError } = useTechnicians({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
  });

  const technicians = data?.technicians ?? [];

  const selection = useDataTableSelection<Technician>({
    data: technicians,
    rowKey: (t) => t.id,
  });

  function exportSelected(items: Technician[]) {
    downloadCsv(
      `technicians-${new Date().toISOString().split("T")[0]}`,
      toExportRows(items),
      exportColumns(),
    );
  }

  function exportSelectedExcel(items: Technician[]) {
    downloadExcel(
      `technicians-${new Date().toISOString().split("T")[0]}`,
      toExportRows(items),
      exportColumns(),
    );
  }

  function shareSelected(items: Technician[]) {
    const text = items.map(formatTechnicianText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Technicians`,
      text,
    });
  }

  function emailSelected(items: Technician[]) {
    const body = items.map(formatTechnicianText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Technician${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: Technician[]) {
    const message = items.map(formatTechnicianText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  const columns: Column<Technician>[] = [
    {
      header: "Name",
      render: (t) => (
        <div className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <span className="font-medium">
            {t.firstName} {t.lastName}
            {!t.isActive && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inactive</span>}
          </span>
        </div>
      ),
    },
    {
      header: "Branch",
      render: (t) => <span className="text-muted-foreground">{t.branch?.name ?? "—"}</span>,
    },
    {
      header: "Active Jobs",
      render: (t) => (
        <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          {t._count.technicianAssignments}
        </span>
      ),
    },
    {
      header: "Email",
      render: (t) => <span className="text-muted-foreground">{t.email}</span>,
    },
    {
      header: "Phone",
      render: (t) => <span className="text-muted-foreground">{t.phoneNumber ?? "—"}</span>,
    },
    {
      header: "Joined",
      render: (t) => <span className="text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</span>,
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (t) => (
        <DataTableRowActions
          item={t}
          actions={[
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([t]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: technicianName(t),
                  text: formatTechnicianText(t),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Technician: ${technicianName(t)}`,
                  body: formatTechnicianText(t),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatTechnicianText(t) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              shortcut: "⌘C",
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/technicians/${t.id}`,
                  "Technician link copied",
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
        <PageHeader title="Technicians" description="Workshop staff and technician assignments." />
        <Card>
          <CardContent className="py-12 text-center">
            <SearchX className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-red-500">Failed to load technicians.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Technicians"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "technician" : "technicians"} on record`
            : "Workshop staff and technician assignments."
        }
        actions={<ExportTechniciansButton />}
      />

      <DataTable
        columns={columns}
        data={technicians}
        isLoading={isLoading}
        emptyMessage={
          debouncedSearch
            ? "No technicians match your search."
            : "No technicians yet."
        }
        rowKey={(t) => t.id}
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
            placeholder="Search by name or email…"
          />

          <DataTableBulkToolbar
            selectedCount={selection.selectedIds.size}
            totalCount={data?.meta?.total ?? 0}
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
