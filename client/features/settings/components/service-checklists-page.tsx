"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { WorkshopPicker, type PickerRecord } from "@/features/job-cards/components/WorkshopPicker";
import { useAuth } from "@/features/auth/hooks/use-auth";

type MasterRef = { id: string; code: string; description: string };
type Totals = { part: number; oil: number; labour: number; total: number };
type Line = {
  id: string;
  kind: "PART" | "LABOUR";
  variant: MasterRef | null;
  quantity: number;
  amount: number;
  sparePart: { partNumber: string; name: string; partType: string; unitPrice: number; retailRate: number | null } | null;
  labourItem: { code: string; description: string } | null;
};
type MileageRow = { id: string; mileage: number; checklist: MasterRef; variant: MasterRef | null; totals: Totals };

const money = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errorMessage = (error: unknown) => isAxiosError(error) ? error.response?.data?.message ?? "Could not save" : "Could not save";
const partLabel = (row: PickerRecord) => {
  const part = row as PickerRecord & { partNumber?: string };
  return [part.partNumber, part.name].filter(Boolean).join(" | ");
};
const variantQuery = (variantId: string) => variantId ? `&variantId=${variantId}` : "";

function TotalsBar({ totals }: { totals?: Totals }) {
  return <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted p-4 text-right sm:grid-cols-4">{([
    ["Estimated part amount", totals?.part],
    ["Estimated oil amount", totals?.oil],
    ["Estimated labour amount", totals?.labour],
    ["Total estimate amount", totals?.total],
  ] as const).map(([label, value]) => <div key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{money(value ?? 0)}</p></div>)}</div>;
}

// Model and variant pickers shared by both sections. No variant = all variants.
function ModelVariant({ modelId, variantId, onModel, onVariant }: {
  modelId: string;
  variantId: string;
  onModel: (id: string) => void;
  onVariant: (id: string) => void;
}) {
  return <>
    <WorkshopPicker required label="Model" endpoint="/workshop-masters?kind=MODEL" collection="items" value={modelId}
      onChange={id => { onModel(id); onVariant(""); }} />
    <WorkshopPicker label="Variant (blank = all variants)" endpoint={`/workshop-masters?kind=VARIANT&parentId=${modelId}`} collection="items"
      value={variantId} disabled={!modelId} onChange={onVariant} />
  </>;
}

function ChecklistDefinition({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [checklistId, setChecklistId] = useState("");
  const [modelId, setModelId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [kind, setKind] = useState<"PART" | "LABOUR">("PART");
  const [itemId, setItemId] = useState("");
  const [value, setValue] = useState("1");
  const ready = !!checklistId && !!modelId;
  const key = ["service-checklist-lines", checklistId, modelId, variantId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => apiGet<{ items: Line[]; totals: Totals }>(`/service-checklists/lines?checklistId=${checklistId}&modelId=${modelId}${variantQuery(variantId)}`),
    enabled: ready,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["service-checklist-lines"] });
  const add = useMutation({
    mutationFn: () => apiPost("/service-checklists/lines", {
      kind, checklistId, modelId, variantId: variantId || null,
      ...(kind === "PART" ? { sparePartId: itemId, quantity: Number(value) } : { labourItemId: itemId, amount: Number(value) }),
    }),
    onSuccess: async () => { setItemId(""); await invalidate(); },
  });
  const update = useMutation({
    mutationFn: ({ line, next }: { line: Line; next: number }) =>
      apiPut(`/service-checklists/lines/${line.id}`, line.kind === "PART" ? { quantity: next } : { amount: next }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/service-checklists/lines/${id}`),
    onSuccess: invalidate,
  });
  const editable = (line: Line) => canManage && (!variantId || line.variant?.id === variantId);
  return <section className="grid gap-4 rounded-xl border border-border bg-background p-4 shadow-sm md:p-6" aria-label="Checklist definition">
    <div><h2 className="font-semibold">Checklist definition</h2>
      <p className="text-sm text-muted-foreground">Parts and labour to do under a checklist on a model. Parts are priced at their retail rate.</p></div>
    <div className="grid gap-3 md:grid-cols-3">
      <WorkshopPicker required label="Service checklist" endpoint="/workshop-masters?kind=CHECKLIST" collection="items" value={checklistId} onChange={setChecklistId} />
      <ModelVariant modelId={modelId} variantId={variantId} onModel={setModelId} onVariant={setVariantId} />
    </div>
    {!ready && <p className="rounded-lg bg-muted/40 p-6 text-center text-sm text-muted-foreground">Select a checklist and a model.</p>}
    {ready && <>
      {query.isError && <p role="alert">Could not load the checklist. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}
      <DataTable data={query.data?.items ?? []} rowKey={row => row.id} isLoading={query.isLoading}
        columns={[
          { header: "Type", render: row => row.kind === "PART" ? row.sparePart?.partType === "O" ? "Oil" : "Part" : "Labour" },
          { header: "Code", render: row => row.sparePart?.partNumber ?? row.labourItem?.code ?? "" },
          { header: "Description", render: row => row.sparePart?.name ?? row.labourItem?.description ?? "" },
          { header: "Variant", render: row => row.variant?.description ?? "All variants" },
          { header: "Rate", render: row => row.sparePart ? money(row.sparePart.retailRate ?? row.sparePart.unitPrice) : "" },
          { header: "Qty", render: row => row.kind === "PART" ? editable(row) ? <input aria-label="Quantity" className={`${inputCls} h-8 w-20`} type="number" min="0.01" step="0.01"
            defaultValue={row.quantity} onBlur={event => Number(event.target.value) > 0 && Number(event.target.value) !== row.quantity && update.mutate({ line: row, next: Number(event.target.value) })} /> : row.quantity : "" },
          { header: "Amount", render: row => row.kind === "LABOUR" && editable(row) ? <input aria-label="Labour amount" className={`${inputCls} h-8 w-28`} type="number" min="0" step="0.01"
            defaultValue={row.amount} onBlur={event => event.target.value !== "" && Number(event.target.value) !== row.amount && update.mutate({ line: row, next: Number(event.target.value) })} />
            : money(row.kind === "LABOUR" ? row.amount : row.quantity * (row.sparePart?.retailRate ?? row.sparePart?.unitPrice ?? 0)) },
          { header: "Actions", render: row => editable(row) && <Button type="button" variant="outline" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(row.id)}>Remove</Button> },
        ]} />
      {(update.isError || remove.isError) && <p role="alert" className="text-destructive">{errorMessage(update.error ?? remove.error)}</p>}
      <TotalsBar totals={query.data?.totals} />
      {canManage && <form className="grid gap-3 rounded-lg border p-3 md:grid-cols-[10rem_minmax(0,1fr)_10rem_auto]" onSubmit={event => { event.preventDefault(); add.mutate(); }}>
        <Field label="Add"><select className={inputCls} value={kind} onChange={event => { setKind(event.target.value as typeof kind); setItemId(""); setValue(event.target.value === "PART" ? "1" : "0"); }}>
          <option value="PART">Part</option><option value="LABOUR">Labour</option></select></Field>
        {kind === "PART"
          ? <WorkshopPicker key="part" required label="Part" endpoint="/inventory/parts" collection="items" value={itemId} formatLabel={partLabel}
            renderOption={row => <span className="font-medium">{partLabel(row)}</span>} onChange={setItemId} />
          : <WorkshopPicker key="labour" required label="Labour" endpoint="/service/labour-items" collection="labourItems" value={itemId} onChange={setItemId} />}
        <Field label={kind === "PART" ? "Quantity" : "Amount"}><input className={inputCls} required type="number" min={kind === "PART" ? "0.01" : "0"} step="0.01"
          value={value} onChange={event => setValue(event.target.value)} /></Field>
        <Button className="self-end" disabled={add.isPending || !itemId}>Add {kind === "PART" ? "part" : "labour"}</Button>
        {add.isError && <p role="alert" className="text-destructive md:col-span-4">{errorMessage(add.error)}</p>}
      </form>}
    </>}
  </section>;
}

function MileageChecklists({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [modelId, setModelId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [mileage, setMileage] = useState("");
  const [checklistId, setChecklistId] = useState("");
  const query = useQuery({
    queryKey: ["service-checklist-mileages", modelId, variantId],
    queryFn: () => apiGet<{ items: MileageRow[] }>(`/service-checklists/mileages?modelId=${modelId}${variantQuery(variantId)}`),
    enabled: !!modelId,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["service-checklist-mileages"] });
  const add = useMutation({
    mutationFn: () => apiPost("/service-checklists/mileages", { modelId, variantId: variantId || null, mileage: Number(mileage), checklistId }),
    onSuccess: async () => { setMileage(""); setChecklistId(""); await invalidate(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/service-checklists/mileages/${id}`),
    onSuccess: invalidate,
  });
  return <section className="grid gap-4 rounded-xl border border-border bg-background p-4 shadow-sm md:p-6" aria-label="Mileage-wise checklists">
    <div><h2 className="font-semibold">Mileage-wise checklists</h2>
      <p className="text-sm text-muted-foreground">Which checklist to follow when a vehicle of the model reaches a mileage.</p></div>
    <div className="grid gap-3 md:grid-cols-2"><ModelVariant modelId={modelId} variantId={variantId} onModel={setModelId} onVariant={setVariantId} /></div>
    {!modelId && <p className="rounded-lg bg-muted/40 p-6 text-center text-sm text-muted-foreground">Select a model.</p>}
    {modelId && <>
      {query.isError && <p role="alert">Could not load mileages. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}
      <DataTable data={query.data?.items ?? []} rowKey={row => row.id} isLoading={query.isLoading}
        columns={[
          { header: "Mileage (km)", render: row => row.mileage.toLocaleString() },
          { header: "Checklist", render: row => `${row.checklist.code} | ${row.checklist.description}` },
          { header: "Variant", render: row => row.variant?.description ?? "All variants" },
          { header: "Est. part", render: row => money(row.totals.part) },
          { header: "Est. oil", render: row => money(row.totals.oil) },
          { header: "Est. labour", render: row => money(row.totals.labour) },
          { header: "Total estimate", render: row => money(row.totals.total) },
          { header: "Actions", render: row => canManage && (!variantId || row.variant?.id === variantId) && <Button type="button" variant="outline" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(row.id)}>Remove</Button> },
        ]} />
      {remove.isError && <p role="alert" className="text-destructive">{errorMessage(remove.error)}</p>}
      {canManage && <form className="grid gap-3 rounded-lg border p-3 md:grid-cols-[10rem_minmax(0,1fr)_auto]" onSubmit={event => { event.preventDefault(); add.mutate(); }}>
        <Field label="Mileage (km)"><input className={inputCls} required type="number" min="1" step="1" value={mileage} onChange={event => setMileage(event.target.value)} /></Field>
        <WorkshopPicker required label="Checklist to be followed" endpoint="/workshop-masters?kind=CHECKLIST" collection="items" value={checklistId} onChange={setChecklistId} />
        <Button className="self-end" disabled={add.isPending || !checklistId || !mileage}>Add mileage</Button>
        {add.isError && <p role="alert" className="text-destructive md:col-span-3">{errorMessage(add.error)}</p>}
      </form>}
    </>}
  </section>;
}

export function ServiceChecklistsPage() {
  const { isAdminOrAbove } = useAuth();
  return <div className="grid gap-5 p-4 lg:p-6">
    <PageHeader title="Service checklists"
      description="What to replace and do under each service checklist, per model, and which checklist applies at each mileage." />
    <p className="text-sm text-muted-foreground">Create checklist codes on <Link className="text-primary underline" href="/settings/workshop-masters">Workshop Masters</Link> (Service checklist).</p>
    <ChecklistDefinition canManage={isAdminOrAbove} />
    <MileageChecklists canManage={isAdminOrAbove} />
  </div>;
}
