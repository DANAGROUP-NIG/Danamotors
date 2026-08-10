"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useBranchStore } from "@/store/branch.store";
import { useInvoices } from "../hooks/use-invoices";
import { useCreatePayment } from "@/features/payments/hooks/use-create-payment";

const createPaymentSchema = z.object({
  invoiceId: z.string().min(1, "Select an invoice"),
  amount: z.coerce.number().positive("Amount must be positive"),
  method: z.string().min(1, "Payment method is required"),
  paymentDate: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type CreatePaymentFormValues = z.infer<typeof createPaymentSchema>;

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId?: string;
}

export function RecordPaymentModal({
  isOpen,
  onClose,
  invoiceId,
}: RecordPaymentModalProps) {
  const create = useCreatePayment();
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const invoices = useInvoices({ branchId: activeBranch?.id });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CreatePaymentFormValues>({
    resolver: zodResolver(createPaymentSchema),
    defaultValues: { invoiceId: invoiceId ?? "", method: "Cash" },
  });

  useEffect(() => {
    if (isOpen) {
      reset({ invoiceId: invoiceId ?? "", method: "Cash" });
    }
  }, [isOpen, invoiceId, reset]);

  const selectedInvoice = invoices.data?.invoices.find(
    (inv) => inv.id === watch("invoiceId"),
  );

  const openInvoices =
    invoices.data?.invoices.filter((inv) => inv.status !== "Paid") ?? [];

  function onSubmit(values: CreatePaymentFormValues) {
    create.mutate(
      {
        invoiceId: values.invoiceId,
        amount: values.amount,
        method: values.method,
        paymentDate: values.paymentDate
          ? new Date(values.paymentDate).toISOString()
          : undefined,
        reference: values.reference || undefined,
        notes: values.notes || undefined,
      },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  }

  return (
    <ModalFame isOpen={isOpen} onClose={onClose} title="Record payment">
      <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
        {invoiceId ? (
          <>
            <input type="hidden" {...register("invoiceId")} />
            <Field label="Invoice" error={errors.invoiceId?.message}>
              <input
                className={inputCls}
                value={selectedInvoice?.invoiceNumber ?? ""}
                readOnly
              />
            </Field>
          </>
        ) : (
          <Field label="Invoice" error={errors.invoiceId?.message}>
            <select
              className={inputCls}
              {...register("invoiceId")}
              onChange={(e) => setValue("invoiceId", e.target.value, { shouldValidate: true })}
            >
              <option value="">Select invoice</option>
              {openInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — {inv.customer.firstName} {inv.customer.lastName} ({inv.status})
                </option>
              ))}
            </select>
          </Field>
        )}

        {selectedInvoice && (
          <p className="text-xs text-muted-foreground">
            Outstanding: ₦
            {(
              selectedInvoice.total -
              selectedInvoice.payments.reduce((sum, p) => sum + p.amount, 0)
            ).toLocaleString("en-NG")}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (₦)" error={errors.amount?.message}>
            <input
              type="number"
              step="0.01"
              className={inputCls}
              {...register("amount")}
            />
          </Field>
          <Field label="Method" error={errors.method?.message}>
            <select className={inputCls} {...register("method")}>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Transfer">Transfer</option>
              <option value="Cheque">Cheque</option>
              <option value="Bank Deposit">Bank Deposit</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment date (optional)" error={errors.paymentDate?.message}>
            <input type="date" className={inputCls} {...register("paymentDate")} />
          </Field>
          <Field label="Reference (optional)" error={errors.reference?.message}>
            <input className={inputCls} placeholder="e.g. Txn ref" {...register("reference")} />
          </Field>
        </div>

        <Field label="Notes (optional)" error={errors.notes?.message}>
          <textarea className={inputCls} rows={2} {...register("notes")} />
        </Field>

        <Button type="submit" disabled={create.isPending} className="mt-1">
          {create.isPending ? "Recording…" : "Record payment"}
        </Button>
      </form>
    </ModalFame>
  );
}
