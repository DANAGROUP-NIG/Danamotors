"use client";

import { DocumentPrintHeader, PrintDocument, PrintSignatures } from "@/components/print/DocumentPrintHeader";
import { printDate, printMoney } from "@/features/part-sale/components/CounterSalePrint";
import { customerAddress, customerName } from "@/features/part-sale/lib/part-sale-format";
import type { Challan } from "../types/challan.types";

const th = "border border-black px-1.5 py-1 text-left font-semibold";
const td = "border border-black px-1.5 py-0.5 align-top";

/**
 * The dispatch challan as printed (legacy Dispatch Challan): it goes out with the goods and the
 * gate pass. Not a bill: values are at the retail rate on the day of issue. Shown only on paper.
 */
export function ChallanPrint({ challan }: { challan: Challan }) {
  const returned = challan.lines.reduce((s, l) => s + l.returnedQuantity, 0);
  return (
    <PrintDocument>
      <DocumentPrintHeader
        branch={challan.branch}
        title="Dispatch challan"
        fields={[
          { label: "Challan no.", value: challan.challanNumber },
          { label: "Date", value: printDate(challan.challanDate) },
          { label: "Gate pass", value: challan.gatePassNumber },
        ]}
      />

      <section className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase">Issued to (cost centre)</p>
          <p className="font-semibold">
            {customerName(challan.customer)}
            {challan.customer.code && <span className="ml-2 font-mono font-normal">({challan.customer.code})</span>}
          </p>
          {customerAddress(challan.customer) && <p>{customerAddress(challan.customer)}</p>}
        </div>
        <div>
          {challan.remarks && <p>Remarks: {challan.remarks}</p>}
          <p className="mt-1 text-xs">Internal issue, not a bill. Values at retail rate on the day of issue.</p>
        </div>
      </section>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>S/N</th>
            <th className={th}>Part no.</th>
            <th className={th}>Description</th>
            <th className={th}>UOM</th>
            <th className={`${th} text-right`}>Qty issued</th>
            {returned > 0 && <th className={`${th} text-right`}>Qty returned</th>}
            <th className={`${th} text-right`}>Rate</th>
            <th className={`${th} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {challan.lines.map((l, i) => (
            <tr key={l.id} className="break-inside-avoid">
              <td className={td}>{i + 1}</td>
              <td className={`${td} font-mono`}>{l.part.partNumber}</td>
              <td className={td}>{l.part.name}</td>
              <td className={td}>{l.part.uom ?? ""}</td>
              <td className={`${td} text-right`}>{l.quantity}</td>
              {returned > 0 && <td className={`${td} text-right`}>{l.returnedQuantity || "—"}</td>}
              <td className={`${td} text-right`}>{printMoney(l.rate)}</td>
              <td className={`${td} text-right`}>{printMoney(l.amount)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={td} colSpan={4}>
              Total: {challan.lines.length} item(s)
            </td>
            <td className={`${td} text-right`}>{challan.totalQuantity}</td>
            {returned > 0 && <td className={`${td} text-right`}>{returned}</td>}
            <td className={td} />
            <td className={`${td} text-right`}>{printMoney(challan.totalAmount)}</td>
          </tr>
        </tbody>
      </table>

      {challan.returns.length > 0 && (
        <section className="mt-3 break-inside-avoid">
          <p className="font-semibold">Returns against this challan</p>
          <table className="mt-1 w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Return no.</th>
                <th className={th}>Date</th>
                <th className={th}>Parts</th>
                <th className={`${th} text-right`}>Qty</th>
                <th className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {challan.returns.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} font-mono`}>
                    {r.returnNumber}
                    {r.fullReturn ? " (full)" : ""}
                  </td>
                  <td className={td}>{printDate(r.returnDate)}</td>
                  <td className={td}>{r.lines.map((l) => `${l.part.partNumber} × ${l.quantity}`).join(", ")}</td>
                  <td className={`${td} text-right`}>{r.totalQuantity}</td>
                  <td className={`${td} text-right`}>{printMoney(r.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="mt-3">
        Issued by: {challan.createdBy ? `${challan.createdBy.firstName} ${challan.createdBy.lastName}` : "—"}
      </p>
      <PrintSignatures labels={["Store (issued by)", "Received by (name and signature)", "Security (gate pass checked)"]} />
    </PrintDocument>
  );
}
