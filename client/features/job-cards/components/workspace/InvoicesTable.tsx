import Link from "next/link";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { formatDate, formatMoney } from "@/lib/format";
import { invoiceStatusBadge } from "../../lib/job-frame.logic";
import type { JobCardInvoice } from "../../types/job-card.types";

/** The job's bills with their totals and what is still outstanding, as the server reports them. */
export function InvoicesTable({ invoices }: { invoices: JobCardInvoice[] }) {
  if (!invoices.length) return <p className="text-sm text-muted-foreground">No bill has been created for this job yet.</p>;
  return (
    <div className="overflow-x-auto" role="region" aria-label="Bills" tabIndex={0}>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 pr-3 font-medium">Bill</th>
            <th scope="col" className="py-2 pr-3 font-medium">Date</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Total</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Outstanding</th>
            <th scope="col" className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => {
            const badge = invoiceStatusBadge(invoice.status);
            return (
              <tr key={invoice.id} className="border-t border-border">
                <td className="py-2 pr-3">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {invoice.invoiceNumber}
                  </Link>
                </td>
                <td className="whitespace-nowrap py-2 pr-3">{formatDate(invoice.issuedDate)}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{formatMoney(invoice.total)}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{formatMoney(invoice.outstandingAmount)}</td>
                <td className="py-2">
                  <StatusBadge status={badge.label} tone={badge.tone} className="text-xs normal-case" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
