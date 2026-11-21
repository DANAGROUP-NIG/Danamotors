"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  lagosDate,
  moneyText,
} from "@/features/service-transactions/transaction.logic";
import type { ReceiptDocument as ReceiptData } from "../hooks/use-receipt";

export function ReceiptDocument({ receipt }: { receipt: ReceiptData }) {
  const snapshot = receipt.advanceSnapshot;
  const advance = !!receipt.advanceJobCardId;
  const customer =
    snapshot?.customerName ||
    receipt.customer.companyName ||
    `${receipt.customer.firstName} ${receipt.customer.lastName}`;
  const receivedBy =
    [receipt.issuedBy?.firstName, receipt.issuedBy?.lastName]
      .filter(Boolean)
      .join(" ") || "—";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 lg:p-6 print:p-0">
      <div className="flex justify-end print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print receipt
        </Button>
      </div>
      <article
        id="payment-receipt-print"
        aria-label={advance ? "Advance payment receipt" : "Payment receipt"}
        className="space-y-6 p-4 bg-background text-foreground"
      >
        <style>{`@media print { body * { visibility: hidden; } #payment-receipt-print, #payment-receipt-print * { visibility: visible; } #payment-receipt-print { position: absolute; top: 0; left: 0; width: 100%; } #payment-receipt-print section, #payment-receipt-print footer { break-inside: avoid; } #payment-receipt-print thead { display: table-header-group; } }`}</style>
        <header className="flex flex-wrap items-start justify-between gap-4 border-y border-border py-5">
          <div>
            <p className="text-sm font-medium uppercase text-muted-foreground">
              {advance ? "Advance payment receipt" : "Payment receipt"}
            </p>
            <h1 className="mt-1 text-xl font-semibold">
              {receipt.receiptNumber}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {snapshot?.branchName || receipt.branch?.name || "—"}
            </p>
          </div>
          <div className="text-right">
            <span
              className={`inline-flex border border-border px-2 py-1 text-sm font-medium ${receipt.status !== "ACTIVE" ? "text-destructive" : ""}`}
            >
              {receipt.status}
            </span>
            <p className="mt-2 text-sm">
              Payment date: {lagosDate(receipt.issuedAt)}
            </p>
          </div>
        </header>

        {receipt.status !== "ACTIVE" && (
          <p
            role="status"
            className="border border-border p-3 text-sm font-semibold text-destructive"
          >
            {receipt.status}
            {receipt.cancelRemark ? ` — ${receipt.cancelRemark}` : ""}
          </p>
        )}

        <section className="grid gap-5 sm:grid-cols-2 print:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Received from</h2>
            <p className="text-sm">{customer}</p>
            {snapshot && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Job card</dt>
                <dd>{snapshot.jobNumber}</dd>
                <dt className="text-muted-foreground">Vehicle registration</dt>
                <dd>{snapshot.registrationNumber || "—"}</dd>
                <dt className="text-muted-foreground">Estimate</dt>
                <dd>
                  {snapshot.estimateNumber || "—"} · Version{" "}
                  {snapshot.estimateVersion}
                </dd>
              </dl>
            )}
          </div>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Payment details</h2>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Payment method</dt>
              <dd>{receipt.mode.replaceAll("_", " ")}</dd>
              <dt className="text-muted-foreground">Bank</dt>
              <dd>{receipt.bank?.name || "—"}</dd>
              <dt className="text-muted-foreground">Reference</dt>
              <dd className="break-words">{receipt.reference || "—"}</dd>
            </dl>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Payment received</h2>
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-4">
                  Description
                </th>
                <th scope="col" className="py-2 text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-3 pr-4">
                  {advance
                    ? `Advance payment${snapshot ? ` for job ${snapshot.jobNumber}` : ""}`
                    : "Payment received"}
                  {receipt.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {receipt.notes}
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap py-3 text-right tabular-nums">
                  {moneyText(receipt.amount)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="py-3 text-left font-semibold">
                  Total received on this receipt
                </th>
                <td className="whitespace-nowrap py-3 text-right font-semibold tabular-nums">
                  {moneyText(receipt.amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {advance && snapshot && (
          <section className="ml-auto w-full max-w-sm space-y-3 border-t border-border pt-4">
            <h2 className="text-sm font-semibold">
              Advance summary at payment date
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt>Estimate total</dt>
              <dd className="text-right tabular-nums">
                {moneyText(snapshot.estimateTotal)}
              </dd>
              <dt>Total advances received</dt>
              <dd className="text-right tabular-nums">
                {moneyText(snapshot.receivedAmount)}
              </dd>
              <dt>Percentage paid</dt>
              <dd className="text-right">
                {snapshot.paidPercent === null
                  ? "Unavailable"
                  : `${snapshot.paidPercent}%`}
              </dd>
              <dt className="border-t border-border pt-2 font-semibold">
                Estimated balance
              </dt>
              <dd className="border-t border-border pt-2 text-right font-semibold tabular-nums">
                {moneyText(snapshot.balanceAmount)}
              </dd>
              {snapshot.excessAmount > 0 && (
                <>
                  <dt>Excess advance</dt>
                  <dd className="text-right tabular-nums">
                    {moneyText(snapshot.excessAmount)}
                  </dd>
                </>
              )}
            </dl>
          </section>
        )}

        {!!receipt.allocations.length && (
          <section className="space-y-3 border-t border-border pt-4">
            <h2 className="font-semibold">Current allocations</h2>
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2">
                    Invoice / adjustment
                  </th>
                  <th scope="col" className="py-2 text-right">
                    Amount applied
                  </th>
                </tr>
              </thead>
              <tbody>
                {receipt.allocations.map((allocation, index) => (
                  <tr
                    key={index}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-2">
                      {allocation.invoice?.invoiceNumber ||
                        "Account adjustment"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {moneyText(allocation.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="space-y-4 border-t border-border pt-5 text-sm">
          <dl>
            <dt className="text-muted-foreground">Received by</dt>
            <dd className="mt-1 font-medium">{receivedBy}</dd>
          </dl>
          {advance && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Payment received in advance for the referenced job. The final
              balance is determined by completed work and the final invoice. The
              advance summary records the figures at payment date. Later
              allocations do not represent additional cash received.
            </p>
          )}
        </footer>
      </article>
    </div>
  );
}
