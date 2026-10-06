"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Calendar,
  CalendarDays,
  Car,
  CheckCircle2,
  Download,
  Hourglass,
  Phone,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import ModalFame from "@/components/modals/ModalFame";
import { inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { CAMPAIGN_PERMISSIONS } from "@/features/auth/roles";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import { downloadCsv } from "@/lib/table-actions";
import { cn } from "@/lib/utils";
import { FilterPills, PageState, Pill } from "@/features/warranty/components/ui";
import { CAMPAIGN_TYPE_LABELS, CAMPAIGN_TYPE_TONES, CAMPAIGN_VEHICLE_LABELS, CAMPAIGN_VEHICLE_TONES, daysAgo, fmtDate } from "@/features/warranty/lib/warranty-format";
import { useBulkUpdateCampaignVehicles, useCampaign, useCampaignStatus, useCampaignVehicles } from "../hooks/use-campaigns";
import type { CampaignVehicleRow, CampaignVehicleStatus, Progress } from "../types/campaign.types";
import { AddVehiclesDialog } from "./AddVehiclesDialog";
import { CampaignStatusPill } from "./campaigns-page";
import { OUTCOME_SHORT, OutreachDialog } from "./OutreachDialog";

const PAGE_SIZE = 10;

function Tile({ icon, label, value, children }: { icon: React.ReactNode; label: string; value?: number; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <span className="mt-1 text-slate-500 [&_svg]:size-6">{icon}</span>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
        {value != null && <p className="text-2xl font-bold text-slate-900">{value.toLocaleString("en-NG")}</p>}
        {children}
      </div>
    </div>
  );
}

function BigProgress({ p }: { p: Progress }) {
  const w = (n: number) => (p.affected ? `${(n / p.affected) * 100}%` : "0%");
  const pct = (n: number) => (p.affected ? ((n / p.affected) * 100).toFixed(1) : "0.0");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="bg-slate-300" style={{ width: w(p.pending + p.notReachable) }} />
          <div className="bg-amber-400" style={{ width: w(p.contacted) }} />
          <div className="bg-blue-500" style={{ width: w(p.scheduled) }} />
          <div className="bg-emerald-500" style={{ width: w(p.completed) }} />
        </div>
        <span className="whitespace-nowrap text-sm text-slate-600">
          {p.completed.toLocaleString("en-NG")} / {p.affected.toLocaleString("en-NG")} ({p.percentComplete}%)
        </span>
      </div>
      <div className="flex flex-wrap gap-5 text-sm text-slate-600">
        {(
          [
            ["bg-slate-300", "Pending", p.pending],
            ["bg-amber-400", "Contacted", p.contacted],
            ["bg-blue-500", "Scheduled", p.scheduled],
            ["bg-emerald-500", "Completed", p.completed],
          ] as const
        ).map(([color, label, n]) => (
          <span key={label} className="inline-flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full", color)} /> {label} <span className="font-medium">{n.toLocaleString("en-NG")}</span> ({pct(n)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

/** Screen 10 — campaign progress and the affected-vehicle outreach list. */
export function CampaignDetail({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: campaign, isLoading, isError } = useCampaign(id);
  const { hasPermission, isSuperAdmin } = useAuth();
  const can = (p: string) => isSuperAdmin || hasPermission(p);
  const canUpdate = can(CAMPAIGN_PERMISSIONS.UPDATE);
  const canOutreach = can(CAMPAIGN_PERMISSIONS.VEHICLE_UPDATE);
  const statusMutation = useCampaignStatus(id);
  const bulk = useBulkUpdateCampaignVehicles(id);

  const [status, setStatus] = useState<CampaignVehicleStatus | "">("");
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [outreach, setOutreach] = useState<{ vehicleId: string; section: "contact" | "schedule" } | null>(null);

  // /campaigns/:id?add=1 (from "Save & add vehicles") opens the add dialog once.
  useEffect(() => {
    if (searchParams.get("add") === "1") {
      setAdding(true);
      router.replace(pathname);
    }
  }, [searchParams, router, pathname]);

  const vehicles = useCampaignVehicles(id, {
    status: status || undefined,
    branchId: branchId || undefined,
    search: committed || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const items = useMemo(() => vehicles.data?.items ?? [], [vehicles.data]);
  const selection = useDataTableSelection<CampaignVehicleRow>({ data: items, rowKey: (v) => v.id });

  if (isLoading) return <PageState loading />;
  if (isError || !campaign) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/campaigns" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500">
          <ArrowLeft className="size-4" /> Back to Campaigns
        </Link>
        <p className="text-sm text-red-500">Campaign not found.</p>
      </div>
    );
  }

  const p = campaign.progress;
  const counts = vehicles.data?.counts;
  const branchRows = (campaign.byBranch ?? []).filter((b) => b.branchId);
  const active = campaign.status === "ACTIVE";

  const columns: Column<CampaignVehicleRow>[] = [
    { header: "VIN", render: (v) => <span className={cn("font-mono text-xs", v.vehicle ? "text-blue-700" : "text-slate-500")}>{v.vehicle ? <Link href={`/vehicles/${v.vehicle.id}`} className="hover:underline">{v.vin}</Link> : v.vin}</span> },
    { header: "Model", render: (v) => v.vehicle?.model ?? "—" },
    {
      header: "Customer",
      render: (v) =>
        v.vehicle ? (
          <div>
            <p className="text-slate-800">
              {v.vehicle.customer.firstName} {v.vehicle.customer.lastName}
            </p>
            <p className="text-xs text-slate-400">{v.vehicle.customer.phoneNumber ?? v.vehicle.customer.email}</p>
          </div>
        ) : (
          <span className="italic text-slate-400">Not in system</span>
        ),
    },
    { header: "Branch", render: (v) => v.vehicle?.customer.branch.name ?? "—" },
    {
      header: "Last contact",
      render: (v) =>
        v.lastContactAt ? (
          <div className="text-xs">
            <p className="text-slate-700">
              {daysAgo(v.lastContactAt) === "Today" ? "Today" : `${daysAgo(v.lastContactAt)} ago`} · {v.lastContactOutcome ? OUTCOME_SHORT[v.lastContactOutcome] : ""}
            </p>
            <p className="text-slate-400">{fmtDate(v.lastContactAt)}</p>
          </div>
        ) : (
          "—"
        ),
    },
    { header: "Attempts", className: "text-center", headerClassName: "text-center", render: (v) => v.contactAttempts },
    { header: "Status", render: (v) => <Pill status={CAMPAIGN_VEHICLE_LABELS[v.status]} tone={CAMPAIGN_VEHICLE_TONES[v.status]} /> },
    {
      header: "Job card",
      render: (v) =>
        v.completedJobCard ? (
          <Link href={`/job-cards/${v.completedJobCard.id}`} className="font-mono text-xs text-blue-700 underline-offset-2 hover:underline">
            {v.completedJobCard.jobNumber}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (v) => {
        const disabled = !v.vehicle || v.status === "COMPLETED" || !canOutreach || !active;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" variant="outline" className="h-8 gap-1 px-2" disabled={disabled} onClick={() => setOutreach({ vehicleId: v.id, section: "contact" })}>
              <Phone className="size-3.5" /> Log contact
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1 px-2" disabled={disabled} onClick={() => setOutreach({ vehicleId: v.id, section: "schedule" })}>
              <Calendar className="size-3.5" /> Schedule
            </Button>
            <DataTableRowActions
              item={v}
              actions={[
                { id: "history", label: "Contact history", onClick: () => setOutreach({ vehicleId: v.id, section: "contact" }) },
                canOutreach &&
                  !["COMPLETED", "NOT_APPLICABLE"].includes(v.status) && {
                    id: "na",
                    label: "Mark not applicable",
                    destructive: true,
                    onClick: () => bulk.mutate({ campaignVehicleIds: [v.id], status: "NOT_APPLICABLE" }),
                  },
                canOutreach &&
                  ["PENDING", "CONTACTED", "SCHEDULED"].includes(v.status) && {
                    id: "nr",
                    label: "Mark not reachable",
                    onClick: () => bulk.mutate({ campaignVehicleIds: [v.id], status: "NOT_REACHABLE" }),
                  },
                canOutreach && v.status === "NOT_APPLICABLE" && { id: "undo", label: "Back to pending", onClick: () => bulk.mutate({ campaignVehicleIds: [v.id], status: "PENDING" }) },
              ]}
            />
          </div>
        );
      },
    },
  ];

  const chip = (label: string, value: CampaignVehicleStatus | "", count?: number) => ({ label, value, count });

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="size-4" /> Back to Campaigns
        </Link>
        <div className="flex flex-wrap gap-2">
          {canUpdate && campaign.status !== "CLOSED" && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/campaigns/${id}/edit`}>Edit</Link>
            </Button>
          )}
          {canUpdate && campaign.status !== "CLOSED" && (
            <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => setConfirmClose(true)}>
              Close campaign
            </Button>
          )}
          {canUpdate && campaign.status === "DRAFT" && (
            <Button size="sm" variant="outline" disabled={statusMutation.isPending || p.affected === 0} onClick={() => statusMutation.mutate("activate")} title={p.affected === 0 ? "Add vehicles first" : undefined}>
              Activate
            </Button>
          )}
          {canUpdate && campaign.status !== "CLOSED" && (
            <Button size="sm" onClick={() => setAdding(true)}>
              Add vehicles
            </Button>
          )}
        </div>
      </div>

      {/* ── Header ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap gap-2">
          <Pill status={CAMPAIGN_TYPE_LABELS[campaign.type]} tone={CAMPAIGN_TYPE_TONES[campaign.type]} />
          <CampaignStatusPill status={campaign.status} />
        </div>
        <p className="mt-2 font-mono text-lg text-slate-600">{campaign.code}</p>
        <h1 className="text-2xl font-bold text-slate-900">{campaign.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="size-4" /> {fmtDate(campaign.startDate)} – {campaign.endDate ? fmtDate(campaign.endDate) : "open"}
          </span>
          <span className="inline-flex flex-wrap items-center gap-2">
            <Car className="size-4" />
            {campaign.models.length === 0
              ? "All models"
              : campaign.models.map((m) => (
                  <span key={m.vehicleModelId} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5">
                    {m.vehicleModel.name}
                    {(m.yearFrom || m.yearTo) && ` (${m.yearFrom ?? "…"}–${m.yearTo ?? "…"})`}
                  </span>
                ))}
          </span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="size-4" />
            {campaign.labourCovered && campaign.partsCovered ? "Labour and parts covered" : campaign.labourCovered ? "Labour covered" : campaign.partsCovered ? "Parts covered" : "Nothing covered"}
          </span>
        </div>
        {campaign.defectDescription && <p className="mt-3 max-w-3xl text-sm text-slate-500">{campaign.defectDescription}</p>}
      </div>

      {/* ── Progress ── */}
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Tile icon={<Users />} label="Affected" value={p.affected} />
        <Tile icon={<Hourglass />} label="Pending" value={p.pending} />
        <Tile icon={<Phone />} label="Contacted" value={p.contacted} />
        <Tile icon={<Calendar />} label="Scheduled" value={p.scheduled} />
        <Tile icon={<CheckCircle2 />} label="Completed" value={p.completed} />
        <Tile icon={<Ban />} label="Not reachable">
          <p className="text-lg font-bold text-slate-900">{p.notReachable}</p>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Not applicable</p>
          <p className="text-lg font-bold text-slate-900">{p.notApplicable}</p>
        </Tile>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <BigProgress p={p} />
      </div>

      {/* ── By branch ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-800">Progress by branch</h2>
          {(campaign.unmatchedVins ?? 0) > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
              <AlertTriangle className="size-3.5" /> Unmatched VINs: {campaign.unmatchedVins} (not yet in our system)
            </span>
          )}
        </div>
        {branchRows.length === 0 ? (
          <p className="text-sm text-slate-400">No affected vehicles are registered to a branch yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  {["Branch", "Affected", "Contacted", "Scheduled", "Completed", "Outstanding", "% complete"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branchRows.map((b) => (
                  <tr key={b.branchId}>
                    <td className="px-3 py-2.5">{b.branchName}</td>
                    <td className="px-3 py-2.5">{b.affected}</td>
                    <td className="px-3 py-2.5">{b.contacted}</td>
                    <td className="px-3 py-2.5">{b.scheduled}</td>
                    <td className="px-3 py-2.5">{b.completed}</td>
                    <td className="px-3 py-2.5">{b.outstanding}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 w-40 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${b.percentComplete}%` }} />
                        </div>
                        <span>{b.percentComplete.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Affected vehicles ── */}
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-800">Affected vehicles</h2>
          <div className="flex flex-wrap gap-2">
            {branchRows.length > 0 && (
              <select className={cn(inputCls, "w-44")} value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }}>
                <option value="">All branches</option>
                {branchRows.map((b) => (
                  <option key={b.branchId} value={b.branchId!}>
                    {b.branchName}
                  </option>
                ))}
              </select>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCommitted(search.trim());
                setPage(1);
              }}
            >
              <input
                className={cn(inputCls, "w-72")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (!e.target.value) setCommitted("");
                }}
                placeholder="Search by VIN, customer, phone…"
              />
            </form>
          </div>
        </div>
        <FilterPills<CampaignVehicleStatus | "">
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            chip("All", "", counts?.affected),
            chip("Pending", "PENDING", counts?.pending),
            chip("Contacted", "CONTACTED", counts?.contacted),
            chip("Scheduled", "SCHEDULED", counts?.scheduled),
            chip("Completed", "COMPLETED", counts?.completed),
            chip("Not reachable", "NOT_REACHABLE", counts?.notReachable),
            chip("Not applicable", "NOT_APPLICABLE", counts?.notApplicable),
          ]}
        />
        <DataTable
          columns={columns}
          data={items}
          isLoading={vehicles.isLoading}
          isFetching={vehicles.isFetching}
          rowKey={(v) => v.id}
          emptyMessage={p.affected === 0 ? "No affected vehicles yet. Add them by VIN." : "No vehicles match these filters."}
          page={page}
          pageSize={PAGE_SIZE}
          total={vehicles.data?.total ?? 0}
          totalPages={Math.max(1, Math.ceil((vehicles.data?.total ?? 0) / PAGE_SIZE))}
          onPageChange={setPage}
          selection={canOutreach ? selection : undefined}
        >
          <DataTableBulkToolbar
            selectedCount={selection.selectedIds.size}
            totalCount={vehicles.data?.total ?? 0}
            selectedItems={selection.selectedItems}
            onClear={selection.clear}
            actions={[
              canOutreach && {
                id: "na",
                label: "Mark not applicable",
                icon: <Ban />,
                onClick: (list) =>
                  bulk.mutate(
                    { campaignVehicleIds: list.filter((v) => !["COMPLETED", "NOT_APPLICABLE"].includes(v.status)).map((v) => v.id), status: "NOT_APPLICABLE" },
                    { onSuccess: selection.clear },
                  ),
              },
              {
                id: "export",
                label: "Export",
                icon: <Download />,
                onClick: (list) =>
                  downloadCsv(
                    `${campaign.code}-vehicles`,
                    list.map((v) => ({
                      vin: v.vin,
                      model: v.vehicle?.model ?? "",
                      customer: v.vehicle ? `${v.vehicle.customer.firstName} ${v.vehicle.customer.lastName}` : "",
                      phone: v.vehicle?.customer.phoneNumber ?? "",
                      branch: v.vehicle?.customer.branch.name ?? "",
                      status: CAMPAIGN_VEHICLE_LABELS[v.status],
                      attempts: v.contactAttempts,
                    })),
                    ["vin", "model", "customer", "phone", "branch", "status", "attempts"].map((key) => ({ key, label: key })),
                  ),
              },
            ]}
          />
        </DataTable>
      </section>

      {adding && <AddVehiclesDialog campaign={campaign} onClose={() => setAdding(false)} />}
      {outreach && <OutreachDialog campaignId={id} vehicleId={outreach.vehicleId} initialSection={outreach.section} onClose={() => setOutreach(null)} />}
      <ModalFame isOpen={confirmClose} onClose={() => setConfirmClose(false)} title="Close campaign">
        <div className="grid gap-5">
          <p className="text-sm text-slate-600">
            {p.outstanding > 0
              ? `${p.outstanding.toLocaleString("en-NG")} vehicles are still outstanding. Closing stops them being flagged at check-in and on job cards.`
              : "Closing stops this campaign being flagged at check-in and on job cards."}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmClose(false)}>
              Keep open
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("close", { onSuccess: () => setConfirmClose(false) })}
            >
              {statusMutation.isPending ? "Closing…" : "Close campaign"}
            </Button>
          </div>
        </div>
      </ModalFame>
    </div>
  );
}
