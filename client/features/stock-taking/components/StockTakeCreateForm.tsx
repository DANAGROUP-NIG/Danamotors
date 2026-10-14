"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Loader2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { PART_CATEGORIES } from "@/features/inventory/components/PartForm";
import { usePriceCategories } from "@/features/inventory/hooks/use-parts";
import { apiErrorMessage } from "@/features/stock-transfers/hooks/use-indent-mutations";
import { previewPartsRequest } from "../api/stock-taking.api";
import { useCreateStockTake } from "../hooks/use-stock-taking";
import { AUDIT_LEVEL_LABELS, KINDS, PART_FLAG_LABELS, fmtCurrency } from "../lib/stock-taking-format";
import type { Basis, CandidatePart, Kind, PartSelection, StockAuditLevel, StockTakeType } from "../types/stock-taking.types";

const PAGE_SIZE = 50;

const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

/**
 * Legacy Batch Creation, for Physical Stock Taking or Stock Audit: choose the parts, load them,
 * untick any, create. An audit names its audit type and auditors instead of annual or perpetual.
 */
export function StockTakeCreateForm({ kind = "COUNT" }: { kind?: Kind }) {
  const k = KINDS[kind];
  const audit = kind === "AUDIT";
  const router = useRouter();
  const create = useCreateStockTake();
  const branches = useBranchStore((s) => s.branches);
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const crossBranch = isSuperAdmin || hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);
  const { data: priceCategories = [] } = usePriceCategories();

  const [type, setType] = useState<StockTakeType>(audit ? "AUDIT" : "PERPETUAL");
  const [auditLevel, setAuditLevel] = useState<StockAuditLevel>("INTERNAL");
  const [auditors, setAuditors] = useState("");
  const [branchId, setBranchId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [basis, setBasis] = useState<Basis>("PART");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [partFlag, setPartFlag] = useState("");
  const [category, setCategory] = useState("");
  const [priceCategoryCode, setPriceCategoryCode] = useState("");
  const [rateFrom, setRateFrom] = useState("");
  const [rateTo, setRateTo] = useState("");
  const [onlyWithStock, setOnlyWithStock] = useState(false);
  const [topCount, setTopCount] = useState("");
  const [topMonths, setTopMonths] = useState("");
  const [includeStn, setIncludeStn] = useState(false);

  const [loaded, setLoaded] = useState<{ key: string; selection: PartSelection; parts: CandidatePart[] } | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [find, setFind] = useState("");
  const [page, setPage] = useState(1);
  const [attention, setAttention] = useState(false);

  useEffect(() => {
    if (!branchId && user?.branchId) setBranchId(user.branchId);
  }, [branchId, user?.branchId]);

  const selection: PartSelection = useMemo(
    () => ({
      basis,
      from: from.trim() || undefined,
      to: to.trim() || undefined,
      partFlag: partFlag || undefined,
      category: category || undefined,
      priceCategoryCode: priceCategoryCode || undefined,
      dealerRateFrom: num(rateFrom),
      dealerRateTo: num(rateTo),
      onlyWithStock: onlyWithStock || undefined,
      topConsumed: num(topCount) ? { count: num(topCount)!, months: num(topMonths) ?? 0, includeStn: includeStn || undefined } : undefined,
    }),
    [basis, from, to, partFlag, category, priceCategoryCode, rateFrom, rateTo, onlyWithStock, topCount, topMonths, includeStn],
  );
  const key = JSON.stringify({ branchId, selection });
  const stale = !!loaded && loaded.key !== key;

  const load = useMutation({
    mutationFn: () => previewPartsRequest(branchId, selection, kind),
    onSuccess: (parts) => {
      setLoaded({ key, selection, parts });
      // Parts already in another open count cannot join this one.
      setExcluded(new Set(parts.filter((p) => p.openBatch).map((p) => p.partId)));
      setPage(1);
      if (!parts.length) toast.warning("No parts match this selection");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Failed to load the parts")),
  });

  function validate() {
    if (!branchId) return "Select the branch";
    if (audit && !auditors.trim()) return "Enter the auditor(s)";
    if (selection.topConsumed && !(selection.topConsumed.months >= 1 && selection.topConsumed.months <= 12)) return "Months must be from 1 to 12";
    if (selection.dealerRateFrom != null && selection.dealerRateTo != null && selection.dealerRateTo < selection.dealerRateFrom)
      return "The dealer rate 'to' cannot be less than 'from'";
    return null;
  }

  function refresh() {
    setBasis("PART");
    setFrom("");
    setTo("");
    setPartFlag("");
    setCategory("");
    setPriceCategoryCode("");
    setRateFrom("");
    setRateTo("");
    setOnlyWithStock(false);
    setTopCount("");
    setTopMonths("");
    setIncludeStn(false);
    setLoaded(null);
    setExcluded(new Set());
  }

  const parts = loaded?.parts ?? [];
  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? parts.filter((p) => p.partNumber.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.bin.toLowerCase().includes(q)) : parts;
  }, [parts, find]);
  const paged = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const chosen = parts.length - excluded.size;
  const selectedIds = useMemo(() => new Set(paged.filter((p) => !excluded.has(p.partId)).map((p) => p.partId)), [paged, excluded]);
  const selectable = shown.filter((p) => !p.openBatch);
  const allShownSelected = selectable.length > 0 && selectable.every((p) => !excluded.has(p.partId));

  function toggle(id: string) {
    if (parts.find((p) => p.partId === id)?.openBatch) return;
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const p of selectable) {
        if (allShownSelected) next.add(p.partId);
        else next.delete(p.partId);
      }
      return next;
    });
  }

  function submit() {
    if (!loaded) return;
    create.mutate(
      {
        branchId,
        type,
        remarks: remarks.trim() || undefined,
        ...(audit && { auditLevel, auditors: auditors.trim() }),
        selection: loaded.selection,
        excludePartIds: excluded.size ? [...excluded] : undefined,
      },
      { onSuccess: ({ stockTake }) => router.push(`${k.base}/${stockTake.id}`) },
    );
  }

  const columns: Column<CandidatePart>[] = [
    { header: "Part", render: (p) => <span className="font-mono font-medium">{p.partNumber}</span> },
    { header: "Flag", render: (p) => <span className="text-muted-foreground">{p.partFlag}</span> },
    { header: "Description", className: "max-w-64 truncate", render: (p) => p.name },
    { header: "Bin", render: (p) => <span className="font-mono text-muted-foreground">{p.bin || "—"}</span> },
    { header: "Dealer rate", headerClassName: "text-right", className: "text-right", render: (p) => fmtCurrency(p.dealerRate) },
    { header: "Current stock", headerClassName: "text-right", className: "text-right", render: (p) => p.stock },
    {
      header: "",
      render: (p) => (p.openBatch ? <StatusBadge status={`In count ${p.openBatch}`} tone="amber" /> : null),
    },
  ];

  const error = validate();

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <Link href={k.base} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to {k.title}
      </Link>
      <PageHeader
        title={audit ? "New stock audit" : "New stock taking batch"}
        description={`Choose the parts to ${audit ? "audit" : "count"}, load them, untick any you want to leave out, then create the ${audit ? "audit" : "batch"}.`}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {audit ? (
            <Field label="Stock audit">
              <div className="flex flex-col gap-2 pt-2 text-sm text-slate-700">
                {(Object.keys(AUDIT_LEVEL_LABELS) as StockAuditLevel[]).map((level) => (
                  <label key={level} className="flex items-center gap-2">
                    <input type="radio" className="size-4" checked={auditLevel === level} onChange={() => setAuditLevel(level)} />
                    {AUDIT_LEVEL_LABELS[level]}
                  </label>
                ))}
              </div>
            </Field>
          ) : (
            <Field label="Stock taking">
              <div className="flex flex-wrap gap-4 pt-2 text-sm text-slate-700">
                {(["PERPETUAL", "ANNUAL"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2">
                    <input type="radio" className="size-4" checked={type === t} onChange={() => setType(t)} />
                    {t === "PERPETUAL" ? "Perpetual" : "Annual"}
                  </label>
                ))}
              </div>
            </Field>
          )}
          <Field label="Branch">
            {crossBranch ? (
              <select className={inputCls} value={branchId} disabled={!!loaded} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Select branch</option>
                {branches
                  .filter((b) => b.isActive !== false)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            ) : (
              <input className={inputCls} readOnly value={branches.find((b) => b.id === branchId)?.name ?? "Your branch"} />
            )}
          </Field>
          <Field label="Remarks (optional)">
            <input className={inputCls} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
          {audit && (
            <Field label="Auditor(s)">
              <input
                className={inputCls}
                maxLength={200}
                value={auditors}
                onChange={(e) => setAuditors(e.target.value)}
                placeholder="e.g. Victoria, Fatimah"
              />
            </Field>
          )}
        </div>
        {audit && (
          <p className="mt-4 text-sm text-muted-foreground">
            Stock keeps moving during an audit, and parts in a physical count can be audited too. Auditors count blind. The audit reports
            shortage and excess; it does not adjust stock.
          </p>
        )}
        {type === "ANNUAL" && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            While an annual count is open, no stock of its parts can move at this branch: issues, sales, transfers and receipts of those
            parts are refused until the count is completed. Leave the selection blank to count every part.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="mb-4 text-sm font-semibold text-slate-700">Select parts</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Select by">
            <div className="flex flex-wrap gap-4 pt-2 text-sm text-slate-700">
              {(["PART", "BIN"] as const).map((b) => (
                <label key={b} className="flex items-center gap-2">
                  <input type="radio" className="size-4" checked={basis === b} onChange={() => setBasis(b)} />
                  {b === "PART" ? "Part wise" : "Bin location wise"}
                </label>
              ))}
            </div>
          </Field>
          <Field label={basis === "PART" ? "Part from" : "Bin from"}>
            <input className={inputCls} maxLength={40} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input className={inputCls} maxLength={40} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Source of purchase">
            <select className={inputCls} value={partFlag} onChange={(e) => setPartFlag(e.target.value)}>
              <option value="">All</option>
              {Object.entries(PART_FLAG_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {code} · {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Part type">
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All</option>
              {PART_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Part category">
            <select className={inputCls} value={priceCategoryCode} onChange={(e) => setPriceCategoryCode(e.target.value)}>
              <option value="">All</option>
              {priceCategories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.description}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dealer rate (₦) from">
            <input type="number" min={0} className={inputCls} value={rateFrom} onChange={(e) => setRateFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="number" min={0} className={inputCls} value={rateTo} onChange={(e) => setRateTo(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-700">
          <span className="flex items-center gap-2">
            Top
            <input type="number" min={1} className={cn(inputCls, "h-9 w-20")} value={topCount} onChange={(e) => setTopCount(e.target.value)} />
            consumed parts during the last
            <input type="number" min={1} max={12} className={cn(inputCls, "h-9 w-16")} value={topMonths} onChange={(e) => setTopMonths(e.target.value)} />
            months
          </span>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4" checked={includeStn} onChange={(e) => setIncludeStn(e.target.checked)} />
            Include STN
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4" checked={onlyWithStock} onChange={(e) => setOnlyWithStock(e.target.checked)} />
            Only those parts having stock
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button type="button" className="gap-1.5" disabled={!!error || load.isPending} onClick={() => load.mutate()}>
            {load.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Load parts
          </Button>
          <Button type="button" variant="outline" className="gap-1.5" onClick={refresh}>
            <RotateCcw className="size-4" /> Refresh selection
          </Button>
          {error && branchId && <p className="text-sm text-red-500">{error}</p>}
          {stale && <p className="text-sm text-amber-700">The selection has changed. Load the parts again before creating the {audit ? "audit" : "batch"}.</p>}
        </div>
      </div>

      {loaded && (
        <DataTable
          columns={columns}
          data={paged}
          rowKey={(p) => p.partId}
          emptyMessage={find ? "No loaded parts match." : "No parts match this selection."}
          page={page}
          pageSize={PAGE_SIZE}
          total={shown.length}
          totalPages={Math.max(1, Math.ceil(shown.length / PAGE_SIZE))}
          onPageChange={setPage}
          selection={{
            selectedIds,
            isAllSelected: allShownSelected,
            isIndeterminate: !allShownSelected && selectable.some((p) => !excluded.has(p.partId)),
            onToggleAll: toggleAll,
            onToggle: toggle,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              className={cn(inputCls, "w-full sm:w-80")}
              placeholder="Find a loaded part, description or bin…"
              value={find}
              onChange={(e) => {
                setFind(e.target.value);
                setPage(1);
              }}
            />
            <p className="text-sm text-slate-600">
              {chosen} of {parts.length} part(s) selected
            </p>
          </div>
        </DataTable>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          {loaded ? `${chosen} part(s) will be ${audit ? "audited" : "counted"}` : `Load the parts to see what will be ${audit ? "audited" : "counted"}.`}
        </p>
        <Button
          type="button"
          disabled={!loaded || stale || chosen === 0 || create.isPending}
          onClick={() => (type === "ANNUAL" ? setAttention(true) : submit())}
        >
          {create.isPending ? "Creating…" : audit ? "Create audit" : "Create batch"}
        </Button>
      </div>

      {attention && (
        <ModalFame isOpen onClose={() => setAttention(false)} title="Annual stock taking">
          <div className="grid gap-4 text-sm text-slate-700">
            <p className="font-medium">You are starting the annual stock taking for {new Date().getFullYear()}. Before you go on, make sure that:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>No transactions are pending: open job requisitions, counter sales, STNs and MRNs are posted.</li>
              <li>No parts are blocked: picked stock for CPOs and indents is billed, sent or released.</li>
              <li>Parts transactions stop at this branch during the count.</li>
              <li>The Current Stock and Stock Summary reports have been printed (Parts Reports, Stock).</li>
            </ol>
            <p className="rounded-lg bg-amber-50 p-3 text-amber-800">
              Stock of the {chosen} part(s) in this batch will be frozen at {branches.find((b) => b.id === branchId)?.name ?? "this branch"} until
              the count is completed.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAttention(false)}>
                Cancel
              </Button>
              <Button
                disabled={create.isPending}
                onClick={() => {
                  setAttention(false);
                  submit();
                }}
              >
                Proceed
              </Button>
            </div>
          </div>
        </ModalFame>
      )}
    </div>
  );
}
