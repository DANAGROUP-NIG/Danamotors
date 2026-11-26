"use client";

import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtNaira } from "@/features/mobis-receipts/lib/mobis-labels";
import { useVendorReturn } from "../hooks/use-vendor-receipts";
import { MRN_TAX_FORM_LABELS } from "../lib/mrn-calc";

/** One MRN return, printable as the return note that goes with the parts. */
export function VendorReturnDetail({ id }: { id: string }) {
  const { data: ret, isLoading, isError } = useVendorReturn(id);
  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  if (isError || !ret) return <p className="px-4 py-10 text-sm text-red-500 lg:px-6">MRN return not found.</p>;

  return (
    <div className="grid gap-5 px-4 py-6 lg:px-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/inventory/mrn-returns" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to MRN returns
        </Link>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="size-4" /> Print return
        </Button>
      </div>

      <div className="grid gap-4 rounded-xl border bg-white p-5 print:border-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">MRN return {ret.returnNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {ret.branch.name}
              {ret.fullReturn ? " · full return" : ""}
            </p>
          </div>
          <p className="text-right text-sm">
            <span className="block font-semibold">{fmtNaira(ret.netAmount)}</span>
            <span className="text-muted-foreground">{ret.totalQuantity} unit(s)</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
          <p>
            <span className="block text-xs uppercase text-slate-400">Returned to</span>
            {ret.vendorName}
            {ret.mrn.vendor && ret.mrn.vendor !== ret.vendorName && <span className="block text-xs text-muted-foreground">MRN vendor: {ret.mrn.vendor}</span>}
          </p>
          <p>
            <span className="block text-xs uppercase text-slate-400">Return date</span>
            {fmtDate(ret.returnDate)}
          </p>
          <p>
            <span className="block text-xs uppercase text-slate-400">Against MRN</span>
            <Link href={`/inventory/mrn/${ret.mrn.id}`} className="font-mono text-primary hover:underline print:text-inherit">
              {ret.mrn.mrnNumber}
            </Link>{" "}
            · {fmtDate(ret.mrn.receiptDate)}
          </p>
          <p>
            <span className="block text-xs uppercase text-slate-400">Vendor invoice</span>
            <span className="font-mono">{ret.mrn.invoiceNumber ?? "—"}</span>
            {ret.mrn.invoiceDate ? ` · ${fmtDate(ret.mrn.invoiceDate)}` : ""}
          </p>
          <p>
            <span className="block text-xs uppercase text-slate-400">Tax form</span>
            {ret.taxForm ? MRN_TAX_FORM_LABELS[ret.taxForm] : "—"}
          </p>
          <p>
            <span className="block text-xs uppercase text-slate-400">Entered by</span>
            {ret.createdBy ? `${ret.createdBy.firstName} ${ret.createdBy.lastName}` : "—"}
          </p>
        </div>
        {ret.remarks && <p className="text-sm text-slate-600">{ret.remarks}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Part</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">VAT</th>
              </tr>
            </thead>
            <tbody>
              {ret.lines.map((line) => (
                <tr key={line.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <span className="font-mono font-medium">{line.part.partNumber}</span>
                    <span className="block text-xs text-muted-foreground">{line.part.name}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{line.sourceLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(line.unitCost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(line.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.taxAmount ? fmtNaira(line.taxAmount) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              {[
                ["Value", fmtNaira(ret.totalValue)],
                ["VAT", fmtNaira(ret.taxAmount)],
                ...(ret.roundOff ? [["Round off", ret.roundOff.toFixed(2)]] : []),
                ["Return amount", fmtNaira(ret.netAmount)],
              ].map(([label, value], i, rows) => (
                <tr key={label} className={i === 0 || i === rows.length - 1 ? "border-t" : undefined}>
                  <td colSpan={5} className={`px-3 py-1.5 text-right ${i === rows.length - 1 ? "font-semibold" : ""}`}>
                    {label}
                  </td>
                  <td className={`px-3 py-1.5 text-right ${i === rows.length - 1 ? "font-semibold" : ""}`}>{value}</td>
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
        <div className="mt-8 hidden grid-cols-2 gap-8 text-sm print:grid">
          <p className="border-t pt-1">Store officer</p>
          <p className="border-t pt-1">Received by (vendor)</p>
        </div>
      </div>
    </div>
  );
}
