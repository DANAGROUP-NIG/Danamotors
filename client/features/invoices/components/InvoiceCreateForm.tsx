"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import { useBranchStore } from "@/store/branch.store";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import { useJobCards } from "@/features/job-cards/hooks/use-job-cards";
import { useCreateInvoice } from "../hooks/use-create-invoice";

const createInvoiceSchema = z
  .object({
    customerId: z.string().min(1, "Select a customer"),
    jobCardId: z.string().optional(),
    invoiceNumber: z.string().min(1, "Invoice number is required"),
    issuedDate: z.string().optional(),
    dueDate: z.string().optional(),
    subtotal: z.coerce.number().min(0, "Subtotal must be non-negative"),
    tax: z.coerce.number().min(0, "Tax must be non-negative").optional(),
    total: z.coerce.number().min(0, "Total must be non-negative"),
    status: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((d) => d.total >= d.subtotal + (d.tax ?? 0), {
    path: ["total"],
    message: "Total must be at least subtotal + tax",
  });

type CreateInvoiceFormValues = z.infer<typeof createInvoiceSchema>;

interface InvoiceCreateFormProps {
  onSuccess?: () => void;
}

export function InvoiceCreateForm({ onSuccess }: InvoiceCreateFormProps) {
  const create = useCreateInvoice();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const customers = useCustomers({
    page: 1,
    limit: 500,
    branchId: activeBranch?.id,
  });
  const jobCards = useJobCards({
    page: 1,
    limit: 500,
    branchId: activeBranch?.id,
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateInvoiceFormValues>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      invoiceNumber: `INV-${Date.now()}`,
      subtotal: 0,
      tax: 0,
      total: 0,
      status: "Unpaid",
    },
  });

  const selectedJobCardId = watch("jobCardId");
  const selectedJobCard = jobCards.data?.jobCards.find(
    (j) => j.id === selectedJobCardId,
  );

  function onCustomerChange(customerId: string) {
    setValue("customerId", customerId, { shouldValidate: true });
    setValue("jobCardId", "");
  }

  function onJobCardChange(jobCardId: string) {
    setValue("jobCardId", jobCardId);
    const jobCard = jobCards.data?.jobCards.find((j) => j.id === jobCardId);
    if (jobCard) {
      setValue("subtotal", jobCard.estimatedCost ?? 0);
      setValue("total", jobCard.estimatedCost ?? 0);
    }
  }

  function onSubmit(values: CreateInvoiceFormValues) {
    create.mutate(
      {
        customerId: values.customerId,
        jobCardId: values.jobCardId || undefined,
        invoiceNumber: values.invoiceNumber,
        issuedDate: values.issuedDate ? new Date(values.issuedDate).toISOString() : undefined,
        dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
        subtotal: values.subtotal,
        tax: values.tax ?? 0,
        total: values.total,
        status: values.status || "Unpaid",
        notes: values.notes || undefined,
      },
      { onSuccess: () => onSuccess?.() },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer" error={errors.customerId?.message}>
          <select
            className={inputCls}
            {...register("customerId")}
            onChange={(e) => onCustomerChange(e.target.value)}
          >
            <option value="">Select customer</option>
            {customers.data?.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Job card (optional)" error={errors.jobCardId?.message}>
          <select className={inputCls} {...register("jobCardId")} onChange={(e) => onJobCardChange(e.target.value)}>
            <option value="">No job card</option>
            {jobCards.data?.jobCards.map((j) => (
              <option key={j.id} value={j.id}>
                {j.jobNumber}
                {j.customer ? ` — ${j.customer.firstName} ${j.customer.lastName}` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Invoice number" error={errors.invoiceNumber?.message}>
          <input className={inputCls} {...register("invoiceNumber")} />
        </Field>
        <Field label="Status" error={errors.status?.message}>
          <select className={inputCls} {...register("status")}>
            <option value="Unpaid">Unpaid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Paid">Paid</option>
            <option value="Overdue">Overdue</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Issued date (optional)" error={errors.issuedDate?.message}>
          <Controller
            control={control}
            name="issuedDate"
            render={({ field }) => (
              <DateInput value={field.value} onChange={field.onChange} />
            )}
          />
        </Field>
        <Field label="Due date (optional)" error={errors.dueDate?.message}>
          <Controller
            control={control}
            name="dueDate"
            render={({ field }) => (
              <DateInput value={field.value} onChange={field.onChange} />
            )}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Subtotal (₦)" error={errors.subtotal?.message}>
          <input type="number" step="0.01" className={inputCls} {...register("subtotal")} />
        </Field>
        <Field label="Tax (₦)" error={errors.tax?.message}>
          <input type="number" step="0.01" className={inputCls} {...register("tax")} />
        </Field>
        <Field label="Total (₦)" error={errors.total?.message}>
          <input type="number" step="0.01" className={inputCls} {...register("total")} />
        </Field>
      </div>

      {selectedJobCard && (
        <p className="text-xs text-muted-foreground">
          Subtotal/Total pre-filled from {selectedJobCard.jobNumber} (
          {selectedJobCard.estimatedCost?.toLocaleString("en-NG")} ₦). Adjust if needed.
        </p>
      )}

      <Field label="Notes (optional)" error={errors.notes?.message}>
        <textarea className={inputCls} rows={3} {...register("notes")} />
      </Field>

      <Button type="submit" disabled={create.isPending} className="mt-1">
        {create.isPending ? "Creating…" : "Create invoice"}
      </Button>
    </form>
  );
}
