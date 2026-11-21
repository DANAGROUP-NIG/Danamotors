"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarPlus, Copy, Loader2, Plus, Save, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/forms/DateInput";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useModelRules, useRuleModels, useSaveRules, useServiceTypes } from "../hooks/use-csc";
import { CSC_PERMISSIONS, formatDay, RULE_FIELDS, ruleProblem, ruleTimeline, todayLocal } from "../lib/csc.logic";
import type { CscModelRules, CscRuleValues, CscServiceType, CscVersion } from "../types/csc.types";
import { CscNav, EmptyPanel, inputCls, labelCls, ServiceChip } from "./csc-ui";

interface DraftRow extends CscRuleValues {
  serviceType: CscServiceType;
  active: boolean;
}
interface Draft {
  effectiveDate: string;
  isNew: boolean;
  notVisitedMonths: number;
  matchDaysBefore: number;
  matchDaysAfter: number;
  rows: DraftRow[];
}

/** Legacy CSCMaster values, offered when a model has no schedule yet. */
const LEGACY: Record<string, CscRuleValues> = {
  "1F": { dueDays: 30, dueKm: 1000, rotationDays: 30, rotationKm: 1000, followUp1Days: 15, followUp2Days: 5, variationDays: 15, variationKm: 500 },
  "2F": { dueDays: 90, dueKm: 5000, rotationDays: 90, rotationKm: 5000, followUp1Days: 15, followUp2Days: 5, variationDays: 45, variationKm: 2500 },
  "3F": { dueDays: 180, dueKm: 10000, rotationDays: 180, rotationKm: 10000, followUp1Days: 15, followUp2Days: 5, variationDays: 90, variationKm: 5000 },
  RG: { dueDays: 270, dueKm: 15000, rotationDays: 90, rotationKm: 5000, followUp1Days: 15, followUp2Days: 5, variationDays: 45, variationKm: 2500 },
};
const BLANK: CscRuleValues = { dueDays: 90, dueKm: 5000, rotationDays: 90, rotationKm: 5000, followUp1Days: 15, followUp2Days: 5, variationDays: 45, variationKm: 2500 };

function fromVersion(version: CscVersion): Draft {
  return {
    effectiveDate: version.effectiveDate,
    isNew: false,
    notVisitedMonths: version.notVisitedMonths,
    matchDaysBefore: version.matchDaysBefore,
    matchDaysAfter: version.matchDaysAfter,
    rows: version.services.map((rule) => ({ ...pick(rule), serviceType: rule.serviceType, active: rule.active })),
  };
}

function pick(values: CscRuleValues): CscRuleValues {
  return Object.fromEntries(RULE_FIELDS.map((field) => [field.key, values[field.key]])) as unknown as CscRuleValues;
}

function legacyDraft(types: CscServiceType[], today: string): Draft {
  return {
    effectiveDate: today,
    isNew: true,
    notVisitedMonths: 48,
    matchDaysBefore: 10,
    matchDaysAfter: 10,
    rows: types.filter((type) => LEGACY[type.code]).map((type) => ({ ...LEGACY[type.code], serviceType: type, active: true })),
  };
}

const numberCell = "h-9 w-full min-w-16 rounded-md border border-border bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted";

/** Days of the cycle as a small bar: calls, due date and when the service lapses. */
function Timeline({ values }: { values: CscRuleValues }) {
  const steps = ruleTimeline(values);
  const max = Math.max(...steps.map((step) => step.day), 1);
  return (
    <div className="relative h-6 min-w-40" aria-label={steps.map((step) => `${step.label} day ${step.day}`).join(", ")}>
      <div className="absolute inset-x-0 top-2.5 h-1 rounded-full bg-slate-100" />
      <div className="absolute top-2.5 h-1 rounded-full bg-amber-200" style={{ left: `${(values.dueDays / max) * 100}%`, right: 0 }} />
      {steps.map((step, index) => (
        <span
          key={step.label}
          title={`${step.label}: day ${step.day}`}
          className={cn("absolute top-1 size-3.5 -translate-x-1/2 rounded-full border-2 border-white shadow", ["bg-blue-500", "bg-amber-500", "bg-primary", "bg-red-400"][index])}
          style={{ left: `${(Math.max(step.day, 0) / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

function ModelSchedule({ data, types, canEdit, otherModels }: { data: CscModelRules; types: CscServiceType[]; canEdit: boolean; otherModels: { id: string; description: string }[] }) {
  const today = todayLocal();
  const [versionDate, setVersionDate] = useState<string | null>(data.versions[0]?.effectiveDate ?? null);
  const [draft, setDraft] = useState<Draft>(() => (data.versions[0] ? fromVersion(data.versions[0]) : legacyDraft(types, today)));
  const [copyTo, setCopyTo] = useState<string[]>([]);
  const [showCopy, setShowCopy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSaveRules();
  useEffect(() => setProblem(null), [draft]);

  const choose = (version: CscVersion) => {
    setVersionDate(version.effectiveDate);
    setDraft(fromVersion(version));
  };
  const newVersion = () => {
    setVersionDate(null);
    setDraft((current) => ({ ...current, effectiveDate: today, isNew: true }));
  };
  const setRow = (index: number, patch: Partial<DraftRow>) => setDraft((current) => ({ ...current, rows: current.rows.map((row, at) => (at === index ? { ...row, ...patch } : row)) }));
  const unused = types.filter((type) => !draft.rows.some((row) => row.serviceType.id === type.id));
  const saved = new Set(data.versions.find((version) => version.effectiveDate === draft.effectiveDate)?.services.map((rule) => rule.serviceTypeId) ?? []);

  const submit = () => {
    if (!draft.effectiveDate) return setProblem("Choose the effective date");
    if (!draft.rows.length) return setProblem("Add at least one service");
    for (const row of draft.rows) {
      const found = ruleProblem(row);
      if (found) return setProblem(`${row.serviceType.code}: ${found}`);
    }
    save.mutate(
      {
        modelIds: [data.model.id, ...copyTo],
        effectiveDate: draft.effectiveDate,
        notVisitedMonths: draft.notVisitedMonths,
        matchDaysBefore: draft.matchDaysBefore,
        matchDaysAfter: draft.matchDaysAfter,
        services: draft.rows.map((row) => ({ ...pick(row), serviceTypeId: row.serviceType.id, active: row.active })),
      },
      {
        onSuccess: () => {
          setVersionDate(draft.effectiveDate);
          setDraft((current) => ({ ...current, isNew: false }));
          setCopyTo([]);
          setShowCopy(false);
        },
      },
    );
  };

  const numberInput = (value: number, onChange: (value: number) => void, label: string, max = 1_000_000) => (
    <input
      aria-label={label}
      className={numberCell}
      inputMode="numeric"
      disabled={!canEdit}
      value={Number.isFinite(value) ? String(value) : ""}
      onChange={(event) => onChange(Math.min(max, Number(event.target.value.replace(/\D/g, "") || 0)))}
    />
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Model</p>
            <h2 className="text-lg font-semibold text-slate-900">{data.model.description} <span className="font-mono text-sm text-slate-400">{data.model.code}</span></h2>
          </div>
          {canEdit && data.versions.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={newVersion}><CalendarPlus className="size-4" /> New version</Button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Schedule versions">
          {data.versions.map((version, index) => (
            <button
              key={version.effectiveDate}
              type="button"
              role="tab"
              aria-selected={versionDate === version.effectiveDate && !draft.isNew}
              onClick={() => choose(version)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-left text-sm transition-colors",
                versionDate === version.effectiveDate && !draft.isNew ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              <span className="block font-medium">From {formatDay(version.effectiveDate)}</span>
              <span className="block text-xs text-slate-500">{index === 0 ? "Latest · " : ""}{version.services.length} services</span>
            </button>
          ))}
          {draft.isNew && <span className="rounded-lg border border-dashed border-primary px-3 py-1.5 text-sm font-medium text-primary">New version</span>}
        </div>
        <p className="mt-3 text-xs text-slate-500">A version applies to vehicles sold on or after its date (the legacy &quot;before date / after date&quot;). Older versions are kept for vehicles sold earlier.</p>
      </section>

      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <span className={labelCls}>Effective from (sale date)</span>
            <DateInput value={draft.effectiveDate} onChange={(value) => setDraft((current) => ({ ...current, effectiveDate: value }))} disabled={!canEdit || !draft.isNew} />
          </div>
          <label className="block">
            <span className={labelCls}>Not visited for last (months)</span>
            {numberInput(draft.notVisitedMonths, (value) => setDraft((current) => ({ ...current, notVisitedMonths: value })), "Not visited for last months", 240)}
          </label>
          <label className="block">
            <span className={labelCls}>Job counts from (days before due)</span>
            {numberInput(draft.matchDaysBefore, (value) => setDraft((current) => ({ ...current, matchDaysBefore: value })), "Days before the due date", 90)}
          </label>
          <label className="block">
            <span className={labelCls}>On time until (days after due)</span>
            {numberInput(draft.matchDaysAfter, (value) => setDraft((current) => ({ ...current, matchDaysAfter: value })), "Days after the due date", 90)}
          </label>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Service</th>
                {RULE_FIELDS.map((field) => (
                  <th key={field.key} title={field.hint} className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                    {field.label}
                    <span className="block font-normal normal-case text-slate-400">{field.unit}</span>
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Cycle</th>
                <th className="px-2 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draft.rows.map((row, index) => (
                <tr key={row.serviceType.id} className={cn(!row.active && "opacity-50")}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ServiceChip service={row.serviceType} />
                      <span className="max-w-36 truncate text-slate-700">{row.serviceType.description}</span>
                    </div>
                  </td>
                  {RULE_FIELDS.map((field) => (
                    <td key={field.key} className="px-1 py-2">
                      {numberInput(row[field.key], (value) => setRow(index, { [field.key]: value } as Partial<DraftRow>), `${row.serviceType.code} ${field.label} ${field.unit}`, field.unit === "days" ? 3650 : 1_000_000)}
                    </td>
                  ))}
                  <td className="px-3 py-2"><Timeline values={row} /></td>
                  <td className="px-2 py-2 text-right">
                    {canEdit && (saved.has(row.serviceType.id) && !draft.isNew ? (
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" checked={row.active} onChange={(event) => setRow(index, { active: event.target.checked })} /> Active
                      </label>
                    ) : (
                      <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove ${row.serviceType.code}`} onClick={() => setDraft((current) => ({ ...current, rows: current.rows.filter((_, at) => at !== index) }))}>
                        <Trash2 className="size-4 text-slate-500" />
                      </Button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-blue-500" /> 1st call</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-amber-500" /> 2nd call</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-primary" /> Due (days from sale)</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-red-400" /> Lapses (after grace)</span>
          <span>The last service in due order (RG) repeats every rotation period.</span>
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            {unused.length > 0 && (
              <select
                aria-label="Add a service"
                className={cn(inputCls, "w-auto")}
                value=""
                onChange={(event) => {
                  const type = types.find((item) => item.id === event.target.value);
                  if (type) setDraft((current) => ({ ...current, rows: [...current.rows, { ...(LEGACY[type.code] ?? BLANK), serviceType: type, active: true }] }));
                }}
              >
                <option value="">+ Add a service…</option>
                {unused.map((type) => <option key={type.id} value={type.id}>{type.code} · {type.description}</option>)}
              </select>
            )}
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setShowCopy((value) => !value)}><Copy className="size-4" /> Apply to other models{copyTo.length ? ` (${copyTo.length})` : ""}</Button>
          </div>
        )}
        {canEdit && showCopy && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Save the same version on these models too</p>
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setCopyTo(copyTo.length === otherModels.length ? [] : otherModels.map((model) => model.id))}>
                {copyTo.length === otherModels.length ? "Clear" : "Select all"}
              </button>
            </div>
            <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {otherModels.map((model) => (
                <label key={model.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={copyTo.includes(model.id)} onChange={(event) => setCopyTo((ids) => (event.target.checked ? [...ids, model.id] : ids.filter((id) => id !== model.id)))} />
                  {model.description}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
          {problem && <span className="mr-auto text-sm font-medium text-red-600" role="alert">{problem}</span>}
          {!canEdit && <span className="mr-auto text-sm text-slate-500">You can view the master but not change it.</span>}
          {canEdit && (
            <Button onClick={submit} disabled={save.isPending} className="gap-1.5">
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {draft.isNew ? "Save new version" : "Save changes"}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

/** CSC master: per model, when each service falls due, when to call, and the visit window. */
export function CscSchedulePage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(CSC_PERMISSIONS.MASTER_UPDATE);
  const models = useRuleModels();
  const types = useServiceTypes();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>("");
  const rules = useModelRules(selected);

  useEffect(() => {
    if (!selected && models.data?.length) setSelected(models.data[0].id);
  }, [models.data, selected]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (models.data ?? []).filter((model) => !term || `${model.description} ${model.code}`.toLowerCase().includes(term));
  }, [models.data, search]);

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader title="CSC master" description="For each model and service: when the next service falls due, when to make the 1st and 2nd calls, and which job counts as the visit." />
      <CscNav />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-label="Models">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
            <input aria-label="Search models" className={`${inputCls} pl-9`} placeholder="Search models" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          {models.isLoading ? (
            <ul className="space-y-2">{Array.from({ length: 6 }, (_, key) => <li key={key} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</ul>
          ) : (
            <ul className="max-h-[calc(100vh-14rem)] space-y-1 overflow-y-auto">
              {visible.map((model) => (
                <li key={model.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(model.id)}
                    aria-current={selected === model.id ? "true" : undefined}
                    className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors", selected === model.id ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-50")}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{model.description}</span>
                      <span className="block truncate font-mono text-xs text-slate-400">{model.code}{model.active ? "" : " · inactive"}</span>
                    </span>
                    {model.versions.length ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{model.versions[0].services} svc</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">No schedule</span>
                    )}
                  </button>
                </li>
              ))}
              {!visible.length && <li className="px-3 py-6 text-center text-sm text-slate-500">No models match</li>}
            </ul>
          )}
        </aside>
        <div className="min-w-0">
          {!selected ? (
            <EmptyPanel icon={<CalendarClock />} title="Choose a model" />
          ) : rules.isLoading || types.isLoading ? (
            <div className="flex min-h-60 items-center justify-center rounded-xl border border-slate-200 bg-white"><Loader2 className="size-6 animate-spin text-slate-400" /></div>
          ) : rules.data && types.data ? (
            <ModelSchedule
              key={selected}
              data={rules.data}
              types={types.data}
              canEdit={canEdit}
              otherModels={(models.data ?? []).filter((model) => model.id !== selected && model.active)}
            />
          ) : (
            <EmptyPanel icon={<Plus />} title="Could not load the schedule">Refresh the page to try again.</EmptyPanel>
          )}
        </div>
      </div>
    </div>
  );
}
