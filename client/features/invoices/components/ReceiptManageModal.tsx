"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { creditKeys } from "@/features/credit/api/credit.keys";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { cancelReceiptRequest, updateReceiptRequest, type ReceiptRegisterRow } from "../api/invoice.api";

export function ReceiptManageModal({ receipt, onClose, canEdit, canCancel }: { receipt: ReceiptRegisterRow | null; onClose: () => void; canEdit: boolean; canCancel: boolean }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [remark, setRemark] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    setAmount(receipt ? String(receipt.amount) : "");
    setNarration(receipt?.notes ?? "");
    setRemark("");
    setConfirmCancel(false);
  }, [receipt]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["party-account", receipt?.customer.id] });
    if (receipt) queryClient.invalidateQueries({ queryKey: creditKeys.customer(receipt.customer.id) });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["receipt-register"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };
  const update = useMutation({
    mutationFn: () => updateReceiptRequest(receipt!.id, { amount: Number(amount), narration }),
    onSuccess: () => { toast.success("Receipt updated"); refresh(); onClose(); },
    onError: (error: unknown) => toast.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Receipt cannot be updated"),
  });
  const cancel = useMutation({
    mutationFn: () => cancelReceiptRequest(receipt!.id, remark.trim()),
    onSuccess: () => { toast.success("Receipt cancelled"); refresh(); onClose(); },
    onError: (error: unknown) => toast.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Receipt cannot be cancelled"),
  });

  if (!receipt) return null;
  return (
    <ModalFame isOpen={Boolean(receipt)} onClose={() => { if (!update.isPending && !cancel.isPending) onClose(); }} title={`Receipt ${receipt.receiptNumber}`}>
      <form inert={update.isPending || cancel.isPending} className="grid gap-4" onSubmit={(event) => { event.preventDefault(); update.mutate(); }}>
        <p className="text-sm text-muted-foreground">Only amount and narration can be edited. The server recalculates bill allocations.</p>
        <Field label="Amount received (NGN)"><input type="number" min="0.01" step="0.01" className={inputCls} value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field>
        <Field label="Narration"><textarea className={inputCls} rows={3} maxLength={1000} value={narration} onChange={(event) => setNarration(event.target.value)} /></Field>
        <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
          {canEdit && <Button type="submit" disabled={update.isPending || Number(amount) <= 0}>{update.isPending ? "Saving..." : "Save changes"}</Button>}
            {canCancel && (!confirmCancel ? <Button type="button" variant="destructive" onClick={() => setConfirmCancel(true)}>Cancel receipt</Button> : <div className="grid w-full gap-3">
            <Field label="Cancellation remark"><input className={inputCls} value={remark} onChange={(event) => setRemark(event.target.value)} maxLength={1000} required /></Field>
            <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setConfirmCancel(false)}>Keep receipt</Button><Button type="button" variant="destructive" disabled={cancel.isPending || !remark.trim()} onClick={() => cancel.mutate()}>{cancel.isPending ? "Cancelling..." : "Confirm cancellation"}</Button></div>
            </div>)}
        </div>
      </form>
    </ModalFame>
  );
}
