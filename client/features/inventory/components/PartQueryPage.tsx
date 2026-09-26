"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Boxes, Building2, GitBranch, Loader2, LogOut, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import { inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { useBranchStore } from "@/store/branch.store";
import { useFetchBranches } from "@/features/branches/hooks/useFetchBranches";
import { usePartQuery } from "../hooks/use-parts";
import { PartStatusBadge, fmtNaira } from "./PartStatusBadge";
import type { PartQueryAlternateRow, PartQueryRow } from "../types/inventory.types";

const thCls = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";

function errorMessage(error: unknown) {
  const data = (error as { response?: { status?: number; data?: { message?: string } } })?.response;
  if (data?.status === 404) return data.data?.message ?? "Part not found.";
  return data?.data?.message ?? "Could not run the part query.";
}

function Grid({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {icon}
          {title}
        </div>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/** Columns shared by all three grids, after the leading identity columns. */
function StockCells({ r }: { r: PartQueryRow }) {
  return (
    <>
      <td className={tdCls}>{r.partFlag}</td>
      <td className={tdCls}>{r.taxable ? "Yes" : "No"}</td>
      <td className={cn(tdCls, "text-right font-medium", r.currentStock > 0 ? "text-slate-800" : "text-slate-400")}>
        {r.currentStock}
      </td>
      <td className={cn(tdCls, "text-slate-600")}>{r.location ?? ""}</td>
      <td className={cn(tdCls, "text-slate-600")}>{r.binCard ?? ""}</td>
      <td className={cn(tdCls, "text-right")}>{fmtNaira(r.dealerRate)}</td>
      <td className={cn(tdCls, "text-right")}>{r.retailRate != null ? fmtNaira(r.retailRate) : "—"}</td>
      <td className={cn(tdCls, "text-right", r.qtyBlocked > 0 ? "font-medium text-amber-700" : "text-slate-400")}>
        {r.qtyBlocked}
      </td>
    </>
  );
}

const STOCK_HEADERS = (
  <>
    <th className={thCls}>Flag</th>
    <th className={thCls}>Taxable</th>
    <th className={cn(thCls, "text-right")}>Curr stock</th>
    <th className={thCls}>Location</th>
    <th className={thCls}>Bin card</th>
    <th className={cn(thCls, "text-right")}>Dealer rate</th>
    <th className={cn(thCls, "text-right")}>Retail rate</th>
    <th className={cn(thCls, "text-right")}>Qty blocked</th>
  </>
);

function StoreRows({ rows, empty }: { rows: PartQueryRow[]; empty: string }) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={9} className="px-3 py-6 text-center text-sm text-muted-foreground">
          {empty}
        </td>
      </tr>
    );
  }
  return (
    <>
      {rows.map((r) => (
        <tr key={r.branchId} className="border-t border-slate-100">
          <td className={cn(tdCls, "font-medium text-slate-700")}>
            {r.branchName}
            {r.branchCode && <span className="ml-1.5 text-xs text-slate-400">{r.branchCode}</span>}
          </td>
          <StockCells r={r} />
        </tr>
      ))}
    </>
  );
}

function AlternateRows({ rows }: { rows: PartQueryAlternateRow[] }) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={11} className="px-3 py-6 text-center text-sm text-muted-foreground">
          This part has no alternates.
        </td>
      </tr>
    );
  }
  return (
    <>
      {rows.map((r) => (
        <tr key={`${r.partId}-${r.branchId}`} className="border-t border-slate-100">
          <td className={tdCls}>
            <Link href={`/inventory/${r.partId}`} className="font-mono text-xs font-medium text-primary hover:underline">
              {r.partNumber}
            </Link>
            {r.partStatus === "BLOCKED" && <span className="ml-1.5 text-xs text-red-600">blocked</span>}
          </td>
          <td className={cn(tdCls, "max-w-56 truncate text-slate-600")}>{r.description}</td>
          <td className={cn(tdCls, "text-slate-700")}>{r.branchName}</td>
          <StockCells r={r} />
        </tr>
      ))}
    </>
  );
}

export function PartQueryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPart = searchParams.get("part") ?? "";
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const crossBranch = isSuperAdmin || hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);
  const branches = useBranchStore((s) => s.branches);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  useFetchBranches(crossBranch);

  const [input, setInput] = useState(initialPart);
  const [submitted, setSubmitted] = useState(initialPart);
  const [homeBranchId, setHomeBranchId] = useState<string>("");

  // Cross-branch users default to their own branch, else the branch selected elsewhere in the app.
  useEffect(() => {
    if (crossBranch && !homeBranchId) setHomeBranchId(user?.branchId ?? activeBranch?.id ?? "");
  }, [crossBranch, homeBranchId, user?.branchId, activeBranch?.id]);

  const { data, isFetching, error, isError } = usePartQuery(submitted, crossBranch ? homeBranchId || undefined : undefined);

  function show(e?: FormEvent) {
    e?.preventDefault();
    const value = input.trim();
    setSubmitted(value);
    router.replace(value ? `/inventory/part-query?part=${encodeURIComponent(value)}` : "/inventory/part-query");
  }

  function reset() {
    setInput("");
    setSubmitted("");
    router.replace("/inventory/part-query");
  }

  // Only top-level branches can be a home premises.
  const premisesChoices = branches.filter((b) => !b.parentBranchId);
  const premisesName = data?.premises[0]?.name;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Part Query"
        description="Where a part is held, how much, and at what dealer and retail rate, including alternates and other branches."
      />

      <form onSubmit={show} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-56 flex-1 gap-1.5">
            <span className="text-sm font-semibold">Part no.</span>
            <input
              className={cn(inputCls, "font-mono")}
              placeholder="e.g. 2630035505"
              value={input}
              autoFocus
              onChange={(e) => setInput(e.target.value.toUpperCase())}
            />
          </label>
          {crossBranch && (
            <label className="grid w-60 gap-1.5">
              <span className="text-sm font-semibold">Query from</span>
              <select className={inputCls} value={homeBranchId} onChange={(e) => setHomeBranchId(e.target.value)}>
                <option value="">No home branch (all branches)</option>
                {premisesChoices.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-2">
            <Button type="submit" className="gap-1.5" disabled={!input.trim() || isFetching}>
              {isFetching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Show
            </Button>
            <Button type="button" variant="outline" className="gap-1.5" onClick={reset}>
              <RotateCcw className="size-4" /> Reset
            </Button>
            <Button type="button" variant="ghost" className="gap-1.5" onClick={() => router.push("/inventory")}>
              <LogOut className="size-4" /> Quit
            </Button>
          </div>
        </div>
      </form>

      {!submitted ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm text-muted-foreground">
          Enter a part number or part code and click Show.
        </p>
      ) : isError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">{errorMessage(error)}</p>
      ) : !data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* ── Part details ── */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Link href={`/inventory/${data.part.id}`} className="font-mono text-lg font-semibold text-slate-800 hover:underline">
                  {data.part.partNumber}
                </Link>
                <p className="text-sm text-slate-500">{data.part.name}</p>
              </div>
              <PartStatusBadge status={data.part.partStatus} />
            </div>
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Part code", data.part.partCode],
                ["Flag", data.part.partFlag],
                ["Taxable", data.part.taxable ? "Yes" : "No"],
                ["UOM", data.part.uom],
                ["Dealer rate", fmtNaira(data.part.dealerRate)],
                ["Retail rate", data.part.retailRate != null ? fmtNaira(data.part.retailRate) : "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="mt-0.5 text-slate-700">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Grid 1: premises store locations ── */}
          <Grid
            icon={<Boxes className="size-4" />}
            title={premisesName ? `Stock at ${premisesName}` : "Stock at your premises"}
            subtitle={data.locations.length ? `Total ${data.totals.premisesStock}` : undefined}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Store location</th>
                  {STOCK_HEADERS}
                </tr>
              </thead>
              <tbody>
                <StoreRows
                  rows={data.locations}
                  empty={crossBranch ? "Choose a branch under Query from to see its store locations." : "No store locations found for your branch."}
                />
              </tbody>
            </table>
          </Grid>

          {/* ── Grid 2: alternates ── */}
          <Grid icon={<GitBranch className="size-4" />} title="Alternate part details">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Part no.</th>
                  <th className={thCls}>Description</th>
                  <th className={thCls}>Store location</th>
                  {STOCK_HEADERS}
                </tr>
              </thead>
              <tbody>
                <AlternateRows rows={data.alternates} />
              </tbody>
            </table>
          </Grid>

          {/* ── Grid 3: other branches ── */}
          <Grid
            icon={<Building2 className="size-4" />}
            title="Branch stock details"
            subtitle={data.otherBranches.length ? `Total ${data.totals.otherBranchesStock}` : undefined}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Branch</th>
                  {STOCK_HEADERS}
                </tr>
              </thead>
              <tbody>
                <StoreRows rows={data.otherBranches} empty="No other branch holds this part." />
              </tbody>
            </table>
          </Grid>
        </>
      )}
    </div>
  );
}
