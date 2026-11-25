"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { NumberInput } from "@/components/forms/NumberInput";
import { fmtDate, fmtNaira } from "@/features/mobis-receipts/lib/mobis-labels";
import { useCreateVendorReturn, useMrnSettings, useVendorReceipt } from "../hooks/use-vendor-receipts";
import { MRN_TAX_FORM_LABELS, round2 } from "../lib/mrn-calc";
import type { Vendor, VendorReceipt } from "../types/vendor-receipt.types";
import { VendorPicker } from "./VendorReceiptForm";

function ReturnForm({ receipt }: { receipt: VendorReceipt }) {
  const router = useRouter();
  const create = useCreateVendorReturn(receipt.id);
  const settings = useMrnSettings(receipt.receivingBranchId);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [fullReturn, setFullReturn] = useState(false);
  const [otherVendor, setOtherVendor] = useState<Vendor | null>(null);
  const [changeVendor, setChangeVendor] = useState(false);
  const [remarks, setRemarks] = useState("");

  const lines = receipt.lines.map((l) => {
    const left = l.receivedQuantity - l.returnedQuantity;
    const quantity = fullReturn ? left : quantities[l.id] ?? 0;
    const amount = round2(l.unitCost * quantity);
    return { line: l, left, quantity, amount, tax: round2((amount * l.vatPercent) / 100) };
  });
  const value = round2(lines.reduce((s, l) => s + l.amount, 0));
  const tax = round2(lines.reduce((s, l) => s + l.tax, 0));
  const before = round2(value + tax);
  const net = settings.data?.roundMrnTotal ? Math.round(before) : before;

  const errors: string[] = [];
  if (!lines.some((l) => l.quantity > 0)) errors.push("Enter a quantity to return, or tick Full return");
  if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 0 || l.quantity > l.left)) errors.push("Each quantity must be a whole number up to what is left to return");
  if (lines.some((l) => l.quantity > l.line.stock)) errors.push("A part has fewer units in stock than you are returning");
  if (changeVendor && !otherVendor) errors.push("Choose the vendor the parts go back to");

  function submit() {
    if (errors.length) return;
    create.mutate(
      {
        vendorId: changeVendor ? otherVendor?.id : undefined,
        fullReturn: fullReturn || undefined,
        remarks: remarks.trim() || undefined,
        lines: fullReturn ? undefined : lines.filter((l) => l.quantity > 0).map((l) => ({ mrnLineId: l.line.id, quantity: l.quantity })),
      },
      { onSuccess: (ret) => router.push(`/inventory/mrn-returns/${ret.id}`) },
    );
  }

  return (
    <div className="grid gap-5 px-4 py-6 lg:px-6">
      <Link href={`/inventory/mrn/${receipt.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to MRN {receipt.mrnNumber}
      </Link>
      <div className="grid gap-4 rounded-xl border bg-white p-5">
        <h1 className="text-lg font-semibold">Return to vendor · MRN {receipt.mrnNumber}</h1>
        <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
          <p>
            <span className="block text-xs uppercase text-slate-400">MRN vendor</span>
            {receipt.vendor}
          </p>
          <p>
            <span className="block text-xs uppercase text-slate-400">Vendor invoice</span>
            <span className="font-mono">{receipt.invoiceNumber}</span> · {fmtDate(receipt.invoiceDate)}
          </p>
          <p>
            <span className="block text-xs uppercase text-slate-400">MRN date</span>
            {fmtDate(receipt.receiptDate)}
          </p>
          <p>
            <span className="block text-xs uppercase text-slate-400">Tax form (from the MRN)</span>
            {receipt.taxForm ? MRN_TAX_FORM_LABELS[receipt.taxForm] : "—"}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={changeVendor} onChange={(e) => { setChangeVendor(e.target.checked); setOtherVendor(null); }} />
          Return to a different vendor
        </label>
        {changeVendor && (
          <Field label="Vendor the parts go back to">
            <VendorPicker value={otherVendor} onChange={setOtherVendor} />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={fullReturn} onChange={(e) => setFullReturn(e.target.checked)} />
          Full return (everything still on this MRN)
        </label>
      </div>

      <div className="grid gap-3 rounded-xl border bg-white p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Part</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2 text-right">Returned</th>
                <th className="px-3 py-2 text-right">In stock</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2">Return qty</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ line, left, quantity, amount }) => (
                <tr key={line.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <span className="font-mono font-medium">{line.part.partNumber}</span>
                    <span className="block text-xs text-muted-foreground">
                      {line.part.name} · {line.sourceLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.receivedQuantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.returnedQuantity || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.stock}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(line.unitCost)}</td>
                  <td className="px-3 py-2">
                    {left > 0 ? (
                      <NumberInput
                        min="0"
                        max={String(left)}
                        step="1"
                        disabled={fullReturn}
                        aria-label={`Return quantity of ${line.part.partNumber}`}
                        className={`${inputCls} h-8 w-20`}
                        value={quantity}
                        onValueChange={(v) => setQuantities((q) => ({ ...q, [line.id]: v ?? 0 }))}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">All returned</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="border-t">
                <td colSpan={6} className="px-3 py-1.5 text-right">Value</td>
                <td className="px-3 py-1.5 text-right">{fmtNaira(value)}</td>
              </tr>
              <tr>
                <td colSpan={6} className="px-3 py-1.5 text-right">VAT</td>
                <td className="px-3 py-1.5 text-right">{fmtNaira(tax)}</td>
              </tr>
              <tr className="border-t">
                <td colSpan={6} className="px-3 py-2 text-right font-semibold">Return amount</td>
                <td className="px-3 py-2 text-right font-semibold">{fmtNaira(net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <Field label="Remarks (why the parts go back)">
          <input className={inputCls} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
        {errors.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-destructive">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        <div>
          <Button type="button" disabled={errors.length > 0 || create.isPending} onClick={submit}>
            {create.isPending ? "Posting…" : "Post MRN return"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Parts sent back to the vendor against a vendor MRN (legacy MRN Return). */
export function VendorReturnForm({ mrnId }: { mrnId: string }) {
  const { data: receipt, isLoading, isError } = useVendorReceipt(mrnId);
  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  if (isError || !receipt) return <p className="px-4 py-10 text-sm text-red-500 lg:px-6">Vendor receipt not found.</p>;
  return <ReturnForm key={receipt.id} receipt={receipt} />;
}
