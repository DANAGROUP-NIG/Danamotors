"use client";

import { useState, type ReactNode } from "react";
import { Info, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/forms/DateInput";
import { inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useReportLookup } from "../hooks/use-reports";
import type { LookupSource } from "../api/reports.api";
import { PRESET_LABELS, presetRange } from "../lib/report-dates";
import type { ReportParams } from "../lib/report-params";
import type { FilterKey, ReportConfig } from "../types";
import { AllToggleMultiSelect } from "./AllToggleMultiSelect";
import { periodLabel } from "./ReportPrintLayout";
import { SegmentedControl } from "./SegmentedControl";

const FILTERS: Record<FilterKey, { label: string; all: string; source: LookupSource }> = {
  model: { label: "Model", all: "All models", source: "model" },
  variant: { label: "Variant", all: "All variants", source: "variant" },
  serviceType: { label: "Service type", all: "All service types", source: "serviceType" },
  team: { label: "Service group", all: "All teams", source: "team" },
  receivedBy: { label: "Received by", all: "All advisors", source: "serviceAdvisor" },
  deliveredBy: { label: "Delivered by", all: "All advisors", source: "serviceAdvisor" },
  technician: { label: "Technician", all: "All technicians", source: "technician" },
  complaint: { label: "Customer request", all: "All requests", source: "complaint" },
  labourOperation: { label: "Labour operation", all: "All operations", source: "labourOperation" },
};

export const MODE_CHOICES = [
  { value: "both", label: "Detail + summary" },
  { value: "summary", label: "Summary only" },
  { value: "detail", label: "Detail only" },
];

function Section({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-3 border-t border-[#e8edf3] px-4 py-4 first:border-t-0 sm:px-5 lg:grid-cols-[88px_1fr] lg:gap-4", className)}>
      <p className="pt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500 lg:pt-2.5">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function FilterField({ filterKey, value, onChange, branchId, modelIds }: {
  filterKey: FilterKey;
  value: string[] | undefined;
  onChange: (value: string[] | undefined) => void;
  branchId?: string;
  modelIds?: string[];
}) {
  const meta = FILTERS[filterKey];
  const lookup = useReportLookup(meta.source, branchId);
  // Variants follow the model filter when models are picked.
  const options = (lookup.data ?? []).filter((option) => filterKey !== "variant" || !modelIds?.length || modelIds.includes(option.parentId ?? ""));
  return (
    <AllToggleMultiSelect
      label={meta.label}
      allLabel={meta.all}
      value={value}
      onChange={onChange}
      options={options}
      isLoading={lookup.isLoading}
      isError={lookup.isError}
    />
  );
}

/** From/to number filter with an "All" toggle (blank = no limit). */
function RangeField({ label, unit, from, to, onChange }: { label: string; unit?: string; from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(from !== "" || to !== "");
  const all = !open && from === "" && to === "";
  const box = "h-10 w-full min-w-0 rounded-md border border-border px-3 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted/60";
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 cursor-pointer rounded border-border accent-[var(--primary)]"
            checked={all}
            onChange={(event) => {
              setOpen(!event.target.checked);
              if (event.target.checked) onChange("", "");
            }}
          />
          All
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min={0} disabled={all} aria-label={`${label} from`} placeholder={all ? "Any" : `From${unit ? ` (${unit})` : ""}`} className={box} value={from} onChange={(event) => onChange(event.target.value.replace(/\D/g, ""), to)} />
        <input type="number" min={0} disabled={all} aria-label={`${label} to`} placeholder={all ? "Any" : `To${unit ? ` (${unit})` : ""}`} className={box} value={to} onChange={(event) => onChange(from, event.target.value.replace(/\D/g, ""))} />
      </div>
    </div>
  );
}

interface ReportFilterBarProps {
  config: ReportConfig;
  draft: ReportParams;
  onChange: (draft: ReportParams) => void;
  onRun: () => void;
  onReset: () => void;
  isRunning: boolean;
  /** Draft differs from the report on screen. */
  dirty: boolean;
  error: string | null;
  /** Admin / SuperAdmin may pick a branch or all branches. */
  canChooseBranch: boolean;
}

export function ReportFilterBar({ config, draft, onChange, onRun, onReset, isRunning, dirty, error, canChooseBranch }: ReportFilterBarProps) {
  const branches = useBranchStore((state) => state.branches);
  const { period } = config;
  const lookupBranch = canChooseBranch ? draft.branchId : undefined;
  const rangeOptions = (config.options ?? []).flatMap((option) => (option.kind === "range" ? [option] : []));

  const setOption = (key: string, value: string) => onChange({ ...draft, options: { ...draft.options, [key]: value } });
  const setFilter = (key: FilterKey, value: string[] | undefined) => {
    const filters = { ...draft.filters, [key]: value };
    if (value === undefined) delete filters[key];
    onChange({ ...draft, filters });
  };
  const applyPreset = (preset: (typeof period.presets)[number]) => {
    const range = presetRange(preset);
    onChange({ ...draft, from: range.from, to: period.kind === "date" ? range.from : range.to });
  };
  const activePreset = period.presets.find((preset) => {
    const range = presetRange(preset);
    return range.from === draft.from && (period.kind === "date" || range.to === draft.to);
  });

  return (
    <form
      className="rounded-xl border border-[#e8edf3] bg-white shadow-sm print:hidden"
      aria-label={`${config.title} filters`}
      onSubmit={(event) => {
        event.preventDefault();
        onRun();
      }}
    >
      <Section label="Period">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          {period.basis && (
            <div className="grid gap-1.5">
              <span className="text-sm font-semibold">Date on</span>
              <SegmentedControl label="Date on" value={draft.options[period.basis.key]} choices={period.basis.choices} onChange={(value) => setOption(period.basis!.key, value)} />
            </div>
          )}
          {period.kind === "range" ? (
            <>
              <label className="grid w-full gap-1.5 sm:w-44">
                <span className="text-sm font-semibold">{periodLabel(period, draft.options)} from</span>
                <DateInput value={draft.from} onChange={(from) => onChange({ ...draft, from })} />
              </label>
              <label className="grid w-full gap-1.5 sm:w-44">
                <span className="text-sm font-semibold">To</span>
                <DateInput value={draft.to} onChange={(to) => onChange({ ...draft, to })} />
              </label>
            </>
          ) : (
            <label className="grid w-full gap-1.5 sm:w-48">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {period.dateLabel ?? period.label}
                {period.hint && (
                  <span title={period.hint} className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <Info className="size-3.5" aria-hidden />
                    <span className="hidden sm:inline">{period.hint}</span>
                  </span>
                )}
              </span>
              <DateInput value={draft.from} onChange={(date) => onChange({ ...draft, from: date, to: date })} />
            </label>
          )}
          <div className="flex flex-wrap gap-2" aria-label="Quick dates">
            {period.presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                aria-pressed={activePreset === preset}
                className={cn(
                  "h-9 rounded-md border px-3 text-sm font-medium transition-colors",
                  activePreset === preset ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                )}
              >
                {PRESET_LABELS[preset]}
              </button>
            ))}
          </div>
          {canChooseBranch && (
            <label className="grid w-full gap-1.5 sm:ml-auto sm:w-56">
              <span className="text-sm font-semibold">Branch</span>
              <select className={inputCls} value={draft.branchId ?? "ALL"} onChange={(event) => onChange({ ...draft, branchId: event.target.value })}>
                <option value="ALL">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </Section>

      {(config.filters.length > 0 || rangeOptions.length > 0) && (
        <Section label="Filters">
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            {rangeOptions.map((option) => (
              <RangeField
                key={option.key}
                label={option.label}
                unit={option.unit}
                from={draft.options[option.fromKey] ?? ""}
                to={draft.options[option.toKey] ?? ""}
                onChange={(from, to) => onChange({ ...draft, options: { ...draft.options, [option.fromKey]: from, [option.toKey]: to } })}
              />
            ))}
            {config.filters.map((key) => (
              <FilterField
                key={key}
                filterKey={key}
                value={draft.filters[key]}
                onChange={(value) => setFilter(key, value)}
                branchId={lookupBranch}
                modelIds={key === "variant" ? draft.filters.model : undefined}
              />
            ))}
          </div>
        </Section>
      )}

      <Section label="Options">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {(config.options ?? []).map((option) => {
            if (option.kind === "range") return null;
            if (option.kind === "checkbox")
              return (
                <label key={option.key} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer rounded border-border accent-[var(--primary)]"
                    checked={draft.options[option.key] === "true"}
                    onChange={(event) => setOption(option.key, String(event.target.checked))}
                  />
                  {option.label}
                </label>
              );
            if (option.kind === "segmented")
              return <SegmentedControl key={option.key} label={option.label ?? option.key} value={draft.options[option.key]} choices={option.choices} onChange={(value) => setOption(option.key, value)} />;
            if (option.kind === "select")
              return (
                <label key={option.key} className="inline-flex items-center gap-2 text-sm">
                  <span className="font-semibold">{option.label}</span>
                  <select className={cn(inputCls, "w-auto")} value={draft.options[option.key]} onChange={(event) => setOption(option.key, event.target.value)}>
                    {option.choices.map((choice) => (
                      <option key={choice.value} value={choice.value}>{choice.label}</option>
                    ))}
                  </select>
                </label>
              );
            return (
              <label key={option.key} className="inline-flex items-center gap-2 text-sm">
                <span>{option.label}</span>
                <input
                  type="number"
                  min={option.min}
                  max={option.max}
                  className={cn(inputCls, "w-20")}
                  value={draft.options[option.key]}
                  onChange={(event) => setOption(option.key, event.target.value)}
                />
                {option.suffix && <span className="text-muted-foreground">{option.suffix}</span>}
              </label>
            );
          })}
          {config.hasMode && <SegmentedControl label="Print" value={draft.options.mode ?? "both"} choices={MODE_CHOICES} onChange={(value) => setOption("mode", value)} />}

          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:ml-auto sm:w-auto">
            {error ? (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            ) : (
              dirty && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700">Filters changed — run to update</p>
            )}
            <Button type="button" variant="outline" onClick={onReset}>Reset</Button>
            <Button type="submit" disabled={isRunning}>
              <Play className="size-4 fill-current" />
              {isRunning ? "Running…" : "Run report"}
            </Button>
          </div>
        </div>
      </Section>
    </form>
  );
}
