"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { apiDelete, apiGet, apiPut } from "@/lib/api/apiClient";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";

type Estimate = {
  id: string;
  modelId: string;
  model: { id: string; code: string; description: string };
  partAmount: number;
  oilAmount: number;
  labourAmount: number;
};
type EstimateForm = { modelId: string; model?: Estimate["model"]; partAmount: string; oilAmount: string; labourAmount: string; editing: boolean };
const amounts = [["partAmount", "Part"], ["oilAmount", "Oil"], ["labourAmount", "Labour"]] as const;
const newEstimate = (): EstimateForm => ({ modelId: "", partAmount: "0", oilAmount: "0", labourAmount: "0", editing: false });
const errorMessage = (error: unknown) => isAxiosError(error) ? error.response?.data?.message ?? "Could not save the estimate" : "Could not save the estimate";
const total = (row: Pick<Estimate, "partAmount" | "oilAmount" | "labourAmount">) =>
  (Math.round(row.partAmount * 100) + Math.round(row.oilAmount * 100) + Math.round(row.labourAmount * 100)) / 100;

// Legacy Defect → "Estimate (user entered)": expected part, oil and labour per model.
export function DefectModelEstimates({ defectId }: { defectId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EstimateForm | null>(null);
  const query = useQuery({
    queryKey: ["defect-model-estimates", defectId],
    queryFn: () => apiGet<{ items: Estimate[] }>(`/workshop-masters/${defectId}/model-estimates`),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["defect-model-estimates", defectId] });
  const save = useMutation({
    mutationFn: (values: EstimateForm) => apiPut(`/workshop-masters/${defectId}/model-estimates/${values.modelId}`, {
      partAmount: Number(values.partAmount),
      oilAmount: Number(values.oilAmount),
      labourAmount: Number(values.labourAmount),
    }),
    onSuccess: async () => { setForm(null); await invalidate(); },
  });
  const remove = useMutation({
    mutationFn: (modelId: string) => apiDelete(`/workshop-masters/${defectId}/model-estimates/${modelId}`),
    onSuccess: invalidate,
  });
  return <section className="space-y-3 border-t p-5" aria-label="Model-wise estimates">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-semibold">Model-wise estimates</h3>
      <Button type="button" variant="outline" onClick={() => { save.reset(); setForm(newEstimate()); }}>Add model</Button>
    </div>
    <p className="text-sm text-muted-foreground">Expected part, oil and labour amounts (NGN) to repair this defect on each model.</p>
    {query.isError && <p role="alert">Could not load estimates. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}
    <DataTable data={query.data?.items ?? []} rowKey={row => row.id} isLoading={query.isLoading}
      columns={[
        { header: "Model", render: row => `${row.model.description} (${row.model.code})` },
        ...amounts.map(([key, label]) => ({ header: label, render: (row: Estimate) => row[key].toLocaleString() })),
        { header: "Total", render: row => total(row).toLocaleString() },
        { header: "Actions", render: row => <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => { save.reset(); setForm({
            modelId: row.modelId, model: row.model, editing: true,
            partAmount: String(row.partAmount), oilAmount: String(row.oilAmount), labourAmount: String(row.labourAmount),
          }); }}>Edit</Button>
          <Button type="button" variant="outline" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(row.modelId)}>Remove</Button>
        </div> },
      ]} />
    {remove.isError && <p role="alert" className="text-destructive">{errorMessage(remove.error)}</p>}
    {form && <form className="grid gap-3 rounded border p-3 md:grid-cols-4" onSubmit={event => { event.preventDefault(); save.mutate(form); }}>
      <WorkshopPicker required label="Model" endpoint="/workshop-masters?kind=MODEL" collection="items"
        value={form.modelId} selectedRecord={form.model} disabled={form.editing}
        onChange={modelId => setForm({ ...form, modelId })} />
      {amounts.map(([key, label]) => <Field key={key} label={label}><input className={inputCls} required type="number" min="0" max="1000000000000" step="0.01"
        value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></Field>)}
      {save.isError && <p role="alert" className="text-destructive md:col-span-4">{errorMessage(save.error)}</p>}
      <div className="flex gap-2 md:col-span-4"><Button disabled={save.isPending || !form.modelId}>Save estimate</Button>
        <Button type="button" variant="outline" onClick={() => setForm(null)}>Cancel</Button></div>
    </form>}
  </section>;
}
