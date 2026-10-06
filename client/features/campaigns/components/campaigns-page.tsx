"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Clock, Download, Eye, FileSpreadsheet, Megaphone, PlusCircle, Search, Car, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { CAMPAIGN_PERMISSIONS } from "@/features/auth/roles";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import { cn } from "@/lib/utils";
import { FilterPills, KpiCard, Meter, Pill, StackedProgress } from "@/features/warranty/components/ui";
import { CAMPAIGN_TYPE_LABELS, CAMPAIGN_TYPE_TONES, fmtDate } from "@/features/warranty/lib/warranty-format";
import { useCampaignSummary, useCampaigns } from "../hooks/use-campaigns";
import type { Campaign, CampaignStatus, CampaignType } from "../types/campaign.types";

const PAGE_SIZE = 10;

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = { DRAFT: "Draft", ACTIVE: "Active", CLOSED: "Closed" };

export function CampaignStatusPill({ status }: { status: CampaignStatus }) {
  return <Pill status={CAMPAIGN_STATUS_LABELS[status]} tone={status === "ACTIVE" ? "emerald" : "gray"} className={status === "CLOSED" ? "bg-white" : undefined} />;
}

function period(c: Pick<Campaign, "startDate" | "endDate">) {
  return `${fmtDate(c.startDate)} – ${c.endDate ? fmtDate(c.endDate) : "open"}`;
}

/** Screen 08 — recalls, free fixes and service campaigns with progress. */
export function CampaignsPage() {
  const router = useRouter();
  const { hasPermission, isSuperAdmin } = useAuth();
  const canCreate = isSuperAdmin || hasPermission(CAMPAIGN_PERMISSIONS.CREATE);
  const canUpdate = isSuperAdmin || hasPermission(CAMPAIGN_PERMISSIONS.UPDATE);
  const [type, setType] = useState<CampaignType | "">("");
  const [status, setStatus] = useState<CampaignStatus | "">("");
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError } = useCampaigns({
    type: type || undefined,
    status: status || undefined,
    search: committed || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const summary = useCampaignSummary();
  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;

  function exportRows(format: "csv" | "excel") {
    const rows = items.map((c) => ({
      code: c.code,
      title: c.title,
      type: CAMPAIGN_TYPE_LABELS[c.type],
      models: c.models.map((m) => m.vehicleModel.name).join(", "),
      period: period(c),
      affected: c.progress.affected,
      completed: c.progress.completed,
      outstanding: c.progress.outstanding,
      status: CAMPAIGN_STATUS_LABELS[c.status],
    }));
    const cols = ["code", "title", "type", "models", "period", "affected", "completed", "outstanding", "status"].map((key) => ({
      key,
      label: key[0].toUpperCase() + key.slice(1),
    }));
    const name = `campaigns-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") downloadCsv(name, rows, cols);
    else downloadExcel(name, rows, cols);
  }

  const columns: Column<Campaign>[] = [
    {
      header: "Code",
      render: (c) => (
        <Link href={`/campaigns/${c.id}`} className="font-mono text-xs font-medium hover:underline">
          {c.code}
        </Link>
      ),
    },
    { header: "Title", render: (c) => <span className="line-clamp-2 max-w-56 text-slate-800">{c.title}</span> },
    { header: "Type", render: (c) => <Pill status={CAMPAIGN_TYPE_LABELS[c.type]} tone={CAMPAIGN_TYPE_TONES[c.type]} /> },
    {
      header: "Models",
      render: (c) => (
        <div className="flex max-w-56 flex-wrap gap-1">
          {c.models.slice(0, 2).map((m) => (
            <span key={m.vehicleModelId} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
              {m.vehicleModel.name}
            </span>
          ))}
          {c.models.length > 2 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">+{c.models.length - 2}</span>}
        </div>
      ),
    },
    { header: "Period", render: (c) => <span className="whitespace-nowrap text-slate-600">{period(c)}</span> },
    {
      header: "Progress",
      render: (c) => (
        <div className="flex items-center gap-3">
          <StackedProgress className="w-44" completed={c.progress.completed} scheduled={c.progress.scheduled} contacted={c.progress.contacted} total={c.progress.affected} />
          <span className="whitespace-nowrap text-xs text-slate-500">
            {c.progress.completed.toLocaleString("en-NG")} / {c.progress.affected.toLocaleString("en-NG")}
          </span>
        </div>
      ),
    },
    { header: "Status", render: (c) => <CampaignStatusPill status={c.status} /> },
    {
      header: "",
      className: "text-right",
      render: (c) => (
        <DataTableRowActions
          item={c}
          actions={[
            { id: "view", label: "View campaign", icon: <Eye className="size-4" />, onClick: () => router.push(`/campaigns/${c.id}`) },
            canUpdate && c.status !== "CLOSED" && { id: "edit", label: "Edit", icon: <Pencil className="size-4" />, onClick: () => router.push(`/campaigns/${c.id}/edit`) },
          ]}
        />
      ),
    },
  ];

  const s = summary.data;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Campaigns"
        description="Recalls, free fixes and service campaigns targeted by VIN."
        actions={
          <div className="flex gap-2">
            <ActionMenu
              align="end"
              trigger={
                <Button variant="outline" size="sm" className="gap-1.5" disabled={items.length === 0}>
                  <Download className="size-4" /> Export <ChevronDown className="size-3.5" />
                </Button>
              }
            >
              <ActionMenuItem icon={<Download />} onClick={() => exportRows("csv")}>
                Export CSV
              </ActionMenuItem>
              <ActionMenuItem icon={<FileSpreadsheet />} onClick={() => exportRows("excel")}>
                Export Excel
              </ActionMenuItem>
            </ActionMenu>
            {canCreate && (
              <Button asChild size="sm" className="gap-1.5">
                <Link href="/campaigns/new">
                  <PlusCircle className="size-4" /> New campaign
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Megaphone />} label="Active campaigns" value={s?.activeCampaigns ?? "—"} />
        <KpiCard icon={<Car />} label="Affected vehicles" value={s ? s.affected.toLocaleString("en-NG") : "—"} />
        <KpiCard icon={<CheckCircle2 />} label="Completed" value={s ? s.completed.toLocaleString("en-NG") : "—"}>
          {s && (
            <div className="mt-2 flex items-center gap-2">
              <Meter percent={s.percentComplete} className="[&>div]:bg-emerald-500" />
              <span className="text-xs text-slate-500">{s.percentComplete}%</span>
            </div>
          )}
        </KpiCard>
        <KpiCard icon={<Clock />} label="Outstanding" value={s ? s.outstanding.toLocaleString("en-NG") : "—"} dot="amber" />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <FilterPills<CampaignType | "">
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          options={[
            { label: "All", value: "" },
            { label: "Recall", value: "RECALL" },
            { label: "Free fix", value: "FREE_FIX" },
            { label: "Service campaign", value: "SERVICE_CAMPAIGN" },
          ]}
        />
        <span className="hidden h-6 w-px bg-slate-200 md:block" />
        <FilterPills<CampaignStatus | "">
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { label: "Any status", value: "" },
            { label: "Draft", value: "DRAFT" },
            { label: "Active", value: "ACTIVE" },
            { label: "Closed", value: "CLOSED" },
          ]}
        />
        <form
          className="relative ml-auto w-full md:w-80"
          onSubmit={(e) => {
            e.preventDefault();
            setCommitted(search.trim());
            setPage(1);
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            className={cn(inputCls, "pl-9")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value) setCommitted("");
            }}
            placeholder="Search campaign code, title, model…"
          />
        </form>
      </div>

      {isError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">Could not load campaigns.</p>
      ) : (
        <DataTable
          columns={columns}
          data={items}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(c) => c.id}
          emptyMessage={type || status || committed ? "No campaigns match these filters." : "No campaigns yet. Create one to target recalls or free fixes by VIN."}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
