"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";

type ModelSetting = {
  id: string;
  modelId: string;
  model: { id: string; code: string; description: string };
  serviceCharge: number;
  previousCharge: number | null;
  effectiveFrom: string | null;
  active: boolean;
};
type SettingForm = {
  id?: string; modelId: string; model?: ModelSetting["model"];
  serviceCharge: string; previousCharge: string; effectiveFrom: string; active: boolean;
};
const newSetting = (): SettingForm => ({ modelId: "", serviceCharge: "0", previousCharge: "", effectiveFrom: "", active: true });
const errorMessage = (error: unknown) => isAxiosError(error) ? error.response?.data?.message ?? "Could not save model charges" : "Could not save model charges";

export function ServiceTypeModelSettings({ serviceTypeId }: { serviceTypeId: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<SettingForm | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["service-type-model-settings", serviceTypeId, page],
    queryFn: () => apiGet<{ items: ModelSetting[]; meta: { total: number; totalPages: number } }>(
      `/service-type-model-settings?serviceTypeId=${serviceTypeId}&page=${page}&limit=10`,
    ),
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["service-type-model-settings", serviceTypeId] }),
      queryClient.invalidateQueries({ queryKey: ["job-card-service-types"] }),
    ]);
  };
  const save = useMutation({
    mutationFn: (values: SettingForm) => {
      const payload = {
        serviceCharge: Number(values.serviceCharge),
        previousCharge: values.previousCharge === "" ? null : Number(values.previousCharge),
        effectiveFrom: values.effectiveFrom ? `${values.effectiveFrom}T00:00:00.000Z` : null,
        active: values.active,
      };
      return values.id ? apiPut(`/service-type-model-settings/${values.id}`, payload)
        : apiPost('/service-type-model-settings', { ...payload, serviceTypeId, modelId: values.modelId });
    },
    onSuccess: async () => { setForm(null); await invalidate(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/service-type-model-settings/${id}`),
    onSuccess: async () => { setRemoveId(null); setPage(1); await invalidate(); },
  });
  return <section className="space-y-3 border-t p-5" aria-label="Per-model service charges">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-semibold">Per-model service charges</h3>
      <Button type="button" variant="outline" onClick={() => { save.reset(); setForm(newSetting()); }}>Add model</Button>
    </div>
    <p className="text-sm text-muted-foreground">Only configured active models can select this service. Charges are in NGN.</p>
    {query.isError && <p role="alert">Could not load charges. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}
    <DataTable data={query.data?.items ?? []} rowKey={row => row.id} isLoading={query.isLoading}
      page={page} pageSize={10} total={query.data?.meta.total} totalPages={query.data?.meta.totalPages} onPageChange={setPage}
      columns={[
        { header: "Model", render: row => `${row.model.description} (${row.model.code})` },
        { header: "Charge", render: row => row.serviceCharge.toLocaleString() },
        { header: "Previous charge", render: row => row.previousCharge?.toLocaleString() ?? "—" },
        { header: "Effective from", render: row => row.effectiveFrom?.slice(0, 10) ?? "—" },
        { header: "Active", render: row => row.active ? "Yes" : "No" },
        { header: "Actions", render: row => <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => { save.reset(); setForm({
            id: row.id, modelId: row.modelId, model: row.model, serviceCharge: String(row.serviceCharge),
            previousCharge: row.previousCharge === null ? "" : String(row.previousCharge),
            effectiveFrom: row.effectiveFrom?.slice(0, 10) ?? "", active: row.active,
          }); }}>Edit</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { remove.reset(); setRemoveId(row.id); }}>Remove</Button>
        </div> },
      ]} />
    {removeId && <div className="space-y-2 rounded border p-3">
      <p>Remove this model setting? Existing job cards keep their recorded charges.</p>
      <Button type="button" disabled={remove.isPending} onClick={() => remove.mutate(removeId)}>Confirm removal</Button>{" "}
      <Button type="button" variant="outline" onClick={() => setRemoveId(null)}>Cancel</Button>
      {remove.isError && <p role="alert">{errorMessage(remove.error)}</p>}
    </div>}
    {form && <form className="grid gap-3 rounded border p-3" onSubmit={event => { event.preventDefault(); save.mutate(form); }}>
      <WorkshopPicker required label="Model" endpoint="/workshop-masters?kind=MODEL" collection="items"
        value={form.modelId} selectedRecord={form.model} disabled={!!form.id}
        onChange={modelId => setForm({ ...form, modelId })} />
      <Field label="Service charge"><input className={inputCls} required type="number" min="0" max="1000000000000" step="0.01"
        value={form.serviceCharge} onChange={event => setForm({ ...form, serviceCharge: event.target.value })} /></Field>
      <Field label="Previous charge"><input className={inputCls} type="number" min="0" max="1000000000000" step="0.01"
        value={form.previousCharge} onChange={event => setForm({ ...form, previousCharge: event.target.value })} /></Field>
      <Field label="Effective from"><input className={inputCls} type="date" value={form.effectiveFrom}
        onChange={event => setForm({ ...form, effectiveFrom: event.target.value })} /></Field>
      <label className="flex gap-2"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} />Active setting</label>
      {save.isError && <p role="alert" className="text-destructive">{errorMessage(save.error)}</p>}
      <div className="flex gap-2"><Button disabled={save.isPending || !form.modelId}>Save charges</Button>
        <Button type="button" variant="outline" onClick={() => setForm(null)}>Cancel</Button></div>
    </form>}
  </section>;
}
