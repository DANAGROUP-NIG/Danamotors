"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import type { Invoice } from "../types/invoice.types";
import { useUpdateInvoice } from "../hooks/use-update-invoice";

const editInvoiceSchema = z.object({
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

type EditInvoiceFormValues = z.infer<typeof editInvoiceSchema>;

interface EditInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
}

export function EditInvoiceModal({ isOpen, onClose, invoice }: EditInvoiceModalProps) {
  const update = useUpdateInvoice();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditInvoiceFormValues>({
    resolver: zodResolver(editInvoiceSchema),
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : "",
        notes: invoice.notes ?? "",
      });
    }
  }, [isOpen, invoice, reset]);

  function onSubmit(values: EditInvoiceFormValues) {
    update.mutate(
      {
        id: invoice.id,
        payload: {
          dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
          notes: values.notes || undefined,
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalFame isOpen={isOpen} onClose={onClose} title={`Edit ${invoice.invoiceNumber}`}>
      <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Field label="Due date (optional)" error={errors.dueDate?.message}>
            <Controller
              control={control}
              name="dueDate"
              render={({ field }) => (
                <DateInput value={field.value} onChange={field.onChange} />
              )}
            />
        </Field>

        <Field label="Notes (optional)" error={errors.notes?.message}>
          <textarea className={inputCls} rows={3} {...register("notes")} />
        </Field>

        <Button type="submit" disabled={update.isPending} className="mt-1">
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </ModalFame>
  );
}
