"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtNaira } from "@/features/mobis-receipts/lib/mobis-labels";
import { useVendorReceipt } from "../hooks/use-vendor-receipts";
import type { VendorReceipt, VendorReceiptLine } from "../types/vendor-receipt.types";

type LabelMode = "unit" | "line";

/** Shelf labels for received parts: part number (the record's own code), name, source and bin. Staff-only. */
function ReceiptLabels({ receipt, mode }: { receipt: VendorReceipt; mode: LabelMode }) {
  const labels: VendorReceiptLine[] = receipt.lines.flatMap((line) =>
    mode === "unit" ? Array.from({ length: line.receivedQuantity }, () => line) : [line],
  );
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3 print:gap-1">
      {labels.map((line, index) => (
        <div key={`${line.id}-${index}`} className="break-inside-avoid rounded border border-slate-400 p-2 print:rounded-none">
          <p className="font-mono text-base font-bold leading-tight">{line.part.partNumber}</p>
          <p className="truncate text-xs">{line.part.name}</p>
          <p className="mt-1 flex justify-between gap-2 text-xs">
            <span className="font-semibold">{line.sourceLabel}</span>
            <span>Bin {line.bin ?? "—"}</span>
          </p>
          <p className="text-[10px] text-slate-500">
            MRN {receipt.mrnNumber}
            {mode === "line" ? ` · Qty ${line.receivedQuantity}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

export function VendorReceiptDetail({ id }: { id: string }) {
  const { data: receipt, isLoading, isError } = useVendorReceipt(id);
  const [labels, setLabels] = useState<LabelMode | null>(null);
  const [printing, setPrinting] = useState(false);

  // Print once the chosen view has rendered.
  useEffect(() => {
    if (!printing) return;
    window.print();
    setPrinting(false);
  }, [printing]);

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  if (isError || !receipt) return <p className="px-4 py-10 text-sm text-red-500 lg:px-6">Vendor receipt not found.</p>;

  return (
    <div className="grid gap-5 px-4 py-6 lg:px-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/inventory/vendor-receipts" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to vendor receipts
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setLabels(null); setPrinting(true); }}>
            <Printer className="size-4" /> Print MRN
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setLabels("unit"); setPrinting(true); }}>
            <Tags className="size-4" /> Labels (one per unit)
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setLabels("line"); setPrinting(true); }}>
            <Tags className="size-4" /> Labels (one per line)
          </Button>
        </div>
      </div>

      <div className={labels ? "print:hidden" : undefined}>
        <div className="grid gap-4 rounded-xl border bg-white p-5 print:border-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">MRN {receipt.mrnNumber}</h1>
              <p className="text-sm text-muted-foreground">Vendor receipt · {receipt.receivingBranch.name}</p>
            </div>
            <p className="text-right text-sm">
              <span className="block font-semibold">{fmtNaira(receipt.totalValue)}</span>
              <span className="text-muted-foreground">{receipt.totalReceived} unit(s)</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
            <p>
              <span className="block text-xs uppercase text-slate-400">Vendor</span>
              {receipt.vendor}
              {receipt.vendorParty?.code && <span className="ml-1 font-mono text-xs text-muted-foreground">{receipt.vendorParty.code}</span>}
            </p>
            <p>
              <span className="block text-xs uppercase text-slate-400">Vendor invoice</span>
              <span className="font-mono">{receipt.invoiceNumber}</span> · {fmtDate(receipt.invoiceDate)}
            </p>
            <p>
              <span className="block text-xs uppercase text-slate-400">Received</span>
              {fmtDate(receipt.receiptDate)}
            </p>
            <p>
              <span className="block text-xs uppercase text-slate-400">Received by</span>
              {receipt.receivedBy ? `${receipt.receivedBy.firstName} ${receipt.receivedBy.lastName}` : "—"}
            </p>
          </div>
          {receipt.remarks && <p className="text-sm text-slate-600">{receipt.remarks}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-2">Part</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Bin</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit cost</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {receipt.lines.map((line) => (
                  <tr key={line.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <Link href={`/inventory/${line.part.id}`} className="font-mono font-medium text-primary hover:underline print:text-inherit">
                        {line.part.partNumber}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {line.part.name}
                        {line.part.sourceOfPart ? ` · source of ${line.part.sourceOfPart.partNumber}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{line.sourceLabel}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{line.bin ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{line.receivedQuantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(line.unitCost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={labels ? "grid gap-2" : "hidden"}>
        <p className="text-sm text-muted-foreground print:hidden">Label preview ({labels === "unit" ? "one per unit" : "one per line"}).</p>
        {labels && <ReceiptLabels receipt={receipt} mode={labels} />}
      </div>
    </div>
  );
}
