"use client";

import { DocumentTermsBlock } from "@/components/DocumentTermsBlock";
import { DocumentPrintHeader, PrintDocument, PrintSignatures } from "@/components/print/DocumentPrintHeader";
import { nairaInWords } from "@/components/print/amount-in-words";
import { TRANSPORT_MODE_LABELS, customerAddress, customerName } from "../lib/part-sale-format";
import type { CounterSale } from "../types/part-sale.types";

const LAGOS_DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "2-digit", year: "numeric" });
export const printDate = (iso?: string | null) => (iso ? LAGOS_DATE.format(new Date(iso)) : "—");
export const printMoney = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const th = "border border-black px-1.5 py-1 text-left font-semibold";
const td = "border border-black px-1.5 py-0.5 align-top";

/** The counter-sale bill as printed for the customer (legacy Counter Sale bill). Shown only on paper. */
export function CounterSalePrint({ sale }: { sale: CounterSale }) {
  const { invoice } = sale;
  const cancelled = !!invoice.cancelledAt;
  const cpos = [...new Set(invoice.lines.map((l) => l.customerOrderLine?.order.cpoNumber).filter(Boolean))];
  const refs = [...new Set(invoice.lines.map((l) => l.customerOrderLine?.order.customerRefNo).filter(Boolean))];
  const quantity = invoice.lines.reduce((s, l) => s + l.quantity, 0);
  const despatch = [
    sale.transportMode && TRANSPORT_MODE_LABELS[sale.transportMode],
    sale.transporter,
    sale.grNumber && `GR ${sale.grNumber}${sale.grDate ? ` dt ${printDate(sale.grDate)}` : ""}`,
    sale.numberOfCases && `${sale.numberOfCases} case(s)`,
  ].filter(Boolean);

  return (
    <PrintDocument>
      <DocumentPrintHeader
        branch={sale.branch}
        title={cancelled ? "Invoice (cancelled)" : "Invoice"}
        fields={[
          { label: "Bill no.", value: invoice.invoiceNumber },
          { label: "Date", value: printDate(invoice.issuedDate) },
          { label: "Gate pass", value: sale.gatePassNumber },
          ...(invoice.dueDate ? [{ label: "Due date", value: printDate(invoice.dueDate) }] : []),
        ]}
      />

      <section className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase">Bill to</p>
          <p className="font-semibold">
            {customerName(invoice.customer)}
            {invoice.customer.code && <span className="ml-2 font-mono font-normal">({invoice.customer.code})</span>}
          </p>
          {customerAddress(invoice.customer) && <p>{customerAddress(invoice.customer)}</p>}
          {invoice.customer.phoneNumber && <p>Tel: {invoice.customer.phoneNumber}</p>}
        </div>
        <table className="self-start">
          <tbody>
            {cpos.length > 0 && (
              <tr>
                <td className="whitespace-nowrap pr-3">Order (CPO)</td>
                <td className="font-mono">{cpos.join(", ")}</td>
              </tr>
            )}
            {refs.length > 0 && (
              <tr>
                <td className="whitespace-nowrap pr-3">Your ref.</td>
                <td>{refs.join(", ")}</td>
              </tr>
            )}
            <tr>
              <td className="whitespace-nowrap pr-3">Sales executive</td>
              <td>{sale.salesExecutive ? `${sale.salesExecutive.firstName} ${sale.salesExecutive.lastName}` : "—"}</td>
            </tr>
            {despatch.length > 0 && (
              <tr>
                <td className="whitespace-nowrap pr-3">Despatch</td>
                <td>{despatch.join(" · ")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>S/N</th>
            <th className={th}>Part no.</th>
            <th className={th}>Description</th>
            <th className={th}>UOM</th>
            <th className={`${th} text-right`}>Qty</th>
            <th className={`${th} text-right`}>Rate</th>
            <th className={`${th} text-right`}>VAT %</th>
            <th className={`${th} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((l, i) => (
            <tr key={l.id} className="break-inside-avoid">
              <td className={td}>{i + 1}</td>
              <td className={`${td} font-mono`}>{l.part?.partNumber ?? ""}</td>
              <td className={td}>{l.description}</td>
              <td className={td}>{l.part?.uom ?? ""}</td>
              <td className={`${td} text-right`}>{l.quantity}</td>
              <td className={`${td} text-right`}>{printMoney(l.rate)}</td>
              <td className={`${td} text-right`}>{l.vatPercent ? l.vatPercent : "—"}</td>
              <td className={`${td} text-right`}>{printMoney(l.amount)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={td} colSpan={4}>
              Total: {invoice.lines.length} item(s)
            </td>
            <td className={`${td} text-right`}>{quantity}</td>
            <td className={td} colSpan={2} />
            <td className={`${td} text-right`}>{printMoney(invoice.partsTotal)}</td>
          </tr>
        </tbody>
      </table>

      <section className="mt-3 flex items-start justify-between gap-6 break-inside-avoid">
        <p className="max-w-[60%]">
          <span className="text-xs uppercase">Amount in words</span>
          <br />
          <span className="font-semibold">{nairaInWords(invoice.total)}</span>
        </p>
        <table className="shrink-0">
          <tbody>
            <tr>
              <td className="pr-6">Gross amount</td>
              <td className="text-right">{printMoney(invoice.partsTotal)}</td>
            </tr>
            {invoice.partsDiscountAmount > 0 && (
              <tr>
                <td className="pr-6">Cash discount ({Number(invoice.partsDiscountPercent.toFixed(4))}%)</td>
                <td className="text-right">-{printMoney(invoice.partsDiscountAmount)}</td>
              </tr>
            )}
            <tr>
              <td className="pr-6">VAT ({invoice.vatRate}%)</td>
              <td className="text-right">{printMoney(invoice.vatAmount)}</td>
            </tr>
            {invoice.roundOff !== 0 && (
              <tr>
                <td className="pr-6">Round off</td>
                <td className="text-right">{printMoney(invoice.roundOff)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-black text-base font-bold">
              <td className="pr-6">Net amount (₦)</td>
              <td className="text-right">{printMoney(invoice.total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {invoice.notes && <p className="mt-3">Remarks: {invoice.notes}</p>}
      {cancelled && (
        <p className="mt-3 font-semibold">
          CANCELLED on {printDate(invoice.cancelledAt)}
          {invoice.cancelRemark ? `: ${invoice.cancelRemark}` : ""}
        </p>
      )}

      <div className="mt-4">
        <DocumentTermsBlock documentType="COUNTER_SALE" branchId={sale.branchId} />
      </div>
      <PrintSignatures labels={["Prepared by", "Authorised signatory", "Received in good condition (customer)"]} />
    </PrintDocument>
  );
}
