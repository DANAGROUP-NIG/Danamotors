"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Layers, PlusCircle, Search, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import {
  editRate,
  errorMessage,
  getRateGrid,
  getRateOptions,
  labourRateKeys,
  type LabourRateRow,
  type Pricing,
  type RateFilter,
} from "../api";
import { BulkChangeModal } from "./bulk-change-modal";
import { ApplyToModelsModal } from "./apply-to-models-modal";
import { CopyModelModal } from "./copy-model-modal";

const PAGE_SIZE = 100;
export const LABOUR_RATE_UPDATE = "labour-rate:update";

const money = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Settings → Model labour rates. A grid of every model × labour rate, filtered by model, vehicle system,
 * group or text, with inline edit and bulk changes on the selected rows or on everything the filter
 * matches. Replaces legacy's Labour Rate Update Utility (XLS import): there is no upload.
 */
export function LabourRatesPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(LABOUR_RATE_UPDATE);
  const queryClient = useQueryClient();

  const [modelId, setModelId] = useState("");
  const [vehicleSystem, setVehicleSystem] = useState("");
  const [group, setGroup] = useState("");
  const [pricing, setPricing] = useState<"" | Pricing>("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<null | "bulk" | "apply" | "copy">(null);

  const filter: RateFilter = useMemo(
    () => ({
      modelIds: modelId ? [modelId] : undefined,
      vehicleSystem: vehicleSystem || undefined,
      group: group || undefined,
      pricing: pricing || undefined,
      active: status === "" ? undefined : status === "active",
      search: search || undefined,
    }),
    [modelId, vehicleSystem, group, pricing, status, search],
  );

  const options = useQuery({ queryKey: labourRateKeys.options(), queryFn: getRateOptions });
  const grid = useQuery({
    queryKey: labourRateKeys.grid(filter, page),
    queryFn: () => getRateGrid(filter, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => grid.data?.rates ?? [], [grid.data]);
  const total = grid.data?.meta.total ?? 0;

  const selection = useDataTableSelection<LabourRateRow>({ data: rows, rowKey: (r) => r.id });

  const save = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof editRate>[1] }) => editRate(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: labourRateKeys.all }),
    onError: (error) => toast.error(errorMessage(error, "Could not save the rate")),
  });

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
    selection.clear();
  }

  const selectCls = cn(inputCls, "h-9 w-auto min-w-[9rem] py-1");

  return (
    <div className="grid gap-5 p-5">
      <PageHeader
        title="Model labour rates"
        description="Hours and rate for each labour on each model: hours × hourly rate (TIME), or a fixed amount (FIXED)."
        actions={
          canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={() => setModal("copy")}>
                <Copy className="size-4" /> Copy model rates
              </Button>
              <Button size="sm" variant="outline" onClick={() => setModal("apply")}>
                <PlusCircle className="size-4" /> Add labour to models
              </Button>
              <Button size="sm" onClick={() => setModal("bulk")} disabled={total === 0}>
                <SlidersHorizontal className="size-4" />
                {selection.selectedIds.size ? `Change ${selection.selectedIds.size} selected` : `Change all ${total.toLocaleString()}`}
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter rates">
        <select aria-label="Model" className={selectCls} value={modelId} onChange={(e) => changeFilter(() => setModelId(e.target.value))}>
          <option value="">All models</option>
          {(options.data?.models ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.description} ({m.rates.toLocaleString()}){m.active ? "" : " · inactive"}
            </option>
          ))}
        </select>
        <select aria-label="Vehicle system" className={selectCls} value={vehicleSystem} onChange={(e) => changeFilter(() => setVehicleSystem(e.target.value))}>
          <option value="">All vehicle systems</option>
          {(options.data?.vehicleSystems ?? []).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Group" className={selectCls} value={group} onChange={(e) => changeFilter(() => setGroup(e.target.value))}>
          <option value="">All groups</option>
          {(options.data?.groups ?? []).map((g) => <option key={g}>{g}</option>)}
        </select>
        <select aria-label="Pricing" className={selectCls} value={pricing} onChange={(e) => changeFilter(() => setPricing(e.target.value as "" | Pricing))}>
          <option value="">Time and fixed</option>
          <option value="TIME">Time</option>
          <option value="FIXED">Fixed</option>
        </select>
        <select aria-label="Status" className={selectCls} value={status} onChange={(e) => changeFilter(() => setStatus(e.target.value as typeof status))}>
          <option value="">Active and inactive</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <form
          className="relative min-w-[14rem] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            changeFilter(() => setSearch(searchInput.trim()));
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            className={cn(inputCls, "h-9 pl-8")}
            placeholder="Labour or model code / description, then Enter"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => searchInput.trim() !== search && changeFilter(() => setSearch(searchInput.trim()))}
          />
        </form>
      </div>

      {grid.isError && <p role="alert" className="text-sm text-red-600">Could not load the rates.</p>}

      <DataTable
        data={rows}
        rowKey={(r) => r.id}
        isLoading={grid.isLoading}
        isFetching={grid.isFetching}
        emptyMessage="No rates match. Use “Add labour to models” or “Copy model rates” to create them."
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={grid.data?.meta.totalPages ?? 1}
        onPageChange={(p) => {
          setPage(p);
          selection.clear();
        }}
        selection={canEdit ? selection : undefined}
        columns={[
          { header: "Model", render: (r) => <span title={r.modelCode}>{r.modelDescription}</span> },
          {
            header: "Labour",
            render: (r) => (
              <span className="flex flex-col">
                <span className={cn(!r.labourActive && "text-slate-400 line-through")}>{r.labourDescription}</span>
                <span className="text-xs text-muted-foreground">{r.labourCode}</span>
              </span>
            ),
          },
          {
            header: "System / group",
            render: (r) => <span className="text-sm text-muted-foreground">{[r.vehicleSystem, r.group].filter(Boolean).join(" · ") || "—"}</span>,
          },
          {
            header: "Pricing",
            render: (r) =>
              canEdit ? (
                <select
                  aria-label={`Pricing for ${r.labourCode} on ${r.modelDescription}`}
                  className={cn(inputCls, "h-8 w-24 py-0")}
                  value={r.pricing}
                  onChange={(e) => save.mutate({ id: r.id, data: { pricing: e.target.value as Pricing } })}
                >
                  <option value="TIME">Time</option>
                  <option value="FIXED">Fixed</option>
                </select>
              ) : (
                r.pricing
              ),
          },
          {
            header: "Hours",
            render: (r) =>
              canEdit ? (
                <NumberCell key={`${r.id}-h-${r.hours}`} label={`Hours for ${r.labourCode}`} value={r.hours} min={0.01} onSave={(hours) => save.mutate({ id: r.id, data: { hours } })} />
              ) : (
                r.hours
              ),
          },
          {
            header: "Rate / amount (₦)",
            render: (r) =>
              canEdit ? (
                <NumberCell key={`${r.id}-r-${r.rate}`} label={`Rate for ${r.labourCode}`} value={r.rate} min={0} onSave={(rate) => save.mutate({ id: r.id, data: { rate } })} />
              ) : (
                money(r.rate)
              ),
          },
          {
            header: "Charge",
            render: (r) => <span className="tabular-nums">₦{money(r.pricing === "FIXED" ? r.rate : r.rate * r.hours)}</span>,
            className: "text-right",
            headerClassName: "text-right",
          },
          {
            header: "Active",
            render: (r) => (
              <button
                type="button"
                role="switch"
                aria-checked={r.active}
                aria-label={`${r.active ? "Deactivate" : "Activate"} ${r.labourCode} on ${r.modelDescription}`}
                disabled={!canEdit || save.isPending}
                onClick={() => save.mutate({ id: r.id, data: { active: !r.active } })}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:cursor-default",
                  r.active ? "bg-primary" : "bg-muted",
                )}
              >
                <span className={cn("inline-block size-4 rounded-full bg-white shadow-sm transition-transform", r.active ? "translate-x-4" : "translate-x-0")} />
              </button>
            ),
          },
        ]}
      />

      {canEdit && (
        <>
          <BulkChangeModal
            isOpen={modal === "bulk"}
            onClose={() => setModal(null)}
            scope={selection.selectedIds.size ? { ids: [...selection.selectedIds] } : { filter }}
            scopeLabel={selection.selectedIds.size ? `${selection.selectedIds.size} selected rates` : `all ${total.toLocaleString()} rates matching the filter`}
            onDone={() => selection.clear()}
          />
          <ApplyToModelsModal isOpen={modal === "apply"} onClose={() => setModal(null)} models={options.data?.models ?? []} />
          <CopyModelModal isOpen={modal === "copy"} onClose={() => setModal(null)} models={options.data?.models ?? []} />
        </>
      )}

      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Layers className="size-4" /> Every change is recorded in the change log (Settings → Audit log). Bulk changes preview the count first.
      </p>
    </div>
  );
}

/** A number input that saves on Enter or when it loses focus, if the value changed. Escape reverts. */
function NumberCell({ value, onSave, min, label }: { value: number; onSave: (v: number) => void; min: number; label: string }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n) || n < min) {
      setText(String(value));
      return;
    }
    if (n !== value) onSave(n);
  };
  return (
    <input
      aria-label={label}
      type="number"
      step="0.01"
      min={min}
      className={cn(inputCls, "h-8 w-28 py-0 text-right tabular-nums")}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setText(String(value));
      }}
    />
  );
}
