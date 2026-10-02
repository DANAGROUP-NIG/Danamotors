"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import { jobCardKeys } from "../api/job-card.keys";
import { useAuth } from "@/features/auth/hooks/use-auth";

type LabourItem = { id: string; code: string; description: string; defaultHours: number; rate: number };
type LabourLine = {
  id: string;
  labourItemId: string;
  description: string;
  hours: number;
  rate: number;
  amount: number;
  technicianId?: string | null;
  technician?: { id: string; firstName: string; lastName: string } | null;
};

const formatMoney = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount);

export function JobCardLabourSection({ jobCardId, status, branchId, billedAt }: { jobCardId: string; status: string; branchId: string; billedAt?: string | null }) {
  const queryClient = useQueryClient();
  const { hasPermission, isAdminOrAbove } = useAuth();
  const canEdit = !billedAt && hasPermission("jobcard:labour:update") && !["ready", "completed", "closed", "delivered", "billed", "cancelled"].includes(status.toLowerCase());
  const [labourItemId, setLabourItemId] = useState("");
  const [hours, setHours] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [editing, setEditing] = useState<Record<string, { hours: string; rate: string; technicianId: string }>>({});
  const lines = useQuery({
    queryKey: ["job-card-labour", jobCardId],
    queryFn: async () => apiGet<{ labourLines: LabourLine[] }>(API_ROUTES.service.jobCardLabour(jobCardId)),
  });
  const labourItems = useQuery({
    queryKey: ["labour-items"],
    enabled: canEdit && hasPermission("labour-item:read"),
    queryFn: async () => apiGet<{ labourItems: LabourItem[] }>(API_ROUTES.service.labourItems),
  });
  const users = useQuery({
    queryKey: ["job-card-technicians", branchId],
    queryFn: () => apiGet<{ technicians: { id: string; firstName: string; lastName: string }[] }>(`/workshop/technicians?branchId=${branchId}&limit=100`),
    enabled: canEdit,
  });
  const technicians = users.data?.technicians ?? [];

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["job-card-labour", jobCardId] });
    queryClient.invalidateQueries({ queryKey: jobCardKeys.detail(jobCardId) });
  }
  const addLine = useMutation({
    mutationFn: () => apiPost(API_ROUTES.service.jobCardLabour(jobCardId), {
      labourItemId,
      hours: hours ? Number(hours) : undefined,
      technicianId: technicianId || undefined,
    }),
    onSuccess: () => { toast.success("Labour line added"); setLabourItemId(""); setHours(""); setTechnicianId(""); refresh(); },
    onError: () => toast.error("Could not add labour line"),
  });
  const saveLine = useMutation({
    mutationFn: ({ id, values }: { id: string; values: { hours: number; rate: number; technicianId: string | null } }) => apiPut(API_ROUTES.service.jobCardLabourLine(id), { ...values, rate: isAdminOrAbove ? values.rate : undefined }),
    onSuccess: () => { toast.success("Labour line updated"); refresh(); },
    onError: () => toast.error("Could not update labour line"),
  });
  const removeLine = useMutation({
    mutationFn: (id: string) => apiDelete(API_ROUTES.service.jobCardLabourLine(id)),
    onSuccess: () => { toast.success("Labour line removed"); refresh(); },
    onError: () => toast.error("Could not remove labour line"),
  });

  return (
    <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-semibold text-slate-800">Labour performed</h2><p className="mt-1 text-sm text-slate-500">Recorded hours and rates are copied to the job bill.</p></div>
        {lines.isFetching && <span className="text-xs text-slate-400">Refreshing...</span>}
      </div>
      {lines.isError && <p role="alert" className="text-sm text-red-600">Labour lines could not be loaded.</p>}
      {lines.data?.labourLines.length === 0 && !lines.isError && <p className="text-sm text-slate-500">No labour has been recorded.</p>}
      {(lines.data?.labourLines ?? []).map((line) => {
        const form = editing[line.id] ?? { hours: String(line.hours), rate: String(line.rate), technicianId: line.technicianId ?? "" };
        return <div key={line.id} className="grid gap-3 border-t pt-3 md:grid-cols-[minmax(160px,1fr)_100px_140px_1fr_auto] md:items-end">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{line.description}</p><p className="text-xs text-slate-500">{formatMoney(line.amount)}</p></div>
          <Field label="Hours"><input type="number" min="0.01" step="0.25" className={inputCls} value={form.hours} disabled={!canEdit} onChange={(event) => setEditing((current) => ({ ...current, [line.id]: { ...form, hours: event.target.value } }))} /></Field>
          <Field label="Rate"><input type="number" min="0" step="0.01" className={inputCls} value={form.rate} disabled={!canEdit || !isAdminOrAbove} onChange={(event) => setEditing((current) => ({ ...current, [line.id]: { ...form, rate: event.target.value } }))} /></Field>
          <Field label="Technician"><select className={inputCls} value={form.technicianId} disabled={!canEdit} onChange={(event) => setEditing((current) => ({ ...current, [line.id]: { ...form, technicianId: event.target.value } }))}><option value="">Unassigned</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.firstName} {technician.lastName}</option>)}</select></Field>
          {canEdit && <div className="flex gap-1"><Button type="button" size="sm" variant="outline" disabled={saveLine.isPending} onClick={() => saveLine.mutate({ id: line.id, values: { hours: Number(form.hours), rate: Number(form.rate), technicianId: form.technicianId || null } })}>Save</Button><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${line.description}`} disabled={removeLine.isPending} onClick={() => removeLine.mutate(line.id)}><Trash2 className="size-4" /></Button></div>}
        </div>;
      })}
      {canEdit && <form className="grid gap-3 border-t pt-4 md:grid-cols-[minmax(180px,1fr)_100px_1fr_auto] md:items-end" onSubmit={(event) => { event.preventDefault(); if (labourItemId) addLine.mutate(); }}>
        <Field label="Labour item"><select className={inputCls} value={labourItemId} onChange={(event) => setLabourItemId(event.target.value)} required><option value="">Select labour</option>{labourItems.data?.labourItems.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.description} ({formatMoney(item.rate)}/hr)</option>)}</select>{labourItems.isError && <span className="text-xs text-red-600">Could not load labour items.</span>}</Field>
        <Field label="Hours"><input type="number" min="0.01" step="0.25" className={inputCls} value={hours} onChange={(event) => setHours(event.target.value)} placeholder="Default" /></Field>
        <Field label="Technician"><select className={inputCls} value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}><option value="">Unassigned</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.firstName} {technician.lastName}</option>)}</select></Field>
        <Button type="submit" disabled={!labourItemId || addLine.isPending}><Plus className="size-4" />Add labour</Button>
      </form>}
    </section>
  );
}
