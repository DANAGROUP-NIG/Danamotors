"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, CheckCircle2, FileSpreadsheet, Loader2, PackageSearch, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { importPriceListRequest } from "../api/inventory.api";
import { inventoryKeys } from "../api/inventory.keys";
import { useCatalogueSummary, usePriceCategories } from "../hooks/use-parts";
import { partErrorMessage } from "../hooks/use-part-mutations";
import { parsePriceListFile, type ParsedPriceList } from "../lib/parse-price-list";
import { fmtNaira } from "./PartStatusBadge";
import type { PriceListRow } from "../types/inventory.types";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";
const ACCEPTED_EXTENSIONS = [".xls", ".xlsx", ".csv", ".txt", ".tsv"];
// Matches the server's PRICE_LIST_BATCH_MAX.
const BATCH = 2000;
const PREVIEW_ROWS = 50;

type Progress = { done: number; total: number; added: number; updated: number; error?: string; finished?: boolean };

/**
 * Legacy FullpartList: the Mobis catalogue behind Part Query's "not in Part Master" lookup. The Mobis price
 * list is the only way parts get into it. Part Master is not changed by loading it.
 */
export function PartCataloguePage() {
  const { hasPermission } = useAuth();
  const canLoad = hasPermission(INVENTORY_PERMISSIONS.SPAREPART_CREATE) && hasPermission(INVENTORY_PERMISSIONS.SPAREPART_UPDATE);
  const summary = useCatalogueSummary();
  const categories = usePriceCategories();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedPriceList | null>(null);
  const [parseError, setParseError] = useState("");
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const saving = progress !== null && !progress.finished;

  // Rows whose price category is unknown or inactive would make their whole batch fail, so they are left out here.
  const checked = useMemo(() => {
    if (!parsed) return null;
    const byCode = new Map((categories.data ?? []).map((c) => [c.code, c]));
    const rows: PriceListRow[] = [];
    const problems = [...parsed.problems];
    for (const row of parsed.rows) {
      const category = row.priceCategoryCode ? byCode.get(row.priceCategoryCode) : undefined;
      if (row.priceCategoryCode && !category) problems.push(`${row.partNumber}: unknown part category ${row.priceCategoryCode}`);
      else if (category && !category.isActive) problems.push(`${row.partNumber}: part category ${row.priceCategoryCode} is inactive`);
      else rows.push(row);
    }
    return { rows, problems };
  }, [parsed, categories.data]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setParseError("");
    setParsed(null);
    setProgress(null);
    setFileName(file.name);
    try {
      setParsed(await parsePriceListFile(file));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "The file could not be read.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (reading || saving) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setParseError(`${file.name} is not a supported file. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
      return;
    }
    onFile(file);
  }

  function clearFile() {
    setParsed(null);
    setFileName("");
    setParseError("");
    setProgress(null);
  }

  async function load() {
    if (!checked?.rows.length) return;
    const rows = checked.rows;
    let state: Progress = { done: 0, total: rows.length, added: 0, updated: 0 };
    setProgress(state);
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      try {
        const result = await importPriceListRequest(batch);
        state = { ...state, done: state.done + batch.length, added: state.added + result.added, updated: state.updated + result.updated };
        setProgress(state);
      } catch (error) {
        setProgress({ ...state, error: partErrorMessage(error, "The price list could not be saved."), finished: true });
        queryClient.invalidateQueries({ queryKey: inventoryKeys.catalogueSummary() });
        return;
      }
    }
    setProgress({ ...state, finished: true });
    queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
  }

  const lastUpdated = summary.data?.lastUpdatedAt ? new Date(summary.data.lastUpdatedAt).toLocaleString() : null;
  const pct = progress ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Mobis Catalogue"
        description="Every part Mobis supplies, from the Mobis price list. Part Query finds a part here when it is not in Part Master, and it can be created from there."
      />

      {/* ── Summary ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <BookOpen className="size-5 text-slate-400" />
          {summary.isLoading ? (
            <Loader2 className="size-4 animate-spin text-slate-400" />
          ) : (
            <div>
              <p className="text-lg font-semibold text-slate-800">{(summary.data?.count ?? 0).toLocaleString()} parts</p>
              <p className="text-sm text-slate-500">{lastUpdated ? `Last updated ${lastUpdated}` : "No price list has been loaded yet."}</p>
            </div>
          )}
        </div>
        <Button asChild variant="outline" className="gap-1.5">
          <Link href="/inventory/part-query">
            <PackageSearch className="size-4" /> Part Query
          </Link>
        </Button>
      </div>

      {canLoad && (
        <>
          {/* ── File ── */}
          <div
            className={cn("rounded-xl border border-slate-200 bg-white p-6 transition-colors", dragging && "border-primary bg-primary/5")}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              if (!dragging) setDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={onDrop}
          >
            <input ref={fileRef} type="file" accept={ACCEPTED_EXTENSIONS.join(",")} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            {!fileName ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 py-10 text-sm text-slate-500 hover:border-primary hover:text-primary",
                  dragging && "border-primary text-primary",
                )}
              >
                <Upload className="size-6" />
                <span className="font-medium">{dragging ? "Drop the file to read it" : "Choose the Mobis price list, or drag it here"}</span>
                <span className="text-xs">Columns: Part No, Part Name, dealer rate (DR / Final DR); optional Flag, Part Category, RR</span>
              </button>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  {reading ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4 text-emerald-600" />}
                  <span className="font-medium">{fileName}</span>
                  {checked && <span className="text-slate-500">· {checked.rows.length.toLocaleString()} part(s) to load</span>}
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => fileRef.current?.click()}>
                    Choose another file
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={clearFile} aria-label="Remove file">
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            )}
            {parseError && <p className="mt-3 text-sm text-red-600">{parseError}</p>}
            {checked && checked.problems.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="size-4" /> {checked.problems.length.toLocaleString()} row(s) will be left out:
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {checked.problems.slice(0, 8).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── Preview ── */}
          {checked && checked.rows.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="mb-4 text-sm font-semibold text-slate-700">
                Preview{checked.rows.length > PREVIEW_ROWS && <span className="font-normal text-slate-400"> · first {PREVIEW_ROWS}</span>}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={thCls}>Part no.</th>
                      <th className={thCls}>Part name</th>
                      <th className={thCls}>Flag</th>
                      <th className={thCls}>Part category</th>
                      <th className={cn(thCls, "text-right")}>Dealer rate</th>
                      <th className={cn(thCls, "text-right")}>Retail rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checked.rows.slice(0, PREVIEW_ROWS).map((r) => (
                      <tr key={r.partNumber} className="border-t border-slate-100">
                        <td className={cn(tdCls, "font-mono font-medium")}>{r.partNumber}</td>
                        <td className={cn(tdCls, "max-w-64 truncate")}>{r.name}</td>
                        <td className={tdCls}>{r.partFlag ?? "O"}</td>
                        <td className={tdCls}>{r.priceCategoryCode ?? "—"}</td>
                        <td className={cn(tdCls, "text-right")}>{fmtNaira(r.dealerRate)}</td>
                        <td className={cn(tdCls, "text-right text-slate-500")}>
                          {r.retailRate != null ? fmtNaira(r.retailRate) : r.priceCategoryCode ? "From category" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Load ── */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                New part numbers are added; parts already in the catalogue take the list&apos;s name and rates. Part Master is not changed.
              </p>
              <Button type="button" className="gap-1.5" disabled={!checked?.rows.length || reading || saving} onClick={load}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Load price list
              </Button>
            </div>
            {progress && (
              <div className="grid gap-2 text-sm">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={cn("h-full transition-all", progress.error ? "bg-red-500" : "bg-primary")} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-slate-600">
                  {progress.done.toLocaleString()} of {progress.total.toLocaleString()} saved · {progress.added.toLocaleString()} added,{" "}
                  {progress.updated.toLocaleString()} updated
                </p>
                {progress.error ? (
                  <p className="text-red-600">
                    {progress.error} The parts saved before this are kept; loading the file again is safe.
                  </p>
                ) : (
                  progress.finished && (
                    <p className="flex items-center gap-1.5 text-emerald-700">
                      <CheckCircle2 className="size-4" /> Price list loaded.
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
