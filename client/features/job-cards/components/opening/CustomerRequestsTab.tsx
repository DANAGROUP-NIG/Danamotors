"use client";
import { useRef } from "react";
import Link from "next/link";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getJobCardRequest } from "../../api/job-card.api";
import type { CreateJobCardFormValues } from "../../schemas/job-card.schema";
import { WorkshopPicker } from "../WorkshopPicker";
import { CurrencyInput, OpeningCard, openingInput, money, formatDate } from "./opening-ui";

export const emptyRequest = () => ({
  description: "",
  complaintCodeId: "",
  defectCode: "",
  spare: 0,
  oil: 0,
  labour: 0,
});

export function requestTotals(rows: CreateJobCardFormValues["complaints"]) {
  const sum = (key: "spare" | "oil" | "labour") => rows.reduce((total, row) => total + Math.round((Number(row[key]) || 0) * 100), 0) / 100;

  return {
    spare: sum("spare"),
    oil: sum("oil"),
    labour: sum("labour"),
  };
}

export function CustomerRequestsTab(
  {
    lastJobId,
  }: {
    lastJobId?: string;
  },
) {
  const {
    control,
    register,
    setValue,
    getValues,

    formState: {
      errors,
    },
  } = useFormContext<CreateJobCardFormValues>();

  const {
    fields,
    append,
    remove,
    insert,
  } = useFieldArray({
    control,
    name: "complaints",
  });

  const rows = useWatch({
    control,
    name: "complaints",
  });

  const totals = requestTotals(rows);
  const table = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-5"><OpeningCard
        title="Customer requests"
        description="Select a defect or enter a custom code. Amounts update the opening estimate automatically."
        action={<Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fields.length >= 100}
          onClick={() => {
            append(emptyRequest(), {
              shouldFocus: false,
            });

            requestAnimationFrame(() => {
              const inputs = table.current?.querySelectorAll<HTMLInputElement>("[role=\"combobox\"]");
              inputs?.[inputs.length - 1]?.focus();
            });
          }}><Plus className="mr-1.5 h-4 w-4" />Add request</Button>}>
        <div
          ref={table}
          className="space-y-3"
          onKeyDown={event => {
            if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement) || event.target.getAttribute("role") === "combobox")
              return;

            event.preventDefault();
            const inputs = Array.from(table.current?.querySelectorAll<HTMLInputElement>("input:not([disabled])") ?? []);
            inputs[inputs.indexOf(event.target) + 1]?.focus();
          }}>
          {fields.length === 0 && <p className="rounded-lg bg-muted/40 p-6 text-center text-sm text-muted-foreground">No customer requests yet. Add the first request.</p>}
          {fields.map(
            (row, index) => <div key={row.id} className="rounded-xl border border-border p-3 md:p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">Request {index + 1}</span><button
                  type="button"
                  aria-label={`Delete request ${index + 1}`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    const removed = getValues(`complaints.${index}`);
                    remove(index);

                    toast("Request removed", {
                      action: {
                        label: "Undo",
                        onClick: () => insert(Math.min(index, getValues("complaints").length), removed),
                      },
                    });
                  }}><Trash2 className="h-4 w-4" /></button></div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><Controller
                  name={`complaints.${index}.complaintCodeId`}
                  control={control}
                  render={(
                    {
                      field,
                    },
                  ) => <WorkshopPicker
                    label="Defect"
                    required
                    endpoint="/workshop-masters?kind=COMPLAINT"
                    collection="items"
                    value={field.value || rows[index]?.defectCode || ""}
                    selectedRecord={!field.value && rows[index]?.defectCode ? {
                      id: rows[index].defectCode,
                      code: rows[index].defectCode,
                      description: "Custom code",
                    } : undefined}
                    onBlur={field.onBlur}
                    error={errors.complaints?.[index]?.defectCode?.message}
                    onChange={id => {
                      field.onChange(id);

                      if (!id) setValue(`complaints.${index}.defectCode`, "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                    onCustom={code => {
                      field.onChange("");

                      setValue(`complaints.${index}.defectCode`, code, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                    onSelect={record => {
                      setValue(`complaints.${index}.defectCode`, record.code ?? "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      });

                      if (!getValues(`complaints.${index}.description`)) setValue(`complaints.${index}.description`, record.description ?? "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }} />} /><label className="grid content-start gap-1.5 text-xs font-medium"><span>Description <span className="text-destructive">*</span></span><input
                    aria-label={`Request ${index + 1} description`}
                    className={openingInput}
                    {...register(`complaints.${index}.description`)} />{errors.complaints?.[index]?.description && <span role="alert" className="text-xs text-destructive">{errors.complaints[index]?.description?.message}</span>}</label></div>
              <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">{(["spare", "oil", "labour"] as const).map(
                  key => <div key={key} className="space-y-1.5"><span className="text-xs font-medium capitalize">{key}</span><Controller
                      name={`complaints.${index}.${key}`}
                      control={control}
                      render={(
                        {
                          field,
                        },
                      ) => <CurrencyInput
                        label={`Request ${index + 1} ${key}`}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        error={errors.complaints?.[index]?.[key]?.message} />} /></div>,
                )}<div className="space-y-1.5"><p className="text-xs font-medium">Total</p><p
                    className="flex h-10 items-center justify-end rounded-lg bg-muted/50 px-3 text-sm font-semibold tabular-nums">{money(
                      (Math.round((rows[index]?.spare || 0) * 100) + Math.round((rows[index]?.oil || 0) * 100) + Math.round((rows[index]?.labour || 0) * 100)) / 100,
                    )}</p></div></div>
            </div>,
          )}
        </div>
        <div
          className="sticky bottom-0 mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted p-4 text-right sm:grid-cols-4">{[
            ["Total spare", totals.spare],
            ["Total oil", totals.oil],
            ["Total labour", totals.labour],
            ["Grand total", totals.spare + totals.oil + totals.labour],
          ].map(
            ([label, amount]) => <div key={String(label)}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{money(Number(amount))}</p></div>,
          )}</div>
        {errors.complaints?.message && <p role="alert" className="mt-3 text-xs text-destructive">{errors.complaints.message}</p>}
      </OpeningCard><LastVisitCard id={lastJobId} /></div>
  );
}

function LastVisitCard(
  {
    id,
  }: {
    id?: string;
  },
) {
  const query = useQuery({
    queryKey: ["job-opening-last-visit", id],
    queryFn: () => getJobCardRequest(id!),
    enabled: !!id,
  });

  const job = query.data;

  return (
    <details className="rounded-xl border border-border bg-background p-4 shadow-sm md:p-6" open><summary className="cursor-pointer text-sm font-semibold">Last visit</summary><div className="mt-4">{!id && <p className="text-sm text-muted-foreground">No previous visits found.</p>}{id && query.isPending && <p role="status" className="text-sm text-muted-foreground">Loading previous visit...</p>}{query.isError && <p role="alert" className="text-sm text-destructive">Could not load previous visit. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}{job && <div className="grid gap-6 md:grid-cols-2"><div className="space-y-4"><div><h4 className="mb-2 text-xs font-medium">Customer requests</h4><p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{job.complaints?.map(row => row.description).join("\n") || job.description}</p></div><div><h4 className="mb-2 text-xs font-medium">Labour details</h4><p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{job.labourLines?.map(row => row.labourItem.description).join("\n") || "No labour details recorded"}</p></div></div><dl className="grid grid-cols-2 content-start gap-4 text-sm"><div><dt className="text-xs text-muted-foreground">Job no.</dt><dd><Link
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`/job-cards/${job.id}`}
                  className="font-medium text-primary underline">{job.jobNumber}</Link></dd></div>{[
              ["Service", job.serviceType?.description],
              ["Attended by", job.technician ? `${job.technician.firstName} ${job.technician.lastName}` : null],
              ["Delivery date", formatDate(job.deliveredAt)],
              ["Mileage", job.mileage == null ? null : `${job.mileage.toLocaleString()} km`],
              [
                "Delivered by",
                job.deliveryAdvisor ? `${job.deliveryAdvisor.firstName} ${job.deliveryAdvisor.lastName}` : null,
              ],
            ].map(
              ([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1">{value || "Not recorded"}</dd></div>,
            )}</dl></div>}</div></details>
  );
}
