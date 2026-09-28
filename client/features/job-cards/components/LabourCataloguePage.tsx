"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/headers/page-header";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import { useAuth } from "@/features/auth/hooks/use-auth";

type LabourItem = { id: string; code: string; description: string; defaultHours: number; rate: number; active: boolean };
type LabourForm = { code: string; description: string; defaultHours: string; rate: string };
const emptyForm: LabourForm = { code: "", description: "", defaultHours: "1", rate: "" };
const money = (value: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(value);

export function LabourCataloguePage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("labour-item:create");
  const canUpdate = hasPermission("labour-item:update");
  const [form, setForm] = useState<LabourForm>(emptyForm);
  const [editing, setEditing] = useState<Record<string, LabourForm>>({});
  const catalogue = useQuery({
    queryKey: ["labour-items", "all"],
    queryFn: async () => apiGet<{ labourItems: LabourItem[] }>(API_ROUTES.service.labourItems),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["labour-items"] });
  const create = useMutation({
    mutationFn: () => apiPost(API_ROUTES.service.labourItems, {
      code: form.code.trim(),
      description: form.description.trim(),
      defaultHours: Number(form.defaultHours),
      rate: Number(form.rate),
    }),
    onSuccess: () => { toast.success("Labour item created"); setForm(emptyForm); refresh(); },
    onError: () => toast.error("Could not create labour item"),
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<LabourItem> }) => apiPut(API_ROUTES.service.labourItems + `/${id}`, payload),
    onSuccess: () => { toast.success("Labour item updated"); refresh(); },
    onError: () => toast.error("Could not update labour item"),
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.code.trim() || !form.description.trim() || Number(form.defaultHours) <= 0 || Number(form.rate) < 0) return;
    create.mutate();
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader title="Labour Catalogue" description="Standard labour codes, descriptions, hours, and rates." />
      {canCreate && <form className="grid gap-4 border-y py-4 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_120px_160px_auto] lg:items-end" onSubmit={submit}>
        <Field label="Code"><input className={inputCls} maxLength={50} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required /></Field>
        <Field label="Description"><input className={inputCls} maxLength={300} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></Field>
        <Field label="Default hours"><input type="number" min="0.01" step="0.25" className={inputCls} value={form.defaultHours} onChange={(event) => setForm({ ...form, defaultHours: event.target.value })} required /></Field>
        <Field label="Rate (NGN)"><input type="number" min="0" step="0.01" className={inputCls} value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} required /></Field>
        <Button type="submit" disabled={create.isPending}><Plus className="size-4" />Add item</Button>
      </form>}
      {catalogue.isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading labour catalogue...</p> : catalogue.isError ? (
        <div className="py-10 text-center"><p role="alert" className="text-sm text-destructive">Labour catalogue could not be loaded.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => catalogue.refetch()}>Retry</Button></div>
      ) : catalogue.data?.labourItems.length === 0 ? (
        <p className="border-y py-10 text-center text-sm text-muted-foreground">No active labour items.</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full min-w-180 text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="px-3 py-3">Code</th><th className="px-3 py-3">Description</th><th className="px-3 py-3 text-right">Default hours</th><th className="px-3 py-3 text-right">Rate</th>{canUpdate && <th className="px-3 py-3">Actions</th>}</tr></thead><tbody>
          {catalogue.data?.labourItems.map((item) => {
            const draft = editing[item.id] ?? { code: item.code, description: item.description, defaultHours: String(item.defaultHours), rate: String(item.rate) };
            return <tr key={item.id} className="border-b last:border-0"><td className="px-3 py-3"><input className={inputCls} value={draft.code} disabled={!canUpdate} onChange={(event) => setEditing({ ...editing, [item.id]: { ...draft, code: event.target.value } })} /></td><td className="px-3 py-3"><input className={inputCls} value={draft.description} disabled={!canUpdate} onChange={(event) => setEditing({ ...editing, [item.id]: { ...draft, description: event.target.value } })} /></td><td className="px-3 py-3"><input type="number" min="0.01" step="0.25" className={`${inputCls} text-right`} value={draft.defaultHours} disabled={!canUpdate} onChange={(event) => setEditing({ ...editing, [item.id]: { ...draft, defaultHours: event.target.value } })} /></td><td className="px-3 py-3"><input type="number" min="0" step="0.01" className={`${inputCls} text-right`} value={draft.rate} disabled={!canUpdate} onChange={(event) => setEditing({ ...editing, [item.id]: { ...draft, rate: event.target.value } })} /><span className="sr-only">Current rate {money(item.rate)}</span></td>{canUpdate && <td className="px-3 py-3"><div className="flex items-center gap-2"><Button type="button" size="icon" variant="outline" aria-label={`Save ${item.code}`} disabled={update.isPending} onClick={() => update.mutate({ id: item.id, payload: { code: draft.code.trim(), description: draft.description.trim(), defaultHours: Number(draft.defaultHours), rate: Number(draft.rate) } })}><Save className="size-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`Deactivate ${item.code}`} disabled={update.isPending} onClick={() => update.mutate({ id: item.id, payload: { active: false } })}><X className="size-4" /></Button></div></td>}</tr>;
          })}
        </tbody></table></div>
      )}
    </div>
  );
}
