"use client";
import { useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { canonicalJobStatus, hasJobBill } from "../types/job-card-status";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { apiGet, apiPost, apiPut, apiPatch } from "@/lib/api/apiClient";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { jobCardKeys } from "../api/job-card.keys";
import { WorkshopPicker } from "./WorkshopPicker";
import type { JobCard } from "../types/job-card.types";

const nextStatuses: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["QC", "CANCELLED"],
  QC: ["READY", "CANCELLED"],
  READY: ["DELIVERED", "CANCELLED"],
  BILLED: ["DELIVERED"],
};

export function JobCardEditForm({ jobCard }: { jobCard: JobCard }) {
  const queryClient = useQueryClient();

  const { isAdminOrAbove, hasPermission } = useAuth();

  const current = canonicalJobStatus(jobCard.status);
  const billed = hasJobBill(jobCard);
  const canDeliver = (billed && !(jobCard.invoices ?? []).some(invoice => !["CANCELLED", "CANCELED", "VOID"].includes(invoice.status.toUpperCase()) && invoice.outstandingAmount > 0)) || !!jobCard.creditApprovedById;
  const estimateApproved = jobCard.estimates?.[0]?.status === "Approved";
  const [qcNotes, setQcNotes] = useState(jobCard.qcNotes ?? "");
  const late = !!jobCard.promisedAt && new Date() > new Date(jobCard.promisedAt);
  const [serviceCharge, setServiceCharge] = useState(String(jobCard.serviceCharge ?? 0));
  const [status, setStatus] = useState("");
  const [remarks, setRemarks] = useState("");
  const [observations, setObservations] = useState(jobCard.observations ?? "");
  const [workDone, setWorkDone] = useState(jobCard.workDone ?? "");
  const [advisor, setAdvisor] = useState(jobCard.serviceAdvisorId ?? "");
  const [reasons, setReasons] = useState<string[]>([]);

  const lateReasons = useQuery({
    queryKey: ["late-reasons"],

    queryFn: () =>
      apiGet<{
        items: {
          id: string;
          description: string;
        }[];
      }>("/workshop-masters?kind=LATE_REASON&limit=100"),

    enabled: status === "DELIVERED",
  });

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: jobCardKeys.all,
    });

  const qc = useMutation({
    mutationFn: (qcStatus: "PASSED" | "FAILED") => apiPatch(`/workshop/qc/${jobCard.id}`, { qcStatus, qcNotes }),
    onSuccess: async () => { toast.success("Quality check recorded"); await refresh(); },
  });
  const update = useMutation({
    mutationFn: () =>
      apiPut(`/service/job-cards/${jobCard.id}`, {
        ...(billed
          ? {}
          : {
              ...(Number(serviceCharge) !== (jobCard.serviceCharge ?? 0) ? { serviceCharge: Number(serviceCharge) } : {}),
              observations,
              workDone,
            }),

        status: status || undefined,
        remarks: remarks || undefined,

        ...(status === "DELIVERED"
          ? {
              deliveryAdvisorId: advisor,
              lateReasonIds: reasons,
            }
          : {}),
      }),

    onSuccess: async () => {
      toast.success(status === "DELIVERED" ? "Vehicle delivered and gate pass issued" : "Job card updated");
      setStatus("");
      setRemarks("");
      setReasons([]);
      await refresh();
    },
  });

  const credit = useMutation({
    mutationFn: () =>
      apiPost(`/service/job-cards/${jobCard.id}/credit-approval`, {
        remarks,
      }),

    onSuccess: async () => { toast.success("Delivery on credit approved"); await refresh(); },
  });

  if (["DELIVERED", "CANCELLED"].includes(current)) return null;
  const actionError = update.error ?? credit.error ?? qc.error;

  return (
    <form
      className="grid gap-4 rounded-xl border bg-white p-5 print:hidden"
      inert={update.isPending || credit.isPending || qc.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate();
      }}
    >
      <h2 className="font-semibold">Workshop actions</h2>
      {!estimateApproved && !billed && <p className="text-sm text-amber-700">Approve the latest estimate before starting or completing work. <a className="underline" href="#estimate-approval">Open Estimate &amp; Approval</a></p>}
      {current === "QC" && hasPermission("qcstatus:update") && <div className="grid gap-2 border-b pb-3"><Field label="Quality-check findings"><textarea className={inputCls} value={qcNotes} onChange={event => setQcNotes(event.target.value)} /></Field><p className="text-sm">QC: {jobCard.qcStatus || "Pending"}</p><div className="flex gap-2"><Button type="button" disabled={qc.isPending || update.isPending} onClick={() => qc.mutate("PASSED")}>Record QC pass</Button><Button type="button" variant="outline" disabled={qc.isPending || update.isPending} onClick={() => qc.mutate("FAILED")}>Record QC failure</Button></div></div>}
      <ol className="flex flex-wrap gap-3 text-sm">
        {["OPEN", "IN_PROGRESS", "QC", "READY", "BILLED", "DELIVERED"].map(
          (step) => (
            <li
              key={step}
              className={
                step === current ? "font-bold text-primary" : "text-slate-500"
              }
            >
              {step.replaceAll("_", " ")}
            </li>
          ),
        )}
      </ol>
      {!billed && (
        <>
          <Field label="Service charge (NGN)"><input type="number" min="0" max="1000000000000" step="0.01" required className={inputCls} value={serviceCharge} onChange={(event) => setServiceCharge(event.target.value)} /><p className="text-xs text-muted-foreground">Saved as a separate bill line. Confirm this amount before billing; 0 means no service charge.</p></Field>
          <Field label="Observations">
            <textarea
              className={inputCls}
              value={observations}
              maxLength={10000}
              onChange={(e) => setObservations(e.target.value)}
            />
          </Field>
          <Field label="Work done and recommendations">
            <textarea
              className={inputCls}
              value={workDone}
              maxLength={10000}
              onChange={(e) => setWorkDone(e.target.value)}
            />
          </Field>
        </>
      )}
      <Field label="Next action">
        <select
          className={inputCls}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{billed ? "Select an action" : "Save findings only"}</option>
          {(nextStatuses[billed ? "BILLED" : current] ?? []).filter((value) => value !== "DELIVERED" || canDeliver).map((value) => (
            <option key={value} value={value} disabled={(["IN_PROGRESS", "QC", "READY"].includes(value) && !estimateApproved) || (value === "READY" && jobCard.qcStatus?.toUpperCase() !== "PASSED")}>{({ IN_PROGRESS: "Start work", QC: "Send for quality check", READY: "Mark vehicle ready", DELIVERED: "Deliver vehicle and issue gate pass", CANCELLED: "Cancel job card" } as Record<string, string>)[value]}</option>
          ))}
        </select>
      </Field>
      {["READY", "BILLED"].includes(current) && !canDeliver && <p className="text-sm text-muted-foreground">Create and settle the job bill or obtain delivery-on-credit approval before delivering this vehicle.</p>}
      <Field label="Remarks / cancellation reason">
        <textarea
          required={status === "CANCELLED"}
          className={inputCls}
          value={remarks}
          maxLength={2000}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </Field>
      {status === "DELIVERED" && (
        <>
          <WorkshopPicker
            required
            label="Delivery advisor"
            endpoint={`/service/staff?role=ServiceAdviser&branchId=${jobCard.branchId}`}
            collection="users"
            value={advisor}
            onChange={setAdvisor}
          />
          <Field label="Late-delivery reasons (up to six)">
            {late && <p className="text-sm text-amber-700">The promised time has passed. Select at least one reason.</p>}
            {lateReasons.isLoading && <p role="status">Loading reasons...</p>}
            {lateReasons.isError && <p role="alert">Could not load reasons. <button type="button" className="underline" onClick={() => lateReasons.refetch()}>Retry</button></p>}
            <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
              {lateReasons.data?.items.map((reason) => (
                <label key={reason.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={reasons.includes(reason.id)} disabled={reasons.length >= 6 && !reasons.includes(reason.id)} onChange={(event) => setReasons((current) => event.target.checked ? [...current, reason.id] : current.filter((id) => id !== reason.id))} />
                  {reason.description}
                </label>
              ))}
              {lateReasons.data?.items.length === 0 && <p className="text-sm text-muted-foreground">No late-delivery reasons are configured. Ask an administrator to add them in workshop masters.</p>}
            </div>
          </Field>
        </>
      )}
      {(update.isError || credit.isError || qc.isError) && (
        <p role="alert" className="text-sm text-red-600">
          {isAxiosError(actionError) ? actionError.response?.data?.message || "Could not apply action. Please retry." : "Could not apply action. Please retry."}
        </p>
      )}
      {isAdminOrAbove && ["READY", "BILLED"].includes(current) && !jobCard.creditApprovedById && (
        <Button
          type="button"
          variant="outline"
          disabled={!remarks.trim() || credit.isPending || update.isPending}
          onClick={() => credit.mutate()}
        >
          Approve delivery on credit
        </Button>
      )}
      <Button disabled={update.isPending || credit.isPending || reasons.length > 6 || (billed && !status) || (status === "CANCELLED" && !remarks.trim()) || (status === "DELIVERED" && (!advisor || !canDeliver || !jobCard.promisedAt || (late && !reasons.length)))}>
        {update.isPending ? "Saving..." : status === "DELIVERED" ? "Deliver and issue gate pass" : "Save / apply action"}
      </Button>
    </form>
  );
}
