"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useBranchStore } from "@/store/branch.store";
import { useCustomers } from "@/features/customers";
import { useInvoices } from "@/features/invoices/hooks/use-invoices";
import { useCreateCreditApplication } from "../hooks/use-credit";

const createApplicationSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  invoiceId: z.string().min(1, "Select an invoice"),
  amount: z.coerce.number().positive("Amount must be positive"),
  comments: z.string().optional(),
});

type CreateApplicationFormValues = z.infer<typeof createApplicationSchema>;

interface CreateCreditApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateCreditApplicationModal({
  isOpen,
  onClose,
}: CreateCreditApplicationModalProps) {
  const create = useCreateCreditApplication();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const customers = useCustomers({ limit: 200, branchId: activeBranch?.id });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateApplicationFormValues>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: { customerId: "", invoiceId: "" },
  });

  const selectedCustomerId = watch("customerId");
  const invoices = useInvoices({
    branchId: activeBranch?.id,
    customerId: selectedCustomerId || undefined,
  });
  const openInvoices =
    invoices.data?.invoices.filter((inv) => inv.status !== "Paid") ?? [];

  useEffect(() => {
    if (isOpen) {
      reset({ customerId: "", invoiceId: "", amount: undefined, comments: "" });
    }
  }, [isOpen, reset]);

  function onSubmit(values: CreateApplicationFormValues) {
    create.mutate(
      {
        customerId: values.customerId,
        invoiceId: values.invoiceId,
        amount: values.amount,
        comments: values.comments || undefined,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalFame isOpen={isOpen} onClose={onClose} title="Request to use customer credit">
      <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Field label="Customer" error={errors.customerId?.message}>
          <select className={inputCls} {...register("customerId")}>
            <option value="">Select customer</option>
            {customers.data?.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName} — {c.email}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Invoice" error={errors.invoiceId?.message}>
          <select className={inputCls} {...register("invoiceId")}>
            <option value="">Select invoice</option>
            {openInvoices.map((inv) => {
              const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
              const outstanding = inv.total - paid;
              return (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — outstanding ₦
                  {outstanding.toLocaleString("en-NG")} ({inv.status})
                </option>
              );
            })}
          </select>
        </Field>

        <Field label="Amount (₦)" error={errors.amount?.message}>
          <input
            type="number"
            step="0.01"
            className={inputCls}
            placeholder="0.00"
            {...register("amount")}
          />
        </Field>
        <p className="-mt-2 text-xs text-muted-foreground">
          Must be within the customer's credit balance and the invoice's
          outstanding balance.
        </p>

        <Field label="Comments (optional)" error={errors.comments?.message}>
          <textarea className={inputCls} rows={2} {...register("comments")} />
        </Field>

        <Button type="submit" disabled={create.isPending} className="mt-1">
          {create.isPending ? "Creating…" : "Create credit application"}
        </Button>
      </form>
    </ModalFame>
  );
}
