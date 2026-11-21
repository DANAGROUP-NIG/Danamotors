"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, CheckCircle2, Loader2, Printer, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/forms/DateInput";
import { AllToggleMultiSelect } from "@/features/reports/components/AllToggleMultiSelect";
import { SegmentedControl } from "@/features/reports/components/SegmentedControl";
import { cn } from "@/lib/utils";
import { useGenerateCases, useRuleModels, useServiceTypes } from "../hooks/use-csc";
import { addDays, daysBetween, formatDay, nextMonthRange, STAGE_META, todayLocal } from "../lib/csc.logic";
import type { GenerateResult } from "../types/csc.types";
import { CscNav, labelCls } from "./csc-ui";

type Action = "generate" | "print" | "both";
const ACTIONS: { value: Action; label: string }[] = [
  { value: "generate", label: "Generate" },
  { value: "print", label: "Print" },
  { value: "both", label: "Both" },
];

function callSheetHref(input: { from: string; to: string; models?: string[]; services?: string[] }) {
  const params = new URLSearchParams({ from: input.from, to: input.to, status: "open" });
  if (input.models?.length) params.set("model", input.models.join(","));
  if (input.services?.length) params.set("serviceType", input.services.join(","));
  return `/reports/csc-call-sheet?${params.toString()}`;
}

function Stat({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "emerald" | "blue" | "amber" }) {
  const tones = { slate: "text-slate-900", emerald: "text-emerald-700", blue: "text-blue-700", amber: "text-amber-700" } as const;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn("text-2xl font-bold tabular-nums", tones[tone])}>{value.toLocaleString("en-GB")}</p>
    </div>
  );
}

function ResultCard({ result, printHref }: { result: GenerateResult; printHref: string }) {
  const skipped = result.skipped.noStartDate + result.skipped.notVisitedRecently + result.skipped.noSchedule;
  return (
    <section className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 text-emerald-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {result.created ? `${result.created} new case${result.created === 1 ? "" : "s"} generated` : "No new cases: everything due is already generated"}
            </h2>
            <p className="text-sm text-slate-600">Due {formatDay(result.from)} to {formatDay(result.to)} · {result.vehiclesChecked.toLocaleString("en-GB")} vehicles checked</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5"><Link href={STAGE_META.FIRST.href}>Start calling</Link></Button>
          <Button asChild size="sm" className="gap-1.5"><Link href={printHref}><Printer className="size-4" /> Call sheet</Link></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Due in period" value={result.due} />
        <Stat label="New" value={result.created} tone="emerald" />
        <Stat label="Already generated" value={result.alreadyGenerated} tone="blue" />
        <Stat label="Already visited" value={result.alreadyVisited} tone="amber" />
      </div>
      {result.byService.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.byService.map((service) => (
            <span key={service.code} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm">
              <span className="font-mono font-semibold text-primary">{service.code}</span>
              <span className="text-slate-600">{service.description}</span>
              <span className="rounded-full bg-slate-100 px-1.5 text-xs font-semibold tabular-nums text-slate-700">{service.due}</span>
            </span>
          ))}
        </div>
      )}
      {skipped > 0 && (
        <p className="text-xs text-slate-500">
          Left out: {result.skipped.notVisitedRecently} not seen within the master&apos;s &quot;not visited for&quot; months, {result.skipped.noStartDate} with no sale date and no visit
          {result.skipped.noSchedule ? `, ${result.skipped.noSchedule} with no schedule for their sale date` : ""}.
        </p>
      )}
    </section>
  );
}

/** CSC cases generation and print: build the list of vehicles due in a period, then print the call sheet. */
export function GenerateCasesPage() {
  const router = useRouter();
  const today = todayLocal();
  const initial = nextMonthRange(today);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [models, setModels] = useState<string[] | undefined>(undefined);
  const [services, setServices] = useState<string[] | undefined>(undefined);
  const [action, setAction] = useState<Action>("both");
  const ruleModels = useRuleModels();
  const serviceTypes = useServiceTypes();
  const generate = useGenerateCases();

  const span = from && to ? daysBetween(from, to) : -1;
  const problem = !from || !to ? "Choose the from and to dates" : span < 0 ? "The to date must be on or after the from date" : span > 365 ? "The period cannot be longer than 366 days" : null;
  const printHref = callSheetHref({ from, to, models, services });
  const presets = [
    { label: "Next month", range: nextMonthRange(today) },
    { label: "Next 30 days", range: { from: today, to: addDays(today, 30) } },
    { label: "This month", range: { from: `${today.slice(0, 7)}-01`, to: addDays(nextMonthRange(today).from, -1) } },
  ];

  const run = () => {
    if (problem) return;
    if (action === "print") {
      router.push(printHref);
      return;
    }
    generate.mutate({ from, to, modelIds: models, serviceTypeIds: services });
  };

  const modelOptions = (ruleModels.data ?? []).filter((model) => model.versions.length).map((model) => ({ id: model.id, label: model.description, code: model.code, active: model.active }));
  const serviceOptions = (serviceTypes.data ?? []).map((type) => ({ id: type.id, label: type.description, code: type.code, active: true }));

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader title="CSC · Generate cases" description="Find every vehicle whose next service falls due in the period, using the CSC master, and print the call sheet. Running it again never duplicates a case." />
      <CscNav />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><CalendarRange className="size-4 text-primary" /> Due period</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setFrom(preset.range.from);
                    setTo(preset.range.to);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    from === preset.range.from && to === preset.range.to ? "border-primary bg-primary/10 font-medium text-primary" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><span className={labelCls}>From date</span><DateInput value={from} onChange={setFrom} invalid={!!problem && !!from && !!to} /></div>
              <div><span className={labelCls}>To date</span><DateInput value={to} onChange={setTo} invalid={!!problem && !!from && !!to} /></div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AllToggleMultiSelect label="Model" allLabel="All models" value={models} onChange={setModels} options={modelOptions} isLoading={ruleModels.isLoading} isError={ruleModels.isError} />
            <AllToggleMultiSelect label="Service" allLabel="All services" value={services} onChange={setServices} options={serviceOptions} isLoading={serviceTypes.isLoading} isError={serviceTypes.isError} />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4">
            <div>
              <span className={labelCls}>Action</span>
              <SegmentedControl label="Action" value={action} onChange={(value) => setAction(value as Action)} choices={ACTIONS} />
            </div>
            <div className="flex items-center gap-3">
              {problem && <span className="text-sm font-medium text-red-600">{problem}</span>}
              <Button type="button" onClick={run} disabled={!!problem || generate.isPending} className="gap-1.5">
                {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : action === "print" ? <Printer className="size-4" /> : <Sparkles className="size-4" />}
                {action === "print" ? "Open call sheet" : action === "both" ? "Generate and print" : "Generate"}
              </Button>
            </div>
          </div>
        </section>

        <aside className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-5 text-sm text-slate-600">
          <h2 className="font-semibold text-slate-800">How cases are found</h2>
          <ul className="list-disc space-y-2 pl-4">
            <li>After the last scheduled service done, the next free service is due on the sale date plus its due days.</li>
            <li>A free service missed by more than its grace days lapses; the next one is used.</li>
            <li>Paid service (RG) repeats every rotation period from the last one.</li>
            <li>A job opened from 10 days before the due date counts as the visit and closes the case.</li>
            <li>Vehicles not seen for longer than the master&apos;s months are left out.</li>
          </ul>
          <Link href="/csc/schedule" className="inline-block font-medium text-primary hover:underline">Open the CSC master</Link>
        </aside>
      </div>

      {generate.data && <ResultCard result={generate.data} printHref={callSheetHref({ from: generate.data.from, to: generate.data.to, models, services })} />}
      {generate.data && action === "both" && (
        <p className="text-sm text-slate-500">Open the call sheet to print it or export it to Excel.</p>
      )}
    </div>
  );
}
