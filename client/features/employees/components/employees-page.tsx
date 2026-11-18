"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FileSpreadsheet, Link2, Mail, MessageCircle, Pencil, Plus, Share2 } from "lucide-react";
import { apiGet } from "@/lib/api/apiClient";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { DataTableSearch } from "@/components/ui/table-components/DataTableSearch";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { copyToClipboard, downloadCsv, downloadExcel, openMailto, openWhatsApp, shareItems } from "@/lib/table-actions";
import { EmployeeFormModal } from "./employee-form-modal";
import {
  day,
  emptyEmployee,
  employeeExportColumns,
  employeeExportRow,
  employeeTypeLabel,
  formatEmployeeText,
  hasLeft,
  type Employee,
  type EmployeePage,
} from "../types/employee.types";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "CURRENT", label: "Current" },
  { value: "LEFT", label: "Left" },
  { value: "ALL", label: "All" },
];

const fileName = () => `dana-motors-employees-${new Date().toISOString().slice(0, 10)}`;
const joinTexts = (items: Employee[]) => items.map(formatEmployeeText).join("\n\n---\n\n");

function EmployeeRowActions({ employee, canManage, onEdit }: { employee: Employee; canManage: boolean; onEdit: (row: Employee) => void }) {
  const router = useRouter();
  return (
    <DataTableRowActions
      item={employee}
      quickActions={[
        canManage && {
          id: "edit",
          label: "Edit",
          icon: <Pencil className="size-3.5" />,
          onClick: onEdit,
        },
      ]}
      actions={[
        {
          id: "view",
          label: "View details",
          icon: <Eye className="size-4" />,
          onClick: () => router.push(`/employees/${employee.id}`),
        },
        {
          id: "download",
          label: "Download CSV",
          icon: <Download className="size-4" />,
          onClick: () => downloadCsv(`employee-${employee.code}`, [employeeExportRow(employee)], employeeExportColumns),
        },
        {
          id: "share",
          label: "Share",
          icon: <Share2 className="size-4" />,
          onClick: () => shareItems({ title: employee.name, text: formatEmployeeText(employee) }),
        },
        {
          id: "email",
          label: "Email",
          icon: <Mail className="size-4" />,
          onClick: () => openMailto({ subject: `Employee: ${employee.name}`, body: formatEmployeeText(employee) }),
        },
        {
          id: "whatsapp",
          label: "WhatsApp",
          icon: <MessageCircle className="size-4" />,
          onClick: () => openWhatsApp({ message: formatEmployeeText(employee) }),
        },
        {
          id: "copy-link",
          label: "Copy link",
          icon: <Link2 className="size-4" />,
          onClick: () => copyToClipboard(`${window.location.origin}/employees/${employee.id}`, "Employee link copied"),
        },
      ]}
    />
  );
}

export function EmployeesPage() {
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("employee:manage");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("CURRENT");
  const [teamId, setTeamId] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [exporting, setExporting] = useState(false);
  const filters = `status=${status}&search=${encodeURIComponent(search.trim())}${teamId ? `&teamId=${teamId}` : ""}`;

  const query = useQuery({
    queryKey: ["employees", filters, page],
    queryFn: () => apiGet<EmployeePage>(`/employees?${filters}&page=${page}&limit=${PAGE_SIZE}`),
  });

  const employees = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const selection = useDataTableSelection<Employee>({ data: employees, rowKey: row => row.id });
  const total = query.data?.meta.total;
  const filtered = !!search.trim() || !!teamId || status !== "CURRENT";

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
    selection.clear();
  }

  /** Exports every employee matching the filters, page by page (the API returns at most 100 at a time). */
  async function exportAll() {
    setExporting(true);
    try {
      const rows: Employee[] = [];
      for (let next = 1; ; next += 1) {
        const data = await apiGet<EmployeePage>(`/employees?${filters}&page=${next}&limit=100`);
        rows.push(...data.items);
        if (next >= data.meta.totalPages) break;
      }
      downloadExcel(fileName(), rows.map(employeeExportRow), employeeExportColumns);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Employees"
        description={total != null
          ? `${total} ${total === 1 ? "employee" : "employees"}${filtered ? " match the filters" : ""}. Job cards name mechanics and groups from this list.`
          : "Workshop employees, with or without a login. Job cards name mechanics and groups from this list."}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportAll} disabled={exporting || !total}>
              <Download className="size-4" />
              {exporting ? "Exporting…" : "Export"}
            </Button>
            {canManage && (
              <Button size="sm" className="gap-1.5" onClick={() => setEditing({ ...emptyEmployee, branchId: user?.branchId ?? "" })}>
                <Plus className="size-4" />
                Add employee
              </Button>
            )}
          </div>
        } />

      {query.isError ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load employees.
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>Retry</Button>
        </div>
      ) : (
        <DataTable
          data={employees}
          rowKey={row => row.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          emptyMessage={filtered ? "No employees match these filters." : "No employees yet."}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          totalPages={query.data?.meta.totalPages}
          onPageChange={next => {
            setPage(next);
            selection.clear();
          }}
          selection={selection}
          columns={[{
            header: "Code",
            className: "whitespace-nowrap font-mono text-sm",
            render: row => row.code,
          }, {
            header: "Name",
            render: row => (
              <span className="block min-w-0">
                <Link href={`/employees/${row.id}`} className="block font-medium hover:text-primary hover:underline">{row.name}</Link>
                {row.user && <span className="block text-sm text-muted-foreground">Login: {row.user.email}</span>}
              </span>
            ),
          }, {
            header: "Designation",
            render: row => row.designation?.description ?? "—",
          }, {
            header: "Group",
            render: row => row.team?.description ?? "—",
          }, {
            header: "Branch",
            render: row => row.branch?.name ?? "—",
          }, {
            header: "Type",
            render: employeeTypeLabel,
          }, {
            header: "Status",
            render: row => <StatusBadge status={hasLeft(row) ? `Left ${day(row.leftDate)}` : "Current"} tone={hasLeft(row) ? "gray" : "emerald"} />,
          }, {
            header: "Actions",
            headerClassName: "text-right",
            className: "text-right",
            render: row => <EmployeeRowActions employee={row} canManage={canManage} onEdit={setEditing} />,
          }]}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <DataTableSearch
                value={search}
                placeholder="Search code or name"
                onChange={value => setSearch(value)}
                onSearch={() => changeFilter(() => undefined)}
                onClear={() => changeFilter(() => setSearch(""))} />
              <div role="group" aria-label="Employee status" className="inline-flex h-10 shrink-0 rounded-md border border-border bg-background p-0.5">
                {STATUS_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={status === option.value}
                    className={`rounded px-3 text-sm font-medium transition-colors ${status === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => changeFilter(() => setStatus(option.value))}>
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="w-full sm:w-64">
                <WorkshopPicker
                  hideLabel
                  label="Group"
                  endpoint="/workshop-masters?kind=TEAM"
                  collection="items"
                  value={teamId}
                  onChange={id => changeFilter(() => setTeamId(id))} />
              </div>
            </div>

            <DataTableBulkToolbar
              selectedCount={selection.selectedIds.size}
              totalCount={total ?? 0}
              selectedItems={selection.selectedItems}
              onClear={selection.clear}
              actions={[
                {
                  id: "csv",
                  label: "CSV",
                  icon: <Download className="size-3.5" />,
                  variant: "ghost",
                  onClick: items => downloadCsv(fileName(), items.map(employeeExportRow), employeeExportColumns),
                },
                {
                  id: "excel",
                  label: "Excel",
                  icon: <FileSpreadsheet className="size-3.5" />,
                  variant: "ghost",
                  onClick: items => downloadExcel(fileName(), items.map(employeeExportRow), employeeExportColumns),
                },
                {
                  id: "share",
                  label: "Share",
                  icon: <Share2 className="size-3.5" />,
                  variant: "ghost",
                  onClick: items => shareItems({ title: `${items.length} Dana Motors employees`, text: joinTexts(items) }),
                },
                {
                  id: "email",
                  label: "Email",
                  icon: <Mail className="size-3.5" />,
                  variant: "ghost",
                  onClick: items => openMailto({ subject: `${items.length} employee${items.length === 1 ? "" : "s"}`, body: joinTexts(items) }),
                },
                {
                  id: "whatsapp",
                  label: "WhatsApp",
                  icon: <MessageCircle className="size-3.5" />,
                  variant: "ghost",
                  onClick: items => openWhatsApp({ message: joinTexts(items) }),
                },
              ]} />
          </div>
        </DataTable>
      )}

      <EmployeeFormModal employee={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
