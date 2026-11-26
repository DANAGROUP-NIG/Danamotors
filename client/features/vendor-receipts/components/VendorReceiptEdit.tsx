"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { NumberInput } from "@/components/forms/NumberInput";
import { useEditVendorReceipt, useMrnSettings, useVendorReceipt } from "../hooks/use-vendor-receipts";
import type { MrnTaxForm, VendorReceipt } from "../types/vendor-receipt.types";
import { EditorLine, ReceiptLinesEditor, TaxFormSelect } from "./ReceiptLinesEditor";

const toLines = (receipt: VendorReceipt): EditorLine[] =>
  receipt.lines.map((l) => ({
    part: { id: l.part.id, partNumber: l.part.partNumber, name: l.part.name, partFlag: l.part.partFlag, sourceLabel: l.sourceLabel, taxable: l.part.taxable, unitPrice: l.part.unitPrice },
    quantity: l.receivedQuantity,
    unitPrice: l.unitPrice,
    returned: l.returnedQuantity,
  }));

function EditForm({ receipt }: { receipt: VendorReceipt }) {
  const router = useRouter();
  const edit = useEditVendorReceipt(receipt.id);
  const settings = useMrnSettings(receipt.receivingBranchId);
  const [invoiceNumber, setInvoiceNumber] = useState(receipt.invoiceNumber);
  const [invoiceDate, setInvoiceDate] = useState(receipt.invoiceDate?.slice(0, 10) ?? "");
  const [taxForm, setTaxForm] = useState<MrnTaxForm>(receipt.taxForm ?? "Y");
  const [conversionRate, setConversionRate] = useState<number | null>(receipt.conversionRate);
  const [remarks, setRemarks] = useState(receipt.remarks ?? "");
  const [lines, setLines] = useState<EditorLine[]>(() => toLines(receipt));
  const [reason, setReason] = useState("");

  const rate = conversionRate ?? 0;
  const errors: string[] = [];
  if (!invoiceNumber.trim()) errors.push("Enter the vendor invoice number");
  if (!(rate > 0)) errors.push("Enter the conversion rate (1 for a naira invoice)");
  if (!lines.length) errors.push("Keep at least one part");
  if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) errors.push("Quantities must be whole numbers above zero");
  if (lines.some((l) => l.returned && l.quantity < l.returned)) errors.push("A quantity cannot be below what went back to the vendor");
  if (lines.some((l) => !(l.unitPrice > 0))) errors.push("Unit prices must be above zero");
  if (reason.trim().length < 3) errors.push("Give the reason for the correction");

  function submit() {
    if (errors.length) return;
    edit.mutate(
      {
        reason: reason.trim(),
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: invoiceDate || undefined,
        taxForm,
        conversionRate: rate,
        remarks: remarks.trim(),
        lines: lines.map((l) => ({ partId: l.part.id, quantity: l.quantity, unitPrice: l.unitPrice })),
      },
      { onSuccess: () => router.push(`/inventory/mrn/${receipt.id}`) },
    );
  }

  return (
    <div className="grid gap-5 px-4 py-6 lg:px-6">
      <Link href={`/inventory/mrn/${receipt.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to MRN {receipt.mrnNumber}
      </Link>
      <div className="grid gap-4 rounded-xl border bg-white p-5">
        <h1 className="text-lg font-semibold">Correct MRN {receipt.mrnNumber}</h1>
        <p className="text-sm text-muted-foreground">
          {receipt.vendor} · {receipt.receivingBranch.name}. Stock moves by the difference. Units can only come off while they
          are still in stock, and not below what went back to the vendor. Every change is kept with the reason.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vendor invoice number">
            <input className={inputCls} maxLength={40} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </Field>
          <Field label="Vendor invoice date">
            <input type="date" className={inputCls} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </Field>
          <Field label="Tax form">
            <TaxFormSelect value={taxForm} onChange={setTaxForm} />
          </Field>
          <Field label="Conversion rate (1 = naira invoice)">
            <NumberInput min="0.0001" step="any" className={inputCls} value={conversionRate} onValueChange={setConversionRate} aria-label="Conversion rate" />
          </Field>
        </div>
        <Field label="Remarks">
          <input className={inputCls} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-3 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Parts</h2>
        <ReceiptLinesEditor
          branchId={receipt.receivingBranchId}
          lines={lines}
          onChange={setLines}
          taxForm={taxForm}
          conversionRate={rate}
          roundToNaira={!!settings.data?.roundMrnTotal}
        />
      </div>

      <div className="grid gap-3 rounded-xl border bg-white p-5">
        <Field label="Reason for the correction">
          <input className={inputCls} maxLength={300} value={reason} placeholder="e.g. Quantity keyed wrongly" onChange={(e) => setReason(e.target.value)} />
        </Field>
        {errors.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-destructive">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        <div>
          <Button type="button" disabled={errors.length > 0 || edit.isPending} onClick={submit}>
            {edit.isPending ? "Saving…" : "Save correction"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Corrects a posted vendor MRN (legacy users changed MRN lines after saving). */
export function VendorReceiptEdit({ id }: { id: string }) {
  const { data: receipt, isLoading, isError } = useVendorReceipt(id);
  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  if (isError || !receipt) return <p className="px-4 py-10 text-sm text-red-500 lg:px-6">Vendor receipt not found.</p>;
  return <EditForm key={receipt.id} receipt={receipt} />;
}
