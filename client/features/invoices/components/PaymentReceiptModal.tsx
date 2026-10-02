"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useBranchStore } from "@/store/branch.store";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import { getBanksRequest } from "../api/invoice.api";
import { useInvoices } from "../hooks/use-invoices";
import { useCreateReceipt } from "../hooks/use-create-receipt";

const currency = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId?: string;
}

export function PaymentReceiptModal({ isOpen, onClose, invoiceId }: PaymentReceiptModalProps) {
  const branchId = useBranchStore((state) => state.activeBranch?.id);
  const create = useCreateReceipt();
  const customers = useCustomers({ page: 1, limit: 500, branchId });
  const invoiceQuery = useInvoices({ branchId });
  const banks = useQuery({ queryKey: ["finance", "banks"], queryFn: getBanksRequest });
  const [customerId, setCustomerId] = useState("");
  const [mode, setMode] = useState<"POS" | "BANK_TRANSFER" | "CASH">("CASH");
  const [category, setCategory] = useState<"SERVICE_PARTS" | "SALES_ENQUIRY">("SERVICE_PARTS");
  const [bankId, setBankId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    const invoice = invoiceQuery.data?.invoices.find((item) => item.id === invoiceId);
    setCustomerId(invoice?.customerId ?? "");
    setAllocations(invoice ? { [invoice.id]: String(invoice.outstandingAmount) } : {});
    setAmount(invoice ? String(invoice.outstandingAmount) : "");
    setMode("CASH");
    setCategory(invoice?.jobCardId ? "SERVICE_PARTS" : "SALES_ENQUIRY");
    setBankId("");
    setReference("");
    setNarration("");
  }, [isOpen, invoiceId, invoiceQuery.data]);

  const customerInvoices = useMemo(() => (invoiceQuery.data?.invoices ?? []).filter((invoice) =>
    invoice.customerId === customerId && invoice.outstandingAmount > 0 && !["Cancelled", "CANCELLED", "VOID"].includes(invoice.status),
  ), [customerId, invoiceQuery.data?.invoices]);
  const allocatedAmount = Object.values(allocations).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const receivedAmount = Number(amount) || 0;
  const needsBank = mode !== "CASH";
  const tooMuchAllocated = allocatedAmount > receivedAmount + 0.000001;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerId || receivedAmount <= 0 || (needsBank && !bankId) || tooMuchAllocated) return;
    create.mutate({
      customerId,
      mode,
      category,
      bankId: needsBank ? bankId : undefined,
      amount: receivedAmount,
      reference: reference.trim() || undefined,
      narration: narration.trim() || undefined,
      allocations: Object.entries(allocations)
        .map(([invoiceId, value]) => ({ invoiceId, amount: Number(value) || 0 }))
        .filter((allocation) => allocation.amount > 0),
    }, { onSuccess: onClose });
  }

  return (
    <ModalFame isOpen={isOpen} onClose={onClose} title="Payment receipt">
      <form className="grid gap-4" onSubmit={submit}>
        <Field label="Customer">
          <select className={inputCls} value={customerId} onChange={(event) => {
            setCustomerId(event.target.value);
            setAllocations({});
          }} disabled={Boolean(invoiceId)} required>
            <option value="">Select customer</option>
            {customers.data?.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName}</option>
            ))}
          </select>
          {customers.isError && <span className="text-xs text-destructive">Could not load customers.</span>}
        </Field>

        <section className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Unpaid bills</h3>
            {invoiceQuery.isFetching && <span className="text-xs text-muted-foreground">Refreshing...</span>}
          </div>
          {invoiceQuery.isError && <p role="alert" className="text-sm text-destructive">Could not load unpaid bills.</p>}
          {!invoiceQuery.isLoading && customerInvoices.length === 0 && (
            <p className="text-sm text-muted-foreground">No unpaid bills for this customer. The receipt will be recorded as an advance.</p>
          )}
          {customerInvoices.map((invoice) => (
            <div key={invoice.id} className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-3 border-b py-2 last:border-0">
              <label htmlFor={`allocation-${invoice.id}`} className="min-w-0">
                <span className="block truncate text-sm font-medium">{invoice.invoiceNumber}</span>
                <span className="text-xs text-muted-foreground">Outstanding {currency.format(invoice.outstandingAmount)}</span>
              </label>
              <input
                id={`allocation-${invoice.id}`}
                type="number"
                min="0"
                max={invoice.outstandingAmount}
                step="0.01"
                className={inputCls}
                aria-label={`Allocation for ${invoice.invoiceNumber}`}
                value={allocations[invoice.id] ?? ""}
                onChange={(event) => setAllocations((current) => ({ ...current, [invoice.id]: event.target.value }))}
              />
            </div>
          ))}
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount received (NGN)">
            <input type="number" min="0.01" step="0.01" className={inputCls} value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </Field>
          <Field label="Mode">
            <select className={inputCls} value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="CASH">Cash</option>
              <option value="POS">POS</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
            </select>
          </Field>
        </div>

        {needsBank && (
          <Field label="Receiving bank">
            <select className={inputCls} value={bankId} onChange={(event) => setBankId(event.target.value)} required>
              <option value="">Select bank</option>
              {banks.data?.banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
            </select>
            {banks.isError && <span className="text-xs text-destructive">Could not load receiving banks.</span>}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Receipt category">
            <select className={inputCls} value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
              <option value="SERVICE_PARTS">Service and parts</option>
              <option value="SALES_ENQUIRY">Sales and enquiry</option>
            </select>
          </Field>
          <Field label="Narration">
            <input className={inputCls} maxLength={1000} value={narration} onChange={(event) => setNarration(event.target.value)} />
          </Field>
        </div>
        <Field label="Payment reference (optional)">
          <input className={inputCls} maxLength={150} value={reference} onChange={(event) => setReference(event.target.value)} placeholder={mode === "POS" ? "POS terminal reference" : mode === "BANK_TRANSFER" ? "Transfer reference" : "Receipt reference"} />
        </Field>
        <div className="flex justify-between border-t pt-3 text-sm">
          <span>Advance</span>
          <span className={tooMuchAllocated ? "text-destructive" : "font-medium"}>
            {currency.format(Math.max(receivedAmount - allocatedAmount, 0))}
            {tooMuchAllocated ? " - allocations exceed receipt" : ""}
          </span>
        </div>
        <Button type="submit" disabled={create.isPending || !customerId || receivedAmount <= 0 || (needsBank && !bankId) || tooMuchAllocated}>
          {create.isPending ? "Saving receipt..." : "Save receipt"}
        </Button>
      </form>
    </ModalFame>
  );
}