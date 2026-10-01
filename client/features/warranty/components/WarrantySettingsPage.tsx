"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, Pencil, PlusCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import { Field, inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { useSaveVehicleModel, useSaveWarrantyCode, useVehicleModels, useWarrantyCodes } from "../hooks/use-warranty";
import type { CodeType, VehicleModel, WarrantyCode } from "../types/warranty.types";
import { Pill, tdCls, thCls } from "./ui";

type Tab = "models" | CodeType;

const TABS: { value: Tab; label: string }[] = [
  { value: "models", label: "Model policies" },
  { value: "complaint", label: "Complaint codes" },
  { value: "defect", label: "Defect codes" },
  { value: "position", label: "Position codes" },
  { value: "reject", label: "Reject reasons" },
];

function yearsLabel(days: number | null) {
  if (!days) return "No date limit";
  const years = days / 365;
  return `${Number.isInteger(Math.round(years * 10) / 10) ? Math.round(years) : years.toFixed(1)} years · ${days.toLocaleString("en-NG")} days`;
}

/** Screen 13 — model warranty policies and manufacturer claim codes. */
export function WarrantySettingsPage() {
  const [tab, setTab] = useState<Tab>("models");
  const [editing, setEditing] = useState<VehicleModel | "new" | null>(null);

  return (
    <div className="flex min-h-full">
      <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 lg:p-6">
        <Link href="/warranty" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Warranty Cases
        </Link>
        <PageHeader
          title="Warranty Settings"
          description="Model warranty policies and manufacturer claim codes."
          actions={
            tab === "models" && (
              <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
                <PlusCircle className="size-4" /> Add model
              </Button>
            )
          }
        />
        <div className="flex gap-6 overflow-x-auto border-b border-slate-200" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium",
                tab === t.value ? "border-primary text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "models" ? <ModelsTable onEdit={setEditing} /> : <CodesTable type={tab} />}
      </div>
      {editing && <ModelDrawer model={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ModelsTable({ onEdit }: { onEdit: (m: VehicleModel) => void }) {
  const { data: models = [], isLoading, isError } = useVehicleModels({ includeInactive: true });
  if (isError) return <p className="text-sm text-red-500">Could not load models.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full">
        <thead className="border-b border-slate-200">
          <tr>
            <th className={thCls}>Code</th>
            <th className={thCls}>Make</th>
            <th className={thCls}>Model</th>
            <th className={thCls}>Warranty period</th>
            <th className={thCls}>Km limit</th>
            <th className={thCls}>Covered</th>
            <th className={thCls}>Vehicles linked</th>
            <th className={thCls} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading && (
            <tr>
              <td colSpan={8} className="p-6">
                <div className="h-20 animate-pulse rounded bg-slate-100" />
              </td>
            </tr>
          )}
          {!isLoading && models.length === 0 && (
            <tr>
              <td colSpan={8} className="p-8 text-center text-sm text-slate-400">
                No models yet. Add the models you sell with their warranty policy.
              </td>
            </tr>
          )}
          {models.map((m) => (
            <tr key={m.id} className={cn("hover:bg-slate-50", !m.isActive && "opacity-60")}>
              <td className={`${tdCls} font-mono text-xs`}>{m.code}</td>
              <td className={tdCls}>{m.make}</td>
              <td className={tdCls}>
                {m.name}
                {!m.isActive && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}
              </td>
              <td className={`${tdCls} whitespace-nowrap`}>{yearsLabel(m.warrantyDays)}</td>
              <td className={`${tdCls} whitespace-nowrap`}>{m.warrantyKm ? `${m.warrantyKm.toLocaleString("en-NG")} km` : "No km limit"}</td>
              <td className={tdCls}>
                <Pill status={m.warrantyCovered ? "Covered" : "Not covered"} tone={m.warrantyCovered ? "emerald" : "gray"} />
              </td>
              <td className={tdCls}>{m.vehiclesLinked ?? 0}</td>
              <td className={`${tdCls} text-right`}>
                <button type="button" aria-label={`Edit ${m.name}`} onClick={() => onEdit(m)} className="rounded-md border border-slate-200 p-1.5 hover:bg-slate-50">
                  <Pencil className="size-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelDrawer({ model, onClose }: { model: VehicleModel | null; onClose: () => void }) {
  const save = useSaveVehicleModel();
  const [code, setCode] = useState(model?.code ?? "");
  const [make, setMake] = useState(model?.make ?? "Kia");
  const [name, setName] = useState(model?.name ?? "");
  const [days, setDays] = useState(model?.warrantyDays != null ? String(model.warrantyDays) : "1825");
  const [km, setKm] = useState(model?.warrantyKm != null ? String(model.warrantyKm) : "100000");
  const [covered, setCovered] = useState(model?.warrantyCovered ?? true);
  const [active, setActive] = useState(model?.isActive ?? true);
  const d = days ? Number(days) : null;
  const valid = code.trim() && name.trim() && (d === null || d > 0) && (!km || Number(km) > 0);

  function submit() {
    save.mutate(
      {
        id: model?.id,
        body: {
          code: code.trim(),
          make: make.trim() || "Kia",
          name: name.trim(),
          warrantyDays: d,
          warrantyKm: km ? Number(km) : null,
          warrantyCovered: covered,
          ...(model && { isActive: active }),
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl lg:sticky lg:top-0 lg:h-[calc(100vh-4rem)] lg:shadow-none">
      <div className="flex items-start justify-between border-b border-slate-100 p-5">
        <div>
          <h2 className="text-lg font-semibold">{model ? "Edit model policy" : "Add model"}</h2>
          <p className="text-sm text-slate-500">{model ? "Update the warranty policy for this model." : "Add a model and its warranty policy."}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {model && (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p>
              Changing a policy re-calculates coverage for {(model.vehiclesLinked ?? 0).toLocaleString("en-NG")}{" "}
              {model.vehiclesLinked === 1 ? "vehicle" : "vehicles"}. Existing job cards keep their snapshot.
            </p>
          </div>
        )}
        <Field label="Code">
          <input className={cn(inputCls, "font-mono uppercase")} value={code} onChange={(e) => setCode(e.target.value)} placeholder="KIA-SPG" />
        </Field>
        <Field label="Make">
          <input className={inputCls} value={make} onChange={(e) => setMake(e.target.value)} />
        </Field>
        <Field label="Model name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sportage" />
        </Field>
        <Field label="Warranty period (days)">
          <div className="flex">
            <input className={cn(inputCls, "rounded-r-none")} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
            <span className="flex items-center whitespace-nowrap rounded-r-md border border-l-0 border-border bg-slate-50 px-3 text-sm text-slate-500">
              {d ? `= ${(d / 365).toFixed(d % 365 === 0 ? 0 : 1)} years` : "no limit"}
            </span>
          </div>
        </Field>
        <Field label="Warranty kilometre limit">
          <div className="flex">
            <input className={cn(inputCls, "rounded-r-none")} inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ""))} />
            <span className="flex items-center rounded-r-md border border-l-0 border-border bg-slate-50 px-3 text-sm text-slate-500">km</span>
          </div>
        </Field>
        <Toggle checked={covered} onChange={setCovered} label="Covered by manufacturer warranty" hint="When turned off, vehicles of this model are not eligible for warranty claims." />
        {model && <Toggle checked={active} onChange={setActive} label="Active" hint="Inactive models cannot be linked to new vehicles." />}
      </div>
      <div className="flex justify-between gap-2 border-t border-slate-100 p-5">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!valid || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </aside>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-emerald-500" : "bg-slate-300")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
      <span className="text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function CodesTable({ type }: { type: CodeType }) {
  const { data, isLoading } = useWarrantyCodes(true);
  const save = useSaveWarrantyCode(type);
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<WarrantyCode | null>(null);
  const rows = data?.[type] ?? [];

  function add() {
    save.mutate(
      { body: { code: code.trim(), description: description.trim() } },
      {
        onSuccess: () => {
          setCode("");
          setDescription("");
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim() && description.trim()) add();
        }}
      >
        <div className="w-32">
          <Field label="Code">
            <input className={cn(inputCls, "font-mono uppercase")} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        </div>
        <div className="min-w-60 flex-1">
          <Field label="Description">
            <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" disabled={!code.trim() || !description.trim() || save.isPending}>
          Add code
        </Button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-200">
            <tr>
              <th className={thCls}>Code</th>
              <th className={thCls}>Description</th>
              <th className={thCls}>Status</th>
              <th className={thCls} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={4} className="p-6">
                  <div className="h-16 animate-pulse rounded bg-slate-100" />
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-sm text-slate-400">
                  No codes yet. They are imported from the legacy system or added here.
                </td>
              </tr>
            )}
            {rows.map((r) =>
              editing?.id === r.id ? (
                <tr key={r.id}>
                  <td className={tdCls}>
                    <input className={cn(inputCls, "font-mono")} value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
                  </td>
                  <td className={tdCls}>
                    <input className={inputCls} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                  </td>
                  <td className={tdCls} />
                  <td className={`${tdCls} whitespace-nowrap text-right`}>
                    <Button size="sm" variant="outline" className="mr-2" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        save.mutate({ id: r.id, body: { code: editing.code.trim(), description: editing.description.trim() } }, { onSuccess: () => setEditing(null) })
                      }
                    >
                      Save
                    </Button>
                  </td>
                </tr>
              ) : (
                <tr key={r.id} className={cn(!r.isActive && "opacity-60")}>
                  <td className={`${tdCls} font-mono text-xs`}>{r.code}</td>
                  <td className={tdCls}>{r.description}</td>
                  <td className={tdCls}>
                    <Pill status={r.isActive ? "Active" : "Inactive"} tone={r.isActive ? "emerald" : "gray"} />
                  </td>
                  <td className={`${tdCls} whitespace-nowrap text-right`}>
                    <button type="button" className="mr-3 text-xs font-medium text-blue-700 hover:underline" onClick={() => setEditing(r)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-600 hover:underline"
                      onClick={() => save.mutate({ id: r.id, body: { isActive: !r.isActive } })}
                    >
                      {r.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
