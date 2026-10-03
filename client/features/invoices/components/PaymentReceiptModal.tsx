"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useBranchStore } from "@/store/branch.store";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { getBanksRequest, getInvoiceRequest, getInvoicesRequest, type CreateReceiptPayload } from "../api/invoice.api";
import { useCreateReceipt } from "../hooks/use-create-receipt";

const currency = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };

export function PaymentReceiptModal({ isOpen, onClose, invoiceId }: { isOpen: boolean; onClose: () => void; invoiceId?: string }) {
  return isOpen ? <ReceiptSession onClose={onClose} invoiceId={invoiceId} /> : null;
}

function ReceiptSession({ onClose, invoiceId }: { onClose: () => void; invoiceId?: string }) {
  const activeBranch = useBranchStore((state) => state.activeBranch?.id);
  const create = useCreateReceipt();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [customerId, setCustomerId] = useState("");
  const [mode, setMode] = useState<CreateReceiptPayload["mode"]>("BANK_TRANSFER");
  const [category, setCategory] = useState<CreateReceiptPayload["category"]>("SERVICE_PARTS");
  const [bankId, setBankId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [date, setDate] = useState(today);
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState(today);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const initialized = useRef(false);
  const linkedInvoice = useQuery({ queryKey: ["receipt-invoice", invoiceId], queryFn: () => getInvoiceRequest(invoiceId!), enabled: !!invoiceId, staleTime: 0, refetchOnMount: "always" });
  const branchId = linkedInvoice.data?.jobCard?.branchId ?? activeBranch;
  const invoiceQuery = useQuery({ queryKey: ["invoices", "receipt-customer", branchId, customerId], queryFn: () => getInvoicesRequest({ branchId, customerId }), enabled: !!customerId && !!branchId });
  const banks = useQuery({ queryKey: ["finance", "banks"], queryFn: () => getBanksRequest() });

  useEffect(() => {
    const invoice = linkedInvoice.data;
    if (initialized.current || !invoice || linkedInvoice.isFetching) return;
    initialized.current = true;
    setCustomerId(invoice.customerId);
    setAllocations(invoice.outstandingAmount > 0 ? { [invoice.id]: String(invoice.outstandingAmount) } : {});
    setAmount(invoice.outstandingAmount > 0 ? String(invoice.outstandingAmount) : "");
    setCategory(invoice.jobCardId ? "SERVICE_PARTS" : "SALES_ENQUIRY");
  }, [linkedInvoice.data, linkedInvoice.isFetching]);

  const customerInvoices = (invoiceQuery.data?.invoices ?? []).filter((invoice) => invoice.outstandingAmount > 0 && !["CANCELLED", "CANCELED", "VOID"].includes(invoice.status.toUpperCase()));
  const allocatedCents = Object.values(allocations).reduce((sum, value) => sum + Math.round((Number(value) || 0) * 100), 0);
  const receivedAmount = Number(amount);
  const needsBank = mode !== "CASH";
  const overAllocated = allocatedCents > Math.round(receivedAmount * 100);
  const invalidAllocation = Object.entries(allocations).some(([id, value]) => Number(value) < 0 || !Number.isFinite(Number(value)) || (Number(value) > 0 && (!customerInvoices.some((invoice) => invoice.id === id) || Number(value) > (customerInvoices.find((invoice) => invoice.id === id)?.outstandingAmount ?? 0))));
  const hasJobAllocation = customerInvoices.some((invoice) => invoice.jobCardId && Number(allocations[invoice.id]) > 0);
  const blocked = !customerId || !branchId || !Number.isFinite(receivedAmount) || receivedAmount <= 0 || (needsBank && !bankId) || overAllocated || invalidAllocation || invoiceQuery.isFetching || invoiceQuery.isError || (mode === "CHEQUE" && (!chequeNumber.trim() || !chequeDate)) || (!!invoiceId && (linkedInvoice.isPending || linkedInvoice.isError));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || create.isPending) return;
    create.mutate({
      customerId, branchId, idempotencyKey, mode,
      category: hasJobAllocation ? "SERVICE_PARTS" : category,
      bankId: needsBank ? bankId : undefined,
      amount: receivedAmount,
      issuedAt: new Date(`${date}T12:00:00`).toISOString(),
      chequeNumber: mode === "CHEQUE" ? chequeNumber.trim() : undefined,
      chequeDate: mode === "CHEQUE" ? chequeDate : undefined,
      reference: reference.trim() || undefined,
      narration: narration.trim() || undefined,
      allocations: Object.entries(allocations).map(([invoiceId, value]) => ({ invoiceId, amount: Number(value) || 0 })).filter((allocation) => allocation.amount > 0),
    }, { onSuccess: onClose });
  }

  return <ModalFame isOpen onClose={() => { if (!create.isPending) onClose(); }} title="Payment receipt">
    <form className="grid gap-4" onSubmit={submit} inert={create.isPending}>
      {invoiceId ? <div><p className="text-sm font-medium">Customer</p><p>{linkedInvoice.data?.customer.companyName || [linkedInvoice.data?.customer.firstName, linkedInvoice.data?.customer.lastName].filter(Boolean).join(" ")}</p>{linkedInvoice.isPending && <p role="status">Loading bill...</p>}{linkedInvoice.isError && <p role="alert">Could not load bill. <button type="button" onClick={() => linkedInvoice.refetch()}>Retry</button></p>}</div> : <WorkshopPicker label="Customer" required endpoint="/customers" collection="customers" value={customerId} onChange={(id) => { setCustomerId(id); setAllocations({}); }} />}
      {!branchId && <p role="alert" className="text-sm text-destructive">Select a receiving branch from the app header.</p>}
      <section className="grid gap-2"><h3 className="text-sm font-semibold">Unpaid bills</h3>
        {invoiceQuery.isFetching && <p role="status" className="text-sm">Loading balances...</p>}
        {invoiceQuery.isError && <p role="alert" className="text-sm text-destructive">Could not load balances. <button type="button" onClick={() => invoiceQuery.refetch()}>Retry</button></p>}
        {customerId && !invoiceQuery.isPending && !invoiceQuery.isError && !customerInvoices.length && <p className="text-sm text-muted-foreground">No unpaid bills in this branch. The receipt will be recorded as an advance.</p>}
        {customerInvoices.map((invoice) => <div key={invoice.id} className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-3 border-b py-2"><label htmlFor={`allocation-${invoice.id}`}><span className="block text-sm font-medium">{invoice.invoiceNumber}</span><span className="text-sm text-muted-foreground">Outstanding {currency.format(invoice.outstandingAmount)}</span></label><input id={`allocation-${invoice.id}`} type="number" min="0" max={invoice.outstandingAmount} step="0.01" className={inputCls} value={allocations[invoice.id] ?? ""} onChange={(event) => setAllocations((current) => ({ ...current, [invoice.id]: event.target.value }))} /></div>)}
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount received (NGN)"><input type="number" min="0.01" max="1000000000000" step="0.01" className={inputCls} value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field>
        <Field label="Receipt date"><input type="date" className={inputCls} value={date} onChange={(event) => setDate(event.target.value)} required /></Field>
        <Field label="Mode"><select className={inputCls} value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="BANK_TRANSFER">Bank transfer</option><option value="POS">POS</option><option value="CHEQUE">Cheque</option><option value="CASH">Cash</option></select></Field>
        {needsBank && <Field label="Receiving bank"><select className={inputCls} value={bankId} onChange={(event) => setBankId(event.target.value)} required><option value="">Select bank</option>{banks.data?.banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}</select>{banks.isError && <p role="alert">Could not load banks. <button type="button" onClick={() => banks.refetch()}>Retry</button></p>}</Field>}
        {mode === "CHEQUE" && <><Field label="Cheque number"><input className={inputCls} value={chequeNumber} maxLength={100} onChange={(event) => setChequeNumber(event.target.value)} required /></Field><Field label="Cheque date"><input type="date" className={inputCls} value={chequeDate} onChange={(event) => setChequeDate(event.target.value)} required /></Field></>}
        <Field label="Receipt category"><select className={inputCls} disabled={hasJobAllocation} value={hasJobAllocation ? "SERVICE_PARTS" : category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="SERVICE_PARTS">Service and parts</option><option value="SALES_ENQUIRY">Sales and enquiry</option></select></Field>
        <Field label="Payment reference"><input className={inputCls} maxLength={150} value={reference} onChange={(event) => setReference(event.target.value)} placeholder={mode === "POS" ? "POS" : mode === "BANK_TRANSFER" ? "0 (direct transfer)" : "Optional reference"} /></Field>
      </div>
      <Field label="Narration"><textarea className={inputCls} maxLength={1000} value={narration} onChange={(event) => setNarration(event.target.value)} /></Field>
      <div className="flex justify-between border-t pt-3 text-sm"><span>Advance</span><span>{currency.format(Math.max((Number.isFinite(receivedAmount) ? receivedAmount : 0) - allocatedCents / 100, 0))}</span></div>
      {(overAllocated || invalidAllocation) && <p role="alert" className="text-sm text-destructive">Review allocations: they must not exceed the receipt amount or current bill balances.</p>}
      <Button type="submit" disabled={create.isPending || blocked}>{create.isPending ? "Saving receipt..." : "Save receipt"}</Button>
    </form>
  </ModalFame>;
}
