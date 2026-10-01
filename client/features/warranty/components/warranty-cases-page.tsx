"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, Eye, FileSpreadsheet, Link2, PlusCircle, Search, Settings2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { DateInput } from "@/components/forms/DateInput";
import { inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { useBranchStore } from "@/store/branch.store";
import { copyToClipboard, downloadCsv, downloadExcel } from "@/lib/table-actions";
import { cn } from "@/lib/utils";
import { useWarrantyCases, useWarrantySummary } from "../hooks/use-warranty";
import {
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  CASE_STATUS_TONES,
  daysAgo,
  fmtDate,
  fmtNaira,
  fmtNairaShort,
} from "../lib/warranty-format";
import type { CaseListParams, CaseStatus, WarrantyCaseListItem } from "../types/warranty.types";
import { OpenCaseDialog } from "./OpenCaseDialog";
import { FilterPills, KpiCard, Pill } from "./ui";

const PAGE_SIZE = 10;
const selectCls = cn(inputCls, "w-auto pr-8");

const EXPORT_COLUMNS = [
  { key: "caseNumber", label: "Case #" },
  { key: "jobNumber", label: "Job card" },
  { key: "customer", label: "Customer" },
  { key: "vehicle", label: "Vehicle" },
  { key: "vin", label: "VIN" },
  { key: "mileage", label: "Mileage (km)" },
  { key: "claimNo", label: "Kia claim no." },
  { key: "claimed", label: "Claimed (NGN)" },
  { key: "approved", label: "Approved (NGN)" },
  { key: "status", label: "Status" },
  { key: "opened", label: "Opened" },
  { key: "branch", label: "Branch" },
];

function exportRows(items: WarrantyCaseListItem[]) {
  return items.map((c) => ({
    caseNumber: c.caseNumber,
    jobNumber: c.jobCard?.jobNumber ?? "",
    customer: c.customer ? `${c.customer.firstName} ${c.customer.lastName}` : "",
    vehicle: [c.vehicle.model, c.vehicle.trim].filter(Boolean).join(" "),
    vin: c.vehicle.vin,
    mileage: c.mileage ?? "",
    claimNo: c.manufacturerClaimNo ?? "",
    claimed: c.claimedAmount,
    approved: c.approvedAmount ?? "",
    status: CASE_STATUS_LABELS[c.status],
    opened: fmtDate(c.createdAt),
    branch: c.branch.name,
  }));
}

/** Screen 05 — warranty cases with the legacy Warranty Claim Control Register filters. */
export function WarrantyCasesPage() {
  const router = useRouter();
  const { hasPermission, isSuperAdmin, user } = useAuth();
  const can = (p: string) => isSuperAdmin || hasPermission(p);
  const branches = useBranchStore((s) => s.branches);
  const showBranchFilter = isSuperAdmin || !user?.branchId;

  const [status, setStatus] = useState<CaseStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [basedOn, setBasedOn] = useState<"CASE_DATE" | "BILL_DATE">("CASE_DATE");
  const [claimNo, setClaimNo] = useState<"" | "GENERATED" | "NOT_GENERATED">("");
  const [billing, setBilling] = useState<"" | "BILLED" | "UNBILLED">("");
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [opening, setOpening] = useState(false);

  const params: CaseListParams = {
    status: status || undefined,
    from: from || undefined,
    to: to ? `${to}T23:59:59` : undefined,
    basedOn: from || to ? basedOn : undefined,
    claimNo: claimNo || undefined,
    billing: billing || undefined,
    branchId: branchId || undefined,
    search: committedSearch || undefined,
    page,
    limit: PAGE_SIZE,
  };
  const { data, isLoading, isFetching, isError } = useWarrantyCases(params);
  const summary = useWarrantySummary();
  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  function exportCases(format: "csv" | "excel") {
    const filename = `warranty-cases-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") downloadCsv(filename, exportRows(items), EXPORT_COLUMNS);
    else downloadExcel(filename, exportRows(items), EXPORT_COLUMNS);
  }

  const columns: Column<WarrantyCaseListItem>[] = [
    {
      header: "Case #",
      render: (c) => (
        <Link href={`/warranty/${c.id}`} className="font-medium text-blue-700 underline-offset-2 hover:underline">
          {c.caseNumber}
        </Link>
      ),
    },
    {
      header: "Job card",
      render: (c) =>
        c.jobCard ? (
          <Link href={`/job-cards/${c.jobCard.id}`} className="font-mono text-xs text-slate-700 hover:underline">
            {c.jobCard.jobNumber}
          </Link>
        ) : (
          "—"
        ),
    },
    { header: "Customer", render: (c) => (c.customer ? `${c.customer.firstName} ${c.customer.lastName}` : "—") },
    {
      header: "Vehicle",
      render: (c) => (
        <div>
          <p className="text-slate-800">{[c.vehicle.model, c.vehicle.trim].filter(Boolean).join(" ") || "—"}</p>
          <p className="font-mono text-xs text-slate-400">{c.vehicle.vin}</p>
        </div>
      ),
    },
    { header: "Mileage", className: "text-right", headerClassName: "text-right", render: (c) => c.mileage?.toLocaleString("en-NG") ?? "—" },
    { header: "Kia claim no.", render: (c) => <span className="font-mono text-xs">{c.manufacturerClaimNo ?? "—"}</span> },
    { header: "Claimed (₦)", className: "text-right", headerClassName: "text-right", render: (c) => fmtNaira(c.claimedAmount) },
    { header: "Approved (₦)", className: "text-right", headerClassName: "text-right", render: (c) => (c.approvedAmount == null ? "—" : fmtNaira(c.approvedAmount)) },
    {
      header: "Status",
      render: (c) => (
        <Pill
          status={CASE_STATUS_LABELS[c.status]}
          tone={CASE_STATUS_TONES[c.status]}
          className={c.status === "SETTLED" ? "border-emerald-500 bg-white" : undefined}
        />
      ),
    },
    { header: "Age", render: (c) => <span className="whitespace-nowrap text-slate-500">{daysAgo(c.createdAt)}</span> },
    {
      header: "",
      className: "text-right",
      render: (c) => (
        <DataTableRowActions
          item={c}
          actions={[
            { id: "view", label: "View case", icon: <Eye className="size-4" />, onClick: () => router.push(`/warranty/${c.id}`) },
            c.jobCard && {
              id: "job",
              label: "Open job card",
              icon: <Wrench className="size-4" />,
              onClick: () => router.push(`/job-cards/${c.jobCard!.id}`),
            },
            {
              id: "link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              onClick: () => copyToClipboard(`${window.location.origin}/warranty/${c.id}`, "Case link copied"),
            },
          ]}
        />
      ),
    },
  ];

  const s = summary.data;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Warranty Cases"
        description="Track warranty claims from job card to manufacturer settlement."
        actions={
          <div className="flex flex-wrap gap-2">
            {can(WARRANTY_PERMISSIONS.SETTINGS) && (
              <Button asChild variant="ghost" size="sm" className="gap-1.5">
                <Link href="/warranty/settings">
                  <Settings2 className="size-4" /> Settings
                </Link>
              </Button>
            )}
            <ActionMenu
              align="end"
              trigger={
                <Button variant="outline" size="sm" className="gap-1.5" disabled={items.length === 0}>
                  <Download className="size-4" /> Export <ChevronDown className="size-3.5" />
                </Button>
              }
            >
              <ActionMenuItem icon={<Download />} onClick={() => exportCases("csv")}>
                Export CSV
              </ActionMenuItem>
              <ActionMenuItem icon={<FileSpreadsheet />} onClick={() => exportCases("excel")}>
                Export Excel
              </ActionMenuItem>
            </ActionMenu>
            {can(WARRANTY_PERMISSIONS.CLAIM) && (
              <Button size="sm" className="gap-1.5" onClick={() => setOpening(true)}>
                <PlusCircle className="size-4" /> Open case
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Open" value={s?.open ?? "—"} />
        <KpiCard label="In review" value={s?.inReview ?? "—"} />
        <KpiCard label="Submitted to Kia" value={s?.submitted ?? "—"} sub={s ? `${fmtNairaShort(s.submittedClaimedAmount)} claimed` : undefined} />
        <KpiCard
          label="Approved (30 days)"
          dot="emerald"
          value={s?.approvedLast30Days ?? "—"}
          sub={s ? `${fmtNairaShort(s.approvedLast30DaysAmount)} approved` : undefined}
        />
        <KpiCard label="Rejected / Returned" dot="red" value={s?.rejectedOrReturned ?? "—"} />
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <FilterPills<CaseStatus | "">
          value={status}
          onChange={reset(setStatus)}
          options={[{ label: "All", value: "" }, ...CASE_STATUSES.map((v) => ({ label: CASE_STATUS_LABELS[v], value: v }))]}
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">From</span>
            <div className="w-36">
              <DateInput value={from} onChange={reset(setFrom)} />
            </div>
            <span className="text-sm text-slate-600">to</span>
            <div className="w-36">
              <DateInput value={to} onChange={reset(setTo)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Based on:
            <select className={selectCls} value={basedOn} onChange={(e) => reset(setBasedOn)(e.target.value as typeof basedOn)}>
              <option value="CASE_DATE">Case date</option>
              <option value="BILL_DATE">Bill date</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Claim no.:
            <select className={selectCls} value={claimNo} onChange={(e) => reset(setClaimNo)(e.target.value as typeof claimNo)}>
              <option value="">All</option>
              <option value="GENERATED">Generated</option>
              <option value="NOT_GENERATED">Not generated</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Billing:
            <select className={selectCls} value={billing} onChange={(e) => reset(setBilling)(e.target.value as typeof billing)}>
              <option value="">All</option>
              <option value="BILLED">Billed</option>
              <option value="UNBILLED">Unbilled</option>
            </select>
          </label>
          {showBranchFilter && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Branch:
              <select className={selectCls} value={branchId} onChange={(e) => reset(setBranchId)(e.target.value)}>
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            setCommittedSearch(search.trim());
            setPage(1);
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            className={cn(inputCls, "pl-9")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value) setCommittedSearch("");
            }}
            placeholder="Search case, job, VIN, claim no. or customer… (Enter)"
          />
        </form>
      </div>

      {isError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">Could not load warranty cases.</p>
      ) : (
        <DataTable
          columns={columns}
          data={items}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(c) => c.id}
          emptyMessage={
            status || committedSearch || from || to || claimNo || billing
              ? "No cases match these filters."
              : "No warranty cases yet. Cases open automatically when a job card is created for a vehicle under warranty."
          }
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          onPageChange={setPage}
        />
      )}

      {opening && <OpenCaseDialog onClose={() => setOpening(false)} />}
    </div>
  );
}
