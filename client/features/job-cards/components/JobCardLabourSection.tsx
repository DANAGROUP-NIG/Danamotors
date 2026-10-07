"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import { jobCardKeys } from "../api/job-card.keys";
import { useAuth } from "@/features/auth/hooks/use-auth";

type LabourItem = {
  id: string;
  code: string;
  description: string;
  defaultHours: number;
  rate: number;
};
type Person = { id: string; firstName: string; lastName: string };
type LabourLine = {
  id: string;
  labourItemId: string;
  description: string;
  hours: number;
  standardHours?: number | null;
  rate: number;
  amount: number;
  technicianId?: string | null;
  technician?: Person | null;
  technicians?: { technicianId: string; sharePercent: number | null; technician: Person }[];
};

/** Technicians picked for a line; share "" = even split. */
type TechPick = { technicianId: string; share: string };

const MAX_TECHNICIANS = 3;

function linePicks(line: LabourLine): TechPick[] {
  if (line.technicians?.length) return line.technicians.map((t) => ({ technicianId: t.technicianId, share: t.sharePercent == null ? "" : String(t.sharePercent) }));
  return line.technicianId ? [{ technicianId: line.technicianId, share: "" }] : [];
}

/** Payload for the API, or an error message. Shares: all or none, adding up to 100. */
function techniciansPayload(picks: TechPick[]): { technicians: { technicianId: string; sharePercent?: number }[] } | { error: string } {
  const chosen = picks.filter((pick) => pick.technicianId);
  if (new Set(chosen.map((pick) => pick.technicianId)).size !== chosen.length) return { error: "Pick each technician once" };
  const withShare = chosen.filter((pick) => pick.share.trim() !== "");
  if (withShare.length && withShare.length !== chosen.length) return { error: "Give a share for every technician, or none for an even split" };
  if (withShare.length) {
    const total = withShare.reduce((sum, pick) => sum + Number(pick.share), 0);
    if (withShare.some((pick) => !(Number(pick.share) > 0)) || Math.abs(total - 100) > 0.001) return { error: "Shares must add up to 100%" };
  }
  return { technicians: chosen.map((pick) => ({ technicianId: pick.technicianId, ...(withShare.length ? { sharePercent: Number(pick.share) } : {}) })) };
}

function TechniciansPicker({ value, onChange, options, disabled }: { value: TechPick[]; onChange: (value: TechPick[]) => void; options: Person[]; disabled?: boolean }) {
  const rows = value.length ? value : [{ technicianId: "", share: "" }];
  const update = (index: number, patch: Partial<TechPick>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-semibold">Technicians</span>
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <select className={inputCls} aria-label={`Technician ${index + 1}`} value={row.technicianId} disabled={disabled} onChange={(event) => update(index, { technicianId: event.target.value })}>
            <option value="">{index === 0 ? "Unassigned" : "Select technician"}</option>
            {options.map((person) => (
              <option key={person.id} value={person.id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            max="100"
            aria-label={`Technician ${index + 1} share %`}
            placeholder="%"
            title="Share % (leave blank for an even split)"
            className="h-10 w-16 shrink-0 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:bg-muted/60"
            value={row.share}
            disabled={disabled || rows.length < 2}
            onChange={(event) => update(index, { share: event.target.value })}
          />
          {rows.length > 1 && !disabled && (
            <Button type="button" size="icon" variant="ghost" aria-label={`Remove technician ${index + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}>
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      ))}
      {!disabled && rows.length < MAX_TECHNICIANS && rows[rows.length - 1].technicianId && (
        <button type="button" className="justify-self-start text-sm font-medium text-primary hover:underline" onClick={() => onChange([...rows, { technicianId: "", share: "" }])}>
          + Add technician
        </button>
      )}
    </div>
  );
}

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(
    amount,
  );

export function JobCardLabourSection({
  jobCardId,
  status,
  branchId,
  billedAt,
}: {
  jobCardId: string;
  status: string;
  branchId: string;
  billedAt?: string | null;
}) {
  const queryClient = useQueryClient();
  const { hasPermission, isAdminOrAbove } = useAuth();
  const canEdit =
    !billedAt &&
    hasPermission("jobcard:labour:update") &&
    ![
      "ready",
      "completed",
      "closed",
      "delivered",
      "billed",
      "cancelled",
    ].includes(status.toLowerCase());
  const [labourItemId, setLabourItemId] = useState("");
  const [hours, setHours] = useState("");
  const [picks, setPicks] = useState<TechPick[]>([]);
  const [editing, setEditing] = useState<
    Record<string, { hours: string; rate: string; picks: TechPick[] }>
  >({});
  const lines = useQuery({
    queryKey: ["job-card-labour", jobCardId],
    queryFn: async () =>
      apiGet<{ labourLines: LabourLine[] }>(
        API_ROUTES.service.jobCardLabour(jobCardId),
      ),
  });
  const labourItems = useQuery({
    queryKey: ["labour-items"],
    enabled: canEdit && hasPermission("labour-item:read"),
    queryFn: async () =>
      apiGet<{ labourItems: LabourItem[] }>(API_ROUTES.service.labourItems),
  });
  const users = useQuery({
    queryKey: ["job-card-technicians", branchId],
    queryFn: () =>
      apiGet<{
        technicians: { id: string; firstName: string; lastName: string }[];
      }>(`/workshop/technicians?branchId=${branchId}&limit=100`),
    enabled: canEdit,
  });
  const technicians = users.data?.technicians ?? [];

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["job-card-labour", jobCardId] });
    queryClient.invalidateQueries({ queryKey: jobCardKeys.detail(jobCardId) });
  }
  const addLine = useMutation({
    mutationFn: (technicians: { technicianId: string; sharePercent?: number }[]) =>
      apiPost(API_ROUTES.service.jobCardLabour(jobCardId), {
        labourItemId,
        hours: hours ? Number(hours) : undefined,
        technicians,
      }),
    onSuccess: () => {
      toast.success("Labour line added");
      setLabourItemId("");
      setHours("");
      setPicks([]);
      refresh();
    },
    onError: (error) => toast.error(isAxiosError(error) ? error.response?.data?.message || "Could not add labour line" : "Could not add labour line"),
  });
  const saveLine = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: { hours: number; rate: number; technicians: { technicianId: string; sharePercent?: number }[] };
    }) =>
      apiPut(API_ROUTES.service.jobCardLabourLine(id), {
        ...values,
        rate: isAdminOrAbove ? values.rate : undefined,
      }),
    onSuccess: (_, { id }) => {
      toast.success("Labour line updated");
      setEditing((current) => { const next = { ...current }; delete next[id]; return next; });
      refresh();
    },
    onError: (error) => toast.error(isAxiosError(error) ? error.response?.data?.message || "Could not update labour line" : "Could not update labour line"),
  });
  const removeLine = useMutation({
    mutationFn: (id: string) =>
      apiDelete(API_ROUTES.service.jobCardLabourLine(id)),
    onSuccess: () => {
      toast.success("Labour line removed");
      refresh();
    },
    onError: () => toast.error("Could not remove labour line"),
  });

  return (
    <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-800">Labour performed</h2>
          <p className="mt-1 text-sm text-slate-500">
            Recorded hours and rates are copied to the job bill.
          </p>
        </div>
        {lines.isFetching && (
          <span className="text-sm text-slate-400">Refreshing...</span>
        )}
      </div>
      {lines.isError && (
        <p role="alert" className="text-sm text-red-600">
          Labour lines could not be loaded.
        </p>
      )}
      {lines.data?.labourLines.length === 0 && !lines.isError && (
        <p className="text-sm text-slate-500">No labour has been recorded.</p>
      )}
      {(lines.data?.labourLines ?? []).map((line) => {
        const form = editing[line.id] ?? {
          hours: String(line.hours),
          rate: String(line.rate),
          picks: linePicks(line),
        };
        const lineTechnicians = line.technicians?.length ? line.technicians.map((t) => t.technician) : line.technician ? [line.technician] : [];
        const technicianOptions = [...technicians, ...lineTechnicians.filter((person) => !technicians.some((t) => t.id === person.id))];
        return (
          <div
            key={line.id}
            className="grid gap-3 border-t pt-3 md:grid-cols-[minmax(160px,1fr)_100px_140px_1fr_auto] md:items-end"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{line.description}</p>
              <p className="text-sm text-slate-500">
                {formatMoney(line.amount)}
                {line.standardHours != null && <span className="ml-2 text-xs">Std {line.standardHours} h</span>}
              </p>
            </div>
            <Field label="Hours">
              <input
                type="number"
                min="0.01"
                step="0.01"
                className={inputCls}
                value={form.hours}
                disabled={!canEdit}
                onChange={(event) =>
                  setEditing((current) => ({
                    ...current,
                    [line.id]: { ...form, hours: event.target.value },
                  }))
                }
              />
            </Field>
            <Field label="Rate">
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={form.rate}
                disabled={!canEdit || !isAdminOrAbove}
                onChange={(event) =>
                  setEditing((current) => ({
                    ...current,
                    [line.id]: { ...form, rate: event.target.value },
                  }))
                }
              />
            </Field>
            <TechniciansPicker
              value={form.picks}
              options={technicianOptions}
              disabled={!canEdit}
              onChange={(next) => setEditing((current) => ({ ...current, [line.id]: { ...form, picks: next } }))}
            />
            {canEdit && (
              <div className="flex gap-1 print:hidden">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saveLine.isPending || removeLine.isPending || !Number.isFinite(Number(form.hours)) || Number(form.hours) <= 0 || !form.rate.trim() || !Number.isFinite(Number(form.rate)) || Number(form.rate) < 0}
                  onClick={() => {
                    const payload = techniciansPayload(form.picks);
                    if ("error" in payload) return toast.error(payload.error);
                    saveLine.mutate({
                      id: line.id,
                      values: {
                        hours: Number(form.hours),
                        rate: Number(form.rate),
                        technicians: payload.technicians,
                      },
                    });
                  }}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${line.description}`}
                  disabled={removeLine.isPending}
                  onClick={() => removeLine.mutate(line.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {canEdit && (
        <form
          className="grid gap-3 border-t pt-4 md:grid-cols-[minmax(180px,1fr)_100px_1fr_auto] md:items-end print:hidden"
          onSubmit={(event) => {
            event.preventDefault();
            if (!labourItemId) return;
            const payload = techniciansPayload(picks);
            if ("error" in payload) return toast.error(payload.error);
            addLine.mutate(payload.technicians);
          }}
        >
          <Field label="Labour item">
            <select
              className={inputCls}
              value={labourItemId}
              onChange={(event) => setLabourItemId(event.target.value)}
              required
            >
              <option value="">Select labour</option>
              {labourItems.data?.labourItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} - {item.description} ({formatMoney(item.rate)}/hr)
                </option>
              ))}
            </select>
            {labourItems.isError && (
              <span className="text-sm text-red-600">
                Could not load labour items.
              </span>
            )}
          </Field>
          <Field label="Hours">
            <input
              type="number"
              min="0.01"
              step="0.01"
              className={inputCls}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder="Default"
            />
          </Field>
          <TechniciansPicker value={picks} onChange={setPicks} options={technicians} />
          <Button type="submit" disabled={!labourItemId || addLine.isPending}>
            <Plus className="size-4" />
            Add labour
          </Button>
        </form>
      )}
    </section>
  );
}
