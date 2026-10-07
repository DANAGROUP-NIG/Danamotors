"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { REPORT_PERMISSIONS } from "@/features/auth/roles";
import { cn } from "@/lib/utils";
import { getReportSettingsRequest, saveReportSettingsRequest, type MileageBand } from "../api/reports.api";

type BandDraft = { key: string; fromKm: string; toKm: string; label: string; active: boolean };

const km = new Intl.NumberFormat("en-NG");
let nextKey = 0;
const toDraft = (band: MileageBand): BandDraft => ({
  key: `b${(nextKey += 1)}`,
  fromKm: String(band.fromKm),
  toKm: band.toKm === null ? "" : String(band.toKm),
  label: band.label,
  active: band.active,
});

/** "1,001–5,000 km", or "40,001+ km" for an open band. */
function suggestedLabel(fromKm: string, toKm: string) {
  if (fromKm === "") return "";
  return toKm === "" ? `${km.format(Number(fromKm))}+ km` : `${km.format(Number(fromKm))}–${km.format(Number(toKm))} km`;
}

/** Mirrors the server's checks (ascending, no overlaps, only the last band open-ended) per row. */
export function bandErrors(bands: BandDraft[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const active = bands.filter((band) => band.active);
  active.forEach((band, index) => {
    const from = Number(band.fromKm);
    const to = band.toKm === "" ? null : Number(band.toKm);
    if (band.fromKm === "" || !Number.isInteger(from) || from < 0) errors[band.key] = "Enter a whole number of kilometres";
    else if (to !== null && (!Number.isInteger(to) || to < from)) errors[band.key] = "“To” must be at least “From”";
    else if (to === null && index !== active.length - 1) errors[band.key] = "Only the last band can be open-ended";
    else if (index > 0) {
      const previous = active[index - 1];
      if (previous.toKm !== "" && from <= Number(previous.toKm)) errors[band.key] = `Overlaps with ${previous.label || suggestedLabel(previous.fromKm, previous.toKm)}`;
    }
    if (!errors[band.key] && !band.label.trim() && !suggestedLabel(band.fromKm, band.toKm)) errors[band.key] = "Enter a label";
  });
  return errors;
}

export function ReportSettingsPage() {
  const { hasPermission, isHydrated } = useAuth();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["report-settings"], queryFn: getReportSettingsRequest });
  const [bands, setBands] = useState<BandDraft[]>([]);
  const [dueSoon, setDueSoon] = useState("2");

  useEffect(() => {
    if (!settings.data) return;
    setBands(settings.data.mileageBands.map(toDraft));
    setDueSoon(String(settings.data.dueSoonHours));
  }, [settings.data]);

  const errors = useMemo(() => bandErrors(bands), [bands]);
  const save = useMutation({
    mutationFn: saveReportSettingsRequest,
    onSuccess: (data) => {
      queryClient.setQueryData(["report-settings"], data);
      toast.success("Report settings saved");
    },
    onError: (error: unknown) => toast.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Settings could not be saved"),
  });

  if (isHydrated && !hasPermission(REPORT_PERMISSIONS.SETTINGS)) {
    return <p className="p-6 text-sm text-muted-foreground">You do not have access to report settings.</p>;
  }

  const update = (key: string, patch: Partial<BandDraft>) => setBands((current) => current.map((band) => (band.key === key ? { ...band, ...patch } : band)));
  const dueSoonValue = Number(dueSoon);
  const dueSoonInvalid = dueSoon === "" || !Number.isInteger(dueSoonValue) || dueSoonValue < 0 || dueSoonValue > 72;

  function saveBands() {
    if (Object.keys(errors).length) {
      toast.error("Fix the highlighted bands first");
      return;
    }
    save.mutate({
      mileageBands: bands.map((band) => ({
        fromKm: Number(band.fromKm),
        toKm: band.toKm === "" ? null : Number(band.toKm),
        label: band.label.trim() || suggestedLabel(band.fromKm, band.toKm),
        active: band.active,
      })),
    });
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <div>
        <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/reports" className="hover:text-foreground">Reports</Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span>Settings</span>
        </nav>
        <PageHeader title="Report settings" description="Mileage bands and thresholds used by the workshop reports." />
      </div>

      {settings.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading settings…</div>
      ) : settings.isError ? (
        <div className="rounded-xl border border-[#e8edf3] bg-white p-6 text-center">
          <p role="alert" className="text-sm text-destructive">Report settings could not be loaded.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void settings.refetch()}>Retry</Button>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-[#e8edf3] bg-white shadow-sm" aria-labelledby="bands-heading">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8edf3] px-5 py-4">
              <div>
                <h2 id="bands-heading" className="font-semibold">Mileage bands</h2>
                <p className="text-sm text-muted-foreground">Used by the “vehicles visited, mileage wise” report. Leave “To” empty on the last band for “and above”.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={bands.length >= 30}
                onClick={() => {
                  const last = bands[bands.length - 1];
                  const from = last ? (last.toKm === "" ? "" : String(Number(last.toKm) + 1)) : "0";
                  setBands([...bands, { key: `b${(nextKey += 1)}`, fromKm: from, toKm: "", label: "", active: true }]);
                }}
              >
                <Plus className="size-4" />
                Add band
              </Button>
            </div>
            <div className="overflow-x-auto px-5 py-3">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th scope="col" className="w-14 py-2 font-semibold">Order</th>
                    <th scope="col" className="py-2 font-semibold">From (km)</th>
                    <th scope="col" className="py-2 font-semibold">To (km)</th>
                    <th scope="col" className="py-2 font-semibold">Label</th>
                    <th scope="col" className="w-20 py-2 font-semibold">Active</th>
                    <th scope="col" className="w-12 py-2"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((band, index) => (
                    <tr key={band.key} className="border-t border-[#e8edf3] align-top">
                      <td className="py-2.5 text-muted-foreground">{index + 1}</td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min={0}
                          aria-label={`Band ${index + 1} from`}
                          aria-invalid={Boolean(errors[band.key])}
                          className={cn(inputCls, errors[band.key] && "border-red-400 focus:ring-red-300")}
                          value={band.fromKm}
                          onChange={(event) => update(band.key, { fromKm: event.target.value })}
                        />
                        {errors[band.key] && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="size-3.5" />{errors[band.key]}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <input type="number" min={0} aria-label={`Band ${index + 1} to`} placeholder="and above" className={inputCls} value={band.toKm} onChange={(event) => update(band.key, { toKm: event.target.value })} />
                      </td>
                      <td className="py-2 pr-3">
                        <input aria-label={`Band ${index + 1} label`} className={inputCls} placeholder={suggestedLabel(band.fromKm, band.toKm)} value={band.label} onChange={(event) => update(band.key, { label: event.target.value })} />
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={band.active}
                          aria-label={`Band ${index + 1} active`}
                          onClick={() => update(band.key, { active: !band.active })}
                          className={cn("relative mt-2 inline-flex h-6 w-11 rounded-full transition-colors", band.active ? "bg-primary" : "bg-slate-300")}
                        >
                          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform", band.active ? "translate-x-5" : "translate-x-0.5")} />
                        </button>
                      </td>
                      <td className="py-2">
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remove band ${index + 1}`} disabled={bands.length === 1} onClick={() => setBands(bands.filter((item) => item.key !== band.key))}>
                          <Trash2 className="size-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t border-[#e8edf3] px-5 py-4">
              <Button onClick={saveBands} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Button>
            </div>
          </section>

          <section className="rounded-xl border border-[#e8edf3] bg-white shadow-sm" aria-labelledby="progress-heading">
            <h2 id="progress-heading" className="border-b border-[#e8edf3] px-5 py-4 font-semibold">Workshop progress</h2>
            <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-4">
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold">Due soon threshold</span>
                <span className="flex items-center">
                  <input type="number" min={0} max={72} className={cn(inputCls, "w-28 rounded-r-none")} value={dueSoon} onChange={(event) => setDueSoon(event.target.value)} aria-invalid={dueSoonInvalid} />
                  <span className="flex h-10 items-center rounded-r-md border border-l-0 border-border bg-muted px-3 text-sm text-muted-foreground">hours</span>
                </span>
                <span className="text-sm text-muted-foreground">Jobs due within this many hours (0–72) are highlighted in amber on the progress reports.</span>
              </label>
              <Button disabled={save.isPending || dueSoonInvalid} onClick={() => save.mutate({ dueSoonHours: dueSoonValue })}>Save changes</Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
