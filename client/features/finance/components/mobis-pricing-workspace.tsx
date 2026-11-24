"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { parseBulletinFile, type ParsedBulletin } from "../lib/parse-price-bulletin";
import {
  MOBIS_PRICING_KEY,
  MOBIS_PRICING_MANAGE,
  applyBulletin,
  getAdjustment,
  getMobisPricing,
  getRevaluationPreview,
  listAdjustments,
  previewBulletin,
  saveMobisPricing,
  type BulletinPreview,
  type BulletinStatus,
  type MobisPricing,
  type PriceAdjustment,
} from "../api/mobis-pricing.api";
import { NumberInput } from "@/components/forms/NumberInput";

const RUNS_KEY = ["mobis-pricing", "adjustments"] as const;
const thCls = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 whitespace-nowrap";
const tdCls = "px-3 py-1.5 whitespace-nowrap";
const naira = (n: number | null | undefined) => (n == null ? "—" : `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string; errors?: { message: string }[] } } })?.response?.data?.errors?.[0]?.message ??
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
  (error instanceof Error ? error.message : fallback);

const STATUS: Record<BulletinStatus, { label: string; cls: string }> = {
  INCREASE: { label: "Goes up", cls: "bg-emerald-50 text-emerald-700" },
  NOT_HIGHER: { label: "Not higher: kept", cls: "bg-slate-100 text-slate-600" },
  NOT_FOUND: { label: "Not in Part Master", cls: "bg-amber-50 text-amber-700" },
};

/**
 * Finance → Mobis pricing. Finance owns the Mobis conversion rate (the MIT screen only shows it) and part
 * price changes: Mobis price bulletins and, when the rate goes up, revaluing every Mobis part. Prices only
 * ever go up. Replaces the legacy DateManager price tool and the SUPERVISOR SQL batches.
 */
export function MobisPricingWorkspace() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(MOBIS_PRICING_MANAGE);
  const pricing = useQuery({ queryKey: MOBIS_PRICING_KEY, queryFn: getMobisPricing });

  return (
    <div className="grid gap-5 p-4 lg:p-6">
      <PageHeader
        title="Mobis pricing"
        description="The conversion rate for Mobis invoices and price lists, and Mobis price bulletins. Part rates only ever go up."
      />
      <RateCard pricing={pricing.data} loading={pricing.isLoading} canManage={canManage} />
      {canManage && pricing.data && <BulletinCard pricing={pricing.data} />}
      <RunsCard />
    </div>
  );
}

function RateCard({ pricing, loading, canManage }: { pricing?: MobisPricing; loading: boolean; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Conversion rate</h2>
          <p className="mt-1 text-sm text-slate-500">Used for every Mobis MIT and MRN. Stores see it but cannot change it.</p>
        </div>
        {canManage && pricing && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Change
          </Button>
        )}
      </div>
      {loading ? (
        <Loader2 className="mt-4 size-5 animate-spin text-slate-400" />
      ) : pricing ? (
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Stat label="₦ per US$" value={pricing.conversionRate.toLocaleString("en-NG")} />
          <Stat label="Dealer factor (share of list price)" value={String(pricing.dealerFactor)} />
          <Stat label="₦ dealer rate per $1 of list price" value={naira(pricing.conversionRate * pricing.dealerFactor)} />
        </dl>
      ) : null}
      {pricing?.updatedAt && <p className="mt-3 text-xs text-slate-400">Last changed {day(pricing.updatedAt)}</p>}
      {editing && pricing && <RateModal pricing={pricing} onClose={() => setEditing(false)} />}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function RateModal({ pricing, onClose }: { pricing: MobisPricing; onClose: () => void }) {
  const qc = useQueryClient();
  const [rate, setRate] = useState(String(pricing.conversionRate));
  const [factor, setFactor] = useState(String(pricing.dealerFactor));
  const [revalue, setRevalue] = useState(true);
  const [remarks, setRemarks] = useState("");
  const newRate = Number(rate);
  const newFactor = Number(factor);
  const goesUp = newRate > pricing.conversionRate;
  const preview = useQuery({
    queryKey: ["mobis-pricing", "revaluation", newRate],
    queryFn: () => getRevaluationPreview(newRate),
    enabled: goesUp,
  });
  const save = useMutation({
    mutationFn: () => saveMobisPricing({ conversionRate: newRate, dealerFactor: newFactor, revalue: goesUp && revalue, remarks: remarks.trim() || undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: MOBIS_PRICING_KEY });
      qc.invalidateQueries({ queryKey: RUNS_KEY });
      toast.success(res.adjustment ? `Rate saved; ${res.adjustment.adjustment.updatedCount.toLocaleString()} part(s) revalued` : "Rate saved");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e, "The rate could not be saved")),
  });
  const valid = newRate > 0 && newFactor > 0 && newFactor <= 1;
  const changed = newRate !== pricing.conversionRate || newFactor !== pricing.dealerFactor;

  return (
    <ModalFame isOpen onClose={onClose} title="Change Mobis pricing" description={`Now ₦${pricing.conversionRate} per US$, dealer factor ${pricing.dealerFactor}.`} preventAccidentalClose={save.isPending}>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="₦ per US$">
            <NumberInput min={0} step="0.01" className={inputCls} value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Field label="Dealer factor">
            <NumberInput min={0} max={1} step="0.001" className={inputCls} value={factor} onChange={(e) => setFactor(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          New MITs use the new rate. A bulletin prices each part at list price × rate × dealer factor (now ₦{(newRate * newFactor || 0).toLocaleString("en-NG")} per $1).
        </p>
        {goesUp ? (
          <label className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={revalue} onChange={(e) => setRevalue(e.target.checked)} />
            <span>
              Also raise dealer and retail rates of Mobis parts (flags O and A) by{" "}
              <b>{preview.data?.ratio ? `${((preview.data.ratio - 1) * 100).toFixed(2)}%` : "…"}</b>
              {preview.data ? ` (${preview.data.parts.toLocaleString()} parts)` : ""}. Local (L) and FOC (F) parts are left alone.
            </span>
          </label>
        ) : (
          newRate > 0 &&
          newRate < pricing.conversionRate && (
            <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="size-4 shrink-0" /> The rate goes down: part rates stay as they are (prices never go down).
            </p>
          )
        )}
        <Field label="Remarks (optional)">
          <input className={inputCls} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid || !changed || save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

function BulletinCard({ pricing }: { pricing: MobisPricing }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedBulletin | null>(null);
  const [preview, setPreview] = useState<BulletinPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [filter, setFilter] = useState<BulletinStatus>("INCREASE");
  const [confirming, setConfirming] = useState(false);

  function clear() {
    setParsed(null);
    setPreview(null);
    setFileName("");
    setReference("");
    setRemarks("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    clear();
    setBusy(true);
    try {
      const p = await parseBulletinFile(file);
      setFileName(file.name);
      setParsed(p);
      setReference(p.title || file.name.replace(/\.xlsx?$/i, ""));
      const prev = await previewBulletin(p.lines);
      setPreview(prev);
      setFilter(prev.summary.increase ? "INCREASE" : "NOT_HIGHER");
    } catch (e) {
      toast.error(errorMessage(e, "The bulletin could not be read"));
    } finally {
      setBusy(false);
    }
  }

  const apply = useMutation({
    mutationFn: () =>
      applyBulletin({
        reference: reference.trim(),
        sourceFileName: fileName,
        effectiveDate: parsed?.effectiveDate,
        remarks: remarks.trim() || undefined,
        conversionRate: preview!.pricing.conversionRate,
        dealerFactor: preview!.pricing.dealerFactor,
        lines: parsed!.lines,
      }),
    onSuccess: (res) => {
      toast.success(`Price adjustment ${res.adjustment.number}: ${res.adjustment.updatedCount.toLocaleString()} part(s) raised`);
      qc.invalidateQueries({ queryKey: RUNS_KEY });
      setConfirming(false);
      clear();
    },
    onError: (e) => toast.error(errorMessage(e, "The bulletin could not be applied")),
  });

  const rows = useMemo(() => (preview?.rows ?? []).filter((r) => r.status === filter), [preview, filter]);
  const stale = preview && (preview.pricing.conversionRate !== pricing.conversionRate || preview.pricing.dealerFactor !== pricing.dealerFactor);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Mobis price bulletin</h2>
      <p className="mt-1 text-sm text-slate-500">
        Upload the bulletin exactly as Mobis sends it (e.g. <i>KIA - Irregular Price Adjustment 06-11-2026 - Others.xlsx</i>). All sheets are read; only the
        part number and the new US$ list price are used. Dealer rate = list × ₦{pricing.conversionRate} × {pricing.dealerFactor}; retail rate = dealer rate × part
        category multiplier. Only parts whose dealer rate goes up are changed.
      </p>

      {!parsed ? (
        <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-8 text-sm text-slate-500 hover:border-primary/40">
          {busy ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
          {busy ? "Reading the bulletin…" : "Choose the bulletin (.xlsx)"}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      ) : (
        <div className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <FileSpreadsheet className="size-5 text-emerald-600" />
            <span className="font-medium">{fileName}</span>
            <span className="text-slate-500">
              {parsed.sheets.map((s) => `${s.name}: ${s.lines}`).join(" · ")} · Go live {day(parsed.effectiveDate ?? null)}
            </span>
            <button className="ml-auto text-slate-400 hover:text-slate-700" onClick={clear} aria-label="Remove file">
              <X className="size-4" />
            </button>
          </div>

          {parsed.problems.length > 0 && (
            <details className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <summary>{parsed.problems.length} note(s) on the file</summary>
              <ul className="mt-2 list-disc pl-5">
                {parsed.problems.slice(0, 50).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </details>
          )}

          {preview && (
            <>
              <div className="flex flex-wrap gap-2">
                {(["INCREASE", "NOT_HIGHER", "NOT_FOUND"] as const).map((s) => {
                  const n = s === "INCREASE" ? preview.summary.increase : s === "NOT_HIGHER" ? preview.summary.notHigher : preview.summary.notFound;
                  return (
                    <button
                      key={s}
                      onClick={() => setFilter(s)}
                      className={cn("rounded-full px-3 py-1 text-sm", STATUS[s].cls, filter === s && "ring-2 ring-primary/40")}
                    >
                      {STATUS[s].label}: <b>{n.toLocaleString()}</b>
                    </button>
                  );
                })}
              </div>
              <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className={thCls}>Part no.</th>
                      <th className={thCls}>Description</th>
                      <th className={thCls}>Cat.</th>
                      <th className={cn(thCls, "text-right")}>New list (US$)</th>
                      <th className={cn(thCls, "text-right")}>Dealer rate now</th>
                      <th className={cn(thCls, "text-right")}>New dealer rate</th>
                      <th className={cn(thCls, "text-right")}>Retail rate now</th>
                      <th className={cn(thCls, "text-right")}>New retail rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.slice(0, 1000).map((r) => (
                      <tr key={r.partNumber}>
                        <td className={cn(tdCls, "font-mono")}>{r.partNumber}</td>
                        <td className={cn(tdCls, "max-w-64 truncate")}>{r.name ?? "—"}</td>
                        <td className={tdCls}>{r.priceCategoryCode ?? "—"}</td>
                        <td className={cn(tdCls, "text-right tabular-nums")}>{usd(r.listPrice)}</td>
                        <td className={cn(tdCls, "text-right tabular-nums")}>{naira(r.oldDealerRate)}</td>
                        <td className={cn(tdCls, "text-right tabular-nums", r.status === "INCREASE" && "font-semibold text-emerald-700")}>{naira(r.newDealerRate)}</td>
                        <td className={cn(tdCls, "text-right tabular-nums")}>{naira(r.oldRetailRate)}</td>
                        <td className={cn(tdCls, "text-right tabular-nums", r.status === "INCREASE" && "font-semibold text-emerald-700")}>
                          {r.status === "INCREASE" ? naira(r.newRetailRate) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 1000 && <p className="p-3 text-xs text-slate-500">Showing the first 1,000 of {rows.length.toLocaleString()}.</p>}
                {rows.length === 0 && <p className="p-6 text-center text-sm text-slate-400">None.</p>}
              </div>

              {stale && (
                <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="size-4 shrink-0" /> The rate changed since this preview. Upload the file again.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bulletin reference">
                  <input className={inputCls} maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} />
                </Field>
                <Field label="Remarks (optional)">
                  <input className={inputCls} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={clear}>
                  Cancel
                </Button>
                <Button disabled={!preview.summary.increase || reference.trim().length < 3 || !!stale} onClick={() => setConfirming(true)}>
                  Raise {preview.summary.increase.toLocaleString()} part rate(s)
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {confirming && preview && (
        <ModalFame isOpen onClose={() => setConfirming(false)} title="Apply the bulletin?" preventAccidentalClose={apply.isPending}>
          <div className="grid gap-4 text-sm">
            <p>
              The dealer and retail rates of <b>{preview.summary.increase.toLocaleString()}</b> part(s) go up at ₦{preview.pricing.conversionRate} × {preview.pricing.dealerFactor}.{" "}
              {preview.summary.notHigher.toLocaleString()} part(s) whose rate would not go up and {preview.summary.notFound.toLocaleString()} not in Part Master are left alone.
            </p>
            <p className="text-slate-500">Every change is kept in Part Rate History under this bulletin. A bulletin can only be applied once.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={apply.isPending}>
                Back
              </Button>
              <Button onClick={() => apply.mutate()} disabled={apply.isPending}>
                {apply.isPending && <Loader2 className="size-4 animate-spin" />} Apply
              </Button>
            </div>
          </div>
        </ModalFame>
      )}
    </section>
  );
}

function RunsCard() {
  const runs = useQuery({ queryKey: RUNS_KEY, queryFn: listAdjustments, retry: false });
  const [open, setOpen] = useState<PriceAdjustment | null>(null);
  if (runs.isError) return null; // no permission to see price runs
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Price runs</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>No.</th>
              <th className={thCls}>Applied</th>
              <th className={thCls}>Reference</th>
              <th className={cn(thCls, "text-right")}>Rate</th>
              <th className={cn(thCls, "text-right")}>Raised</th>
              <th className={cn(thCls, "text-right")}>Kept</th>
              <th className={cn(thCls, "text-right")}>Not in master</th>
              <th className={thCls}>By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(runs.data ?? []).map((a) => (
              <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(a)}>
                <td className={tdCls}>{a.number}</td>
                <td className={tdCls}>{day(a.appliedAt)}</td>
                <td className={cn(tdCls, "max-w-96 truncate")}>{a.reference}</td>
                <td className={cn(tdCls, "text-right tabular-nums")}>
                  {a.kind === "RATE_CHANGE" ? `${a.previousRate} → ${a.conversionRate}` : `${a.conversionRate} × ${a.dealerFactor}`}
                </td>
                <td className={cn(tdCls, "text-right tabular-nums")}>{a.updatedCount.toLocaleString()}</td>
                <td className={cn(tdCls, "text-right tabular-nums")}>{a.kind === "BULLETIN" ? a.notHigherCount.toLocaleString() : "—"}</td>
                <td className={cn(tdCls, "text-right tabular-nums")}>{a.kind === "BULLETIN" ? a.notFoundCount.toLocaleString() : "—"}</td>
                <td className={tdCls}>{`${a.appliedBy.firstName} ${a.appliedBy.lastName}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.data?.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No price runs yet.</p>}
      </div>
      {open && <RunModal run={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function RunModal({ run, onClose }: { run: PriceAdjustment; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const detail = useQuery({ queryKey: ["mobis-pricing", "adjustment", run.id, page], queryFn: () => getAdjustment(run.id, page) });
  const meta = detail.data?.meta;
  return (
    <ModalFame isOpen onClose={onClose} size="wide" title={`Price run ${run.number}`} description={`${run.reference} · ${day(run.appliedAt)}${run.remarks ? ` · ${run.remarks}` : ""}`}>
      <div className="max-h-[60vh] overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr>
              <th className={thCls}>Part no.</th>
              <th className={thCls}>Description</th>
              <th className={cn(thCls, "text-right")}>Dealer rate</th>
              <th className={cn(thCls, "text-right")}>Retail rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(detail.data?.changes ?? []).map((c) => (
              <tr key={c.partNumber}>
                <td className={cn(tdCls, "font-mono")}>{c.partNumber}</td>
                <td className={cn(tdCls, "max-w-64 truncate")}>{c.description}</td>
                <td className={cn(tdCls, "text-right tabular-nums")}>
                  {naira(c.oldDealerRate)} → {naira(c.newDealerRate)}
                </td>
                <td className={cn(tdCls, "text-right tabular-nums")}>
                  {naira(c.oldRetailRate)} → {naira(c.newRetailRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {detail.isLoading && <Loader2 className="m-6 size-5 animate-spin text-slate-400" />}
      </div>
      {meta && meta.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {meta.page} of {meta.totalPages} ({meta.total.toLocaleString()} parts)
          </span>
          <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </ModalFame>
  );
}
