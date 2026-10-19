"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranches } from "@/features/branches/hooks/use-branches";

type Category = { code: string; description: string; markupMultiplier: number; isActive: boolean };
type BranchSetting = { branchId: string; discountPercent: number; handlingPercent: number; directCostPercent: number; operationalCostPercent: number };
type CategoryForm = { code: string; description: string; markupMultiplier: string; isActive: boolean; isNew: boolean };
const percents = [
  ["discountPercent", "Discount %"],
  ["handlingPercent", "Handling %"],
  ["directCostPercent", "Direct cost %"],
  ["operationalCostPercent", "Operational cost %"],
] as const;
type PercentKey = typeof percents[number][0];
const errorMessage = (error: unknown) => isAxiosError(error) ? error.response?.data?.message ?? "Could not save" : "Could not save";

// Legacy Part Category Master: each branch kept its own percentages for a category.
function BranchPercentages({ code, canManage }: { code: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { data: branchData } = useBranches({ limit: 100 });
  const [drafts, setDrafts] = useState<Record<string, Record<PercentKey, string>>>({});
  const query = useQuery({
    queryKey: ["part-category", code],
    queryFn: () => apiGet<{ category: { branchSettings: BranchSetting[] } }>(`/inventory/part-categories/${code}`),
  });
  const save = useMutation({
    mutationFn: ({ branchId, values }: { branchId: string; values: Record<PercentKey, string> }) =>
      apiPut(`/inventory/part-categories/${code}/branches/${branchId}`, Object.fromEntries(percents.map(([key]) => [key, Number(values[key] || 0)]))),
    onSuccess: (_, { branchId }) => {
      setDrafts(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== branchId)));
      return queryClient.invalidateQueries({ queryKey: ["part-category", code] });
    },
  });
  const stored = (branchId: string) => {
    const setting = query.data?.category.branchSettings.find(row => row.branchId === branchId);
    return Object.fromEntries(percents.map(([key]) => [key, String(setting?.[key] ?? 0)])) as Record<PercentKey, string>;
  };
  return <section className="space-y-3 border-t p-5" aria-label="Branch percentages">
    <h3 className="font-semibold">Branch percentages</h3>
    <p className="text-sm text-muted-foreground">Discount, handling, direct cost and operational cost % for this category at each branch.</p>
    {query.isError && <p role="alert">Could not load the percentages. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}
    <DataTable data={branchData?.branches ?? []} rowKey={row => row.id} isLoading={query.isLoading}
      columns={[
        { header: "Branch", render: row => row.name },
        ...percents.map(([key, label]) => ({ header: label, render: (row: { id: string }) => {
          const values = drafts[row.id] ?? stored(row.id);
          return <input aria-label={label} className={`${inputCls} h-8 w-24`} type="number" min="0" max="100" step="0.01" disabled={!canManage}
            value={values[key]} onChange={event => setDrafts({ ...drafts, [row.id]: { ...values, [key]: event.target.value } })} />;
        } })),
        { header: "Actions", render: row => canManage && <Button type="button" variant="outline" size="sm" disabled={!drafts[row.id] || save.isPending}
          onClick={() => save.mutate({ branchId: row.id, values: drafts[row.id] })}>Save</Button> },
      ]} />
    {save.isError && <p role="alert" className="text-destructive">{errorMessage(save.error)}</p>}
  </section>;
}

export function PartCategoriesPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("sparepart:update");
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CategoryForm | null>(null);
  const query = useQuery({
    queryKey: ["part-categories"],
    queryFn: () => apiGet<{ categories: Category[] }>("/inventory/part-categories"),
  });
  const save = useMutation({
    mutationFn: (values: CategoryForm) => {
      const payload = { description: values.description, markupMultiplier: Number(values.markupMultiplier), isActive: values.isActive };
      return values.isNew ? apiPost("/inventory/part-categories", { ...payload, code: values.code }) : apiPut(`/inventory/part-categories/${values.code}`, payload);
    },
    onSuccess: async (_, values) => {
      await queryClient.invalidateQueries({ queryKey: ["part-categories"] });
      setForm(values.isNew ? { ...values, isNew: false } : null);
    },
  });
  const multiplier = Number(form?.markupMultiplier);
  return <div className="grid gap-5 p-4 lg:p-6">
    <PageHeader title="Part categories" description="Price categories: the retail multiplier and each branch's discount, handling and cost percentages." />
    {hasPermission("sparepart:create") && <div><Button onClick={() => { save.reset(); setForm({ code: "", description: "", markupMultiplier: "1", isActive: true, isNew: true }); }}>Add category</Button></div>}
    {query.isError && <p role="alert" className="text-red-600">Could not load part categories. <button onClick={() => query.refetch()}>Retry</button></p>}
    <DataTable data={query.data?.categories ?? []} rowKey={row => row.code} isLoading={query.isLoading}
      columns={[
        { header: "Code", render: row => row.code },
        { header: "Description", render: row => row.description },
        { header: "Retail multiplier", render: row => `× ${row.markupMultiplier}` },
        { header: "Status", render: row => <StatusBadge status={row.isActive ? "Active" : "Inactive"} tone={row.isActive ? "emerald" : "gray"} /> },
        { header: "Actions", render: row => <Button variant="outline" size="sm" onClick={() => { save.reset(); setForm({
          code: row.code, description: row.description, markupMultiplier: String(row.markupMultiplier), isActive: row.isActive, isNew: false,
        }); }}>{canManage ? "Edit" : "View"}</Button> },
      ]} />
    <ModalFame isOpen={!!form} size="wide" title={form?.isNew ? "Add part category" : `Part category ${form?.code ?? ""}`} onClose={() => setForm(null)}>{form && <>
      <form className="grid gap-3 p-5 md:grid-cols-3" onSubmit={event => { event.preventDefault(); save.mutate(form); }}>
        <Field label="Category code"><input className={inputCls} required maxLength={2} disabled={!form.isNew}
          value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} /></Field>
        <Field label="Description"><input className={inputCls} required maxLength={100} disabled={!canManage}
          value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></Field>
        <Field label="Retail multiplier (margin)"><input className={inputCls} required type="number" min="0.0001" step="any" disabled={!canManage}
          value={form.markupMultiplier} onChange={event => setForm({ ...form, markupMultiplier: event.target.value })} /></Field>
        <p className="text-sm text-muted-foreground md:col-span-3">
          Retail rate = dealer rate × multiplier. For example a dealer rate of ₦1,000 gives a retail rate of
          ₦{Number.isFinite(multiplier) ? (1000 * multiplier).toLocaleString() : "—"}. Changing the multiplier reprices a part the next time its dealer rate or category is saved.
        </p>
        <label className="flex gap-2"><input type="checkbox" checked={form.isActive} disabled={!canManage} onChange={event => setForm({ ...form, isActive: event.target.checked })} />Active</label>
        {save.isError && <p role="alert" className="text-destructive md:col-span-3">{errorMessage(save.error)}</p>}
        {canManage && <Button className="md:col-span-3" disabled={save.isPending}>Save category</Button>}
      </form>
      {!form.isNew && <BranchPercentages key={form.code} code={form.code} canManage={canManage} />}
    </>}</ModalFame>
  </div>;
}
