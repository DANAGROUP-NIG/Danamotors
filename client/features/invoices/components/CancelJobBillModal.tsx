"use client";

import { useState } from "react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import type { Invoice } from "../types/invoice.types";
import { useCancelInvoice } from "../hooks/use-cancel-invoice";

interface CancelJobBillModalProps {
  invoice: Invoice;
  isOpen: boolean;
  onClose: () => void;
}

export function CancelJobBillModal({ invoice, isOpen, onClose }: CancelJobBillModalProps) {
  const cancel = useCancelInvoice();
  const [remark, setRemark] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = remark.trim();
    if (!value) return;
    cancel.mutate({ id: invoice.id, remark: value }, { onSuccess: onClose });
  }

  return (
    <ModalFame isOpen={isOpen} onClose={onClose} title={`Cancel ${invoice.invoiceNumber}`}>
      <form className="grid gap-4" onSubmit={submit}>
        <p className="text-sm text-muted-foreground">A bill with allocated receipts or Tally posting cannot be cancelled.</p>
        <Field label="Cancellation remark">
          <textarea className={inputCls} rows={3} maxLength={1000} value={remark} onChange={(event) => setRemark(event.target.value)} required />
        </Field>
        <Button type="submit" variant="destructive" disabled={cancel.isPending || !remark.trim()}>
          {cancel.isPending ? "Cancelling..." : "Cancel job bill"}
        </Button>
      </form>
    </ModalFame>
  );
}