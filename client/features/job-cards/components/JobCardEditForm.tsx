"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
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

const aliases: Record<string, string> = {
  Open: "OPEN",
  Pending: "OPEN",
  "In Progress": "IN_PROGRESS",
  "On Hold": "IN_PROGRESS",
  "Quality Check": "QC",
  Ready: "READY",
  Completed: "READY",
  Billed: "BILLED",
  Closed: "DELIVERED",
  Cancelled: "CANCELLED",
};

export function JobCardEditForm(
  {
    jobCard,
  }: {
    jobCard: JobCard;
  },
) {
  const queryClient = useQueryClient();

  const {
    isAdminOrAbove,
  } = useAuth();

  const current = jobCard.billedAt ? "BILLED" : aliases[jobCard.status] ?? jobCard.status;
  const [status, setStatus] = useState("");
  const [remarks, setRemarks] = useState("");
  const [observations, setObservations] = useState(jobCard.observations ?? "");
  const [workDone, setWorkDone] = useState(jobCard.workDone ?? "");
  const [advisor, setAdvisor] = useState(jobCard.serviceAdvisorId ?? "");
  const [reasons, setReasons] = useState<string[]>([]);

  const lateReasons = useQuery({
    queryKey: ["late-reasons"],

    queryFn: () => apiGet<{
      items: {
        id: string;
        description: string;
      }[];
    }>("/workshop-masters?kind=LATE_REASON&limit=100"),

    enabled: status === "DELIVERED",
  });

  const refresh = () => queryClient.invalidateQueries({
    queryKey: jobCardKeys.all,
  });

  const update = useMutation({
    mutationFn: () => apiPut(`/service/job-cards/${jobCard.id}`, {
      ...(jobCard.billedAt ? {} : {
        observations,
        workDone,
      }),

      status: status || undefined,
      remarks: remarks || undefined,

      ...(status === "DELIVERED" ? {
        deliveryAdvisorId: advisor,
        lateReasonIds: reasons,
      } : {}),
    }),

    onSuccess: refresh,
  });

  const credit = useMutation({
    mutationFn: () => apiPost(`/service/job-cards/${jobCard.id}/credit-approval`, {
      remarks,
    }),

    onSuccess: refresh,
  });

  if (["DELIVERED", "CANCELLED"].includes(current))
    return null;

  return (
    <form
      className="grid gap-4 rounded-xl border bg-white p-5 print:hidden"
      onSubmit={event => {
        event.preventDefault();
        update.mutate();
      }}>
      <h2 className="font-semibold">Workshop actions</h2>
      <ol className="flex flex-wrap gap-3 text-xs">{["OPEN", "IN_PROGRESS", "QC", "READY", "BILLED", "DELIVERED"].map(
          step => <li key={step} className={step === current ? "font-bold text-primary" : "text-slate-500"}>{step.replaceAll("_", " ")}</li>,
        )}</ol>
      {!jobCard.billedAt && <><Field label="Observations"><textarea className={inputCls} value={observations} onChange={e => setObservations(e.target.value)} /></Field><Field label="Work done and recommendations"><textarea className={inputCls} value={workDone} onChange={e => setWorkDone(e.target.value)} /></Field></>}
      <Field label="Next action"><select className={inputCls} value={status} onChange={e => setStatus(e.target.value)}><option value="">Save findings only</option>{(nextStatuses[current] ?? []).map(value => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Remarks / cancellation reason"><textarea
          required={status === "CANCELLED"}
          className={inputCls}
          value={remarks}
          onChange={e => setRemarks(e.target.value)} /></Field>
      {status === "DELIVERED" && <><WorkshopPicker
          required
          label="Delivery advisor"
          endpoint={`/service/staff?role=ServiceAdviser&branchId=${jobCard.branchId}`}
          collection="users"
          value={advisor}
          onChange={setAdvisor} /><Field label="Late-delivery reasons (up to six)"><select
            multiple
            className={inputCls}
            value={reasons}
            onChange={e => setReasons(Array.from(e.target.selectedOptions).map(o => o.value))}>{lateReasons.data?.items.map(reason => <option key={reason.id} value={reason.id}>{reason.description}</option>)}</select></Field></>}
      {(update.isError || credit.isError) && <p role="alert" className="text-sm text-red-600">Action failed. Check the job lifecycle, billing and required delivery details.</p>}
      {isAdminOrAbove && current === "READY" && !jobCard.creditApprovedById && <Button
        type="button"
        variant="outline"
        disabled={!remarks.trim() || credit.isPending}
        onClick={() => credit.mutate()}>Approve delivery on credit</Button>}
      <Button disabled={update.isPending || reasons.length > 6}>Save / apply action</Button>
    </form>
  );
}
