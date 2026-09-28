"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import { jobCardKeys } from "../api/job-card.keys";
import type { JobCard } from "../types/job-card.types";
import { JOB_CARD_STATUS_LABELS } from "../types/job-card-status";

export function JobCardEditForm({ jobCard }: { jobCard: JobCard }) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(jobCard.description);
  const [status, setStatus] = useState<string>(jobCard.status);
  const update = useMutation({
    mutationFn: () => apiPut(API_ROUTES.service.jobCards.detail(jobCard.id), { description: description.trim(), status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobCardKeys.all });
      queryClient.invalidateQueries({ queryKey: ["repairs"] });
      toast.success("Job card updated");
    },
  });
  return <form className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 print:hidden" onSubmit={(event) => { event.preventDefault(); update.mutate(); }}>
    <h2 className="font-semibold">Update job card</h2>
    <Field label="Description"><textarea required className={inputCls} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
    <Field label="Status"><select className={inputCls} value={status} onChange={(event) => setStatus(event.target.value)}>
      {Object.keys(JOB_CARD_STATUS_LABELS).filter((value) => value !== "Billed").map((value) => <option key={value}>{value}</option>)}
    </select></Field>
    {update.isError && <p role="alert" className="text-sm text-red-600">Could not update the job card. Please check the details and try again.</p>}
    <Button type="submit" disabled={update.isPending || !description.trim()}>{update.isPending ? "Saving..." : "Save changes"}</Button>
  </form>;
}
