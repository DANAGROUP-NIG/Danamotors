"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, CheckCircle2, Circle, PlusCircle, Siren, Trash2, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import { cn } from "@/lib/utils";
import { useVehicleModels } from "@/features/warranty/hooks/use-warranty";
import { Pill } from "@/features/warranty/components/ui";
import { toDateInput } from "@/features/warranty/lib/warranty-format";
import { useSaveCampaign } from "../hooks/use-campaigns";
import type { Campaign, CampaignPayload, CampaignType, CoveredItem } from "../types/campaign.types";
import { CAMPAIGN_STATUS_LABELS } from "./campaigns-page";

const TYPES: { value: CampaignType; title: string; text: string; icon: ReactNode }[] = [
  { value: "RECALL", title: "Recall", text: "Known defect — vehicles must be called back", icon: <Siren /> },
  { value: "FREE_FIX", title: "Free fix", text: "Repair at no cost to the customer", icon: <Wrench /> },
  { value: "SERVICE_CAMPAIGN", title: "Service campaign", text: "Free or discounted services", icon: <CalendarCheck /> },
];

const textareaCls = "min-h-28 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

type ModelRow = { vehicleModelId: string; name: string; yearFrom: string; yearTo: string };
type ItemRow = { kind: "PART" | "LABOUR"; ref: string; description: string; maxQuantity: string };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-5 first:border-0 first:pt-0">
      <h2 className="mb-4 text-base font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 rounded-full transition-colors", checked ? "bg-blue-600" : "bg-slate-300")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
      {label}
    </label>
  );
}

/** Screen 09 — create or edit a campaign. */
export function CampaignForm({ campaign }: { campaign?: Campaign }) {
  const router = useRouter();
  const save = useSaveCampaign(campaign?.id);
  const { data: allModels = [] } = useVehicleModels();
  const isDraft = !campaign || campaign.status === "DRAFT";

  const [type, setType] = useState<CampaignType>(campaign?.type ?? "RECALL");
  const [code, setCode] = useState(campaign?.code ?? "");
  const [title, setTitle] = useState(campaign?.title ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [defect, setDefect] = useState(campaign?.defectDescription ?? "");
  const [startDate, setStartDate] = useState(toDateInput(campaign?.startDate) || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(toDateInput(campaign?.endDate));
  const [labourCovered, setLabourCovered] = useState(campaign?.labourCovered ?? true);
  const [partsCovered, setPartsCovered] = useState(campaign?.partsCovered ?? true);
  const [models, setModels] = useState<ModelRow[]>(
    (campaign?.models ?? []).map((m) => ({ vehicleModelId: m.vehicleModelId, name: m.vehicleModel.name, yearFrom: m.yearFrom ? String(m.yearFrom) : "", yearTo: m.yearTo ? String(m.yearTo) : "" })),
  );
  const [items, setItems] = useState<ItemRow[]>(
    (campaign?.coveredItems ?? []).map((i: CoveredItem) => ({
      kind: i.kind,
      ref: (i.kind === "PART" ? i.partNumber : i.operationCode) ?? "",
      description: i.description,
      maxQuantity: i.maxQuantity != null ? String(i.maxQuantity) : "",
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const detailsComplete = code.trim().length >= 2 && title.trim().length >= 3 && Boolean(startDate);
  const affected = campaign?.progress.affected ?? 0;

  function payload(): CampaignPayload | null {
    if (!detailsComplete) {
      setError("Enter the campaign code, title and start date");
      return null;
    }
    if (endDate && endDate < startDate) {
      setError("The end date must be on or after the start date");
      return null;
    }
    if (items.some((i) => !i.description.trim() || (i.kind === "PART" && !i.ref.trim()))) {
      setError("Every covered item needs a description, and parts need a part number");
      return null;
    }
    setError(null);
    return {
      code: code.trim(),
      title: title.trim(),
      type,
      description: description.trim() || null,
      defectDescription: defect.trim() || null,
      startDate,
      endDate: endDate || null,
      labourCovered,
      partsCovered,
      models: models.map((m) => ({ vehicleModelId: m.vehicleModelId, yearFrom: m.yearFrom ? Number(m.yearFrom) : null, yearTo: m.yearTo ? Number(m.yearTo) : null })),
      coveredItems: items.map((i) => ({
        kind: i.kind,
        partNumber: i.kind === "PART" ? i.ref.trim() : null,
        operationCode: i.kind === "LABOUR" ? i.ref.trim() || null : null,
        description: i.description.trim(),
        maxQuantity: i.maxQuantity ? Number(i.maxQuantity) : null,
      })),
    };
  }

  function submit(next: "stay" | "vehicles") {
    const body = payload();
    if (!body) return;
    save.mutate(body, { onSuccess: (c) => router.push(next === "vehicles" ? `/campaigns/${c.id}?add=1` : `/campaigns/${c.id}`) });
  }

  const available = allModels.filter((m) => !models.some((x) => x.vehicleModelId === m.id));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
        <Section title="Type">
          <div className="grid gap-3 md:grid-cols-3" role="radiogroup">
            {TYPES.map((t) => {
              const selected = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!isDraft && !selected}
                  onClick={() => setType(t.value)}
                  className={cn(
                    "relative flex items-start gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-40",
                    selected ? "border-2 border-primary" : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <span className="text-slate-700 [&_svg]:size-7">{t.icon}</span>
                  <span>
                    <span className="block font-semibold text-slate-900">{t.title}</span>
                    <span className="block text-xs text-slate-500">{t.text}</span>
                  </span>
                  {selected && (
                    <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-white">
                      <Check className="size-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Details">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Campaign code">
              <input className={cn(inputCls, "font-mono uppercase")} value={code} onChange={(e) => setCode(e.target.value)} placeholder="RC-2026-014" />
            </Field>
            <Field label="Title">
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Engine wiring harness inspection" />
            </Field>
            <Field label="Description">
              <textarea className={textareaCls} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label="Defect description">
              <textarea className={textareaCls} value={defect} onChange={(e) => setDefect(e.target.value)} />
            </Field>
            <Field label="Start date">
              <DateInput value={startDate} onChange={setStartDate} />
            </Field>
            <Field label="End date (optional)">
              <DateInput value={endDate} onChange={setEndDate} />
            </Field>
          </div>
        </Section>

        <Section title="Models affected">
          <div className="space-y-2">
            {models.map((m, idx) => (
              <div key={m.vehicleModelId} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="min-w-28 font-medium">{m.name}</span>
                <span className="text-slate-500">Years</span>
                <input
                  className={cn(inputCls, "h-8 w-20")}
                  inputMode="numeric"
                  placeholder="from"
                  value={m.yearFrom}
                  onChange={(e) => setModels((rows) => rows.map((r, i) => (i === idx ? { ...r, yearFrom: e.target.value.replace(/\D/g, "").slice(0, 4) } : r)))}
                />
                <span className="text-slate-400">–</span>
                <input
                  className={cn(inputCls, "h-8 w-20")}
                  inputMode="numeric"
                  placeholder="to"
                  value={m.yearTo}
                  onChange={(e) => setModels((rows) => rows.map((r, i) => (i === idx ? { ...r, yearTo: e.target.value.replace(/\D/g, "").slice(0, 4) } : r)))}
                />
                <button type="button" aria-label={`Remove ${m.name}`} className="ml-auto rounded p-1 text-slate-400 hover:text-slate-700" onClick={() => setModels((rows) => rows.filter((_, i) => i !== idx))}>
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <select
              className={inputCls}
              value=""
              onChange={(e) => {
                const m = allModels.find((x) => x.id === e.target.value);
                if (m) setModels((rows) => [...rows, { vehicleModelId: m.id, name: m.name, yearFrom: "", yearTo: "" }]);
              }}
            >
              <option value="">Add a model…</option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.make} {m.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">Used for criteria-based vehicle selection.</p>
          </div>
        </Section>

        <Section title="Coverage">
          <div className="mb-4 flex flex-wrap gap-8">
            <Switch checked={labourCovered} onChange={setLabourCovered} label="Labour covered" />
            <Switch checked={partsCovered} onChange={setPartsCovered} label="Parts covered" />
          </div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Covered items</p>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setItems((r) => [...r, { kind: "PART", ref: "", description: "", maxQuantity: "" }])}>
              <PlusCircle className="size-4" /> Add item
            </Button>
          </div>
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-400">
              No covered items. Job card lines matching a covered item are charged to the campaign (free to the customer).
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Kind</th>
                    <th className="px-3 py-2 text-left font-medium">Part number or operation</th>
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="px-3 py-2 text-left font-medium">Max qty.</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => {
                    const set = (patch: Partial<ItemRow>) => setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
                    return (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <select className={cn(inputCls, "h-9 w-28")} value={it.kind} onChange={(e) => set({ kind: e.target.value as ItemRow["kind"] })}>
                            <option value="PART">Part</option>
                            <option value="LABOUR">Labour</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={cn(inputCls, "h-9 font-mono")}
                            value={it.ref}
                            onChange={(e) => set({ ref: e.target.value })}
                            placeholder={it.kind === "PART" ? "91200-D3xxx" : "HRN-01"}
                            title={it.kind === "PART" ? "End with x or * to match a prefix" : undefined}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input className={cn(inputCls, "h-9")} value={it.description} onChange={(e) => set({ description: e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <input className={cn(inputCls, "h-9 w-20")} inputMode="decimal" value={it.maxQuantity} onChange={(e) => set({ maxQuantity: e.target.value })} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" aria-label="Remove item" className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setItems((rows) => rows.filter((_, i) => i !== idx))}>
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="mb-4 flex items-center gap-2 font-semibold">
            Status: <Pill status={CAMPAIGN_STATUS_LABELS[campaign?.status ?? "DRAFT"]} tone={campaign?.status === "ACTIVE" ? "emerald" : "gray"} />
          </p>
          <ul className="space-y-3 text-sm">
            {(
              [
                [detailsComplete, "Details complete"],
                [models.length > 0, "Models selected"],
                [affected > 0, `Affected vehicles added (${affected.toLocaleString("en-NG")})`],
              ] as const
            ).map(([done, label]) => (
              <li key={label} className="flex items-center gap-2">
                {done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5 text-slate-300" />}
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">
            Activate the campaign to notify service advisers and reception managers at affected branches.
          </p>
        </div>
      </aside>

      <div className="flex flex-wrap items-center justify-end gap-3 lg:col-span-2">
        {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
        <Button variant="outline" size="lg" asChild>
          <Link href={campaign ? `/campaigns/${campaign.id}` : "/campaigns"}>Cancel</Link>
        </Button>
        <Button variant="outline" size="lg" disabled={save.isPending} onClick={() => submit("stay")}>
          {campaign ? "Save changes" : "Save draft"}
        </Button>
        <Button size="lg" disabled={save.isPending} onClick={() => submit("vehicles")}>
          Save & add vehicles
        </Button>
      </div>
    </div>
  );
}
