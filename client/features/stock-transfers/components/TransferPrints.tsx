"use client";

import { useEffect, useState } from "react";
import { DocumentPrintHeader, PrintDocument, PrintSignatures } from "@/components/print/DocumentPrintHeader";
import { nairaInWords } from "@/components/print/amount-in-words";
import { printDate, printMoney } from "@/features/part-sale/components/CounterSalePrint";
import { STN_TAX_FORMS, TRANSPORT_MODE_LABELS, personName } from "../lib/indent-status";
import type { BranchRef, Indent, PickingList, StnDetail } from "../types/indent.types";

const th = "border border-black px-1.5 py-1 text-left font-semibold";
const td = "border border-black px-1.5 py-0.5 align-top";

/**
 * Prints one of several documents from the same page: the chosen document is rendered, the print
 * dialog opens, and it is removed again once printing is done.
 */
export function usePrintChoice<T extends string>() {
  const [doc, setDoc] = useState<T | null>(null);
  useEffect(() => {
    if (!doc) return;
    const done = () => setDoc(null);
    window.addEventListener("afterprint", done, { once: true });
    const timer = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [doc]);
  return { doc, print: setDoc };
}

function BranchAddress({ label, branch }: { label: string; branch: BranchRef }) {
  const place = [branch.address, branch.city, branch.state].filter(Boolean).join(", ");
  return (
    <div>
      <p className="text-xs uppercase">{label}</p>
      <p className="font-semibold">{branch.name}</p>
      {place && <p>{place}</p>}
      {branch.phoneNumber && <p>Tel: {branch.phoneNumber}</p>}
    </div>
  );
}

const despatchOf = (stn: StnDetail) =>
  [
    stn.transportMode && TRANSPORT_MODE_LABELS[stn.transportMode],
    stn.packingList?.courierName && `Courier: ${stn.packingList.courierName}`,
    stn.packingList?.waybillNumber && `Waybill: ${stn.packingList.waybillNumber}`,
  ].filter(Boolean);

/**
 * The stock transfer note as printed (legacy Stock Transfer Note). At Kia Plaza and Abuja it is the
 * only paper that travels with the goods. Valued at the dealer rate; VAT only under forms L and Z.
 */
export function StnPrint({ stn }: { stn: StnDetail }) {
  const cancelled = stn.status === "CANCELLED";
  const net = stn.totalValue + stn.taxAmount;
  const severalIndents = stn.indents.length > 1;
  const despatch = despatchOf(stn);
  const qtyEdits = stn.edits.filter((e) => e.partNumber);
  return (
    <PrintDocument>
      <DocumentPrintHeader
        branch={stn.sourceBranch}
        title={`Stock transfer note${cancelled ? " (cancelled)" : ""}`}
        fields={[
          { label: "STN no.", value: stn.stnNumber },
          { label: "Date", value: printDate(stn.documentDate) },
          { label: "Gate pass", value: stn.packingList?.gatePassNumber },
          { label: "Tax form", value: stn.taxForm ? (STN_TAX_FORMS[stn.taxForm as keyof typeof STN_TAX_FORMS] ?? stn.taxForm) : null },
        ]}
      />

      <section className="mt-3 grid grid-cols-2 gap-4">
        <BranchAddress label="Transferred to" branch={stn.destinationBranch} />
        <div>
          <p>
            {stn.indents.length
              ? `Indent${severalIndents ? "s" : ""}: ${stn.indents.map((i) => i.indentNumber).join(", ")}`
              : "Direct STN (no indent)"}
          </p>
          {despatch.length > 0 && <p>{despatch.join(" · ")}</p>}
          {stn.packingList && (
            <p>
              Packing list {stn.packingList.packingNumber}, {stn.cases.length} case(s)
            </p>
          )}
          {stn.remarks && <p>Remarks: {stn.remarks}</p>}
        </div>
      </section>

      {cancelled && (
        <p className="mt-2 border border-black px-2 py-1 font-semibold">
          Cancelled {printDate(stn.cancelledAt)} by {personName(stn.cancelledBy)}: {stn.cancellationReason}. The goods did not leave.
        </p>
      )}

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>S/N</th>
            {severalIndents && <th className={th}>Indent</th>}
            <th className={th}>Part no.</th>
            <th className={th}>Description</th>
            <th className={th}>Flag</th>
            <th className={th}>UOM</th>
            <th className={`${th} text-right`}>Qty</th>
            <th className={`${th} text-right`}>Rate</th>
            <th className={`${th} text-right`}>Amount</th>
            {stn.taxAmount > 0 && <th className={`${th} text-right`}>VAT</th>}
          </tr>
        </thead>
        <tbody>
          {stn.lines.map((l, i) => (
            <tr key={l.id} className="break-inside-avoid">
              <td className={td}>{i + 1}</td>
              {severalIndents && <td className={`${td} font-mono`}>{l.indentLine?.indent.indentNumber ?? ""}</td>}
              <td className={`${td} font-mono`}>
                {l.part.partNumber}
                {l.isAlternate && <span className="block text-xs">alt. for {l.requestedPart.partNumber}</span>}
              </td>
              <td className={td}>{l.part.name}</td>
              <td className={td}>{l.part.partFlag ?? ""}</td>
              <td className={td}>{l.part.uom}</td>
              <td className={`${td} text-right`}>{l.quantity}</td>
              <td className={`${td} text-right`}>{printMoney(l.unitRate)}</td>
              <td className={`${td} text-right`}>{printMoney(l.amount)}</td>
              {stn.taxAmount > 0 && <td className={`${td} text-right`}>{l.taxAmount ? printMoney(l.taxAmount) : "—"}</td>}
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={td} colSpan={severalIndents ? 6 : 5}>
              Total: {stn.lines.length} item(s)
            </td>
            <td className={`${td} text-right`}>{stn.totalQuantity}</td>
            <td className={td} />
            <td className={`${td} text-right`}>{printMoney(stn.totalValue)}</td>
            {stn.taxAmount > 0 && <td className={`${td} text-right`}>{printMoney(stn.taxAmount)}</td>}
          </tr>
        </tbody>
      </table>

      <section className="mt-2 ml-auto w-72 break-inside-avoid">
        <table className="w-full">
          <tbody>
            <tr>
              <td>Goods value</td>
              <td className="text-right">{printMoney(stn.totalValue)}</td>
            </tr>
            {stn.taxAmount > 0 && (
              <tr>
                <td>VAT</td>
                <td className="text-right">{printMoney(stn.taxAmount)}</td>
              </tr>
            )}
            <tr className="border-t border-black font-bold">
              <td>Net amount</td>
              <td className="text-right">{printMoney(net)}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <p className="mt-1">Amount in words: {nairaInWords(net)}</p>

      {qtyEdits.length > 0 && (
        <p className="mt-2 text-xs">
          Changed after dispatch:{" "}
          {qtyEdits.map((e) => `${e.partNumber} ${e.oldQuantity} → ${e.newQuantity} (${e.reason})`).join("; ")}
        </p>
      )}

      <p className="mt-3">Dispatched by: {personName(stn.dispatchedBy)}</p>
      <PrintSignatures labels={["Store (issued by)", "Security (gate pass checked)", "Received by (name, signature, date)"]} />
    </PrintDocument>
  );
}

/**
 * The packing list cum gate pass as printed (legacy, one per STN at CPD): security checks the gate
 * pass at the gate, and each case's contents are listed so the receiving branch can check them.
 */
export function PackingListPrint({ stn }: { stn: StnDetail }) {
  const packing = stn.packingList;
  if (!packing) return null;
  const cancelled = packing.status === "CANCELLED";
  const partOf = (stnLineId: string) => stn.lines.find((l) => l.id === stnLineId);
  const despatch = despatchOf(stn);
  return (
    <PrintDocument>
      <DocumentPrintHeader
        branch={stn.sourceBranch}
        title={`Packing list cum gate pass${cancelled ? " (cancelled)" : ""}`}
        fields={[
          { label: "Gate pass", value: packing.gatePassNumber },
          { label: "Packing no.", value: packing.packingNumber },
          { label: "Date", value: printDate(packing.packingDate) },
          { label: "Courier date", value: printDate(packing.courierDate ?? packing.packingDate) },
          { label: "STN no.", value: stn.stnNumber },
        ]}
      />

      <section className="mt-3 grid grid-cols-2 gap-4">
        <BranchAddress label="Consigned to" branch={stn.destinationBranch} />
        <div>
          {despatch.length > 0 && <p>{despatch.join(" · ")}</p>}
          <p>
            {stn.cases.length} case(s), {stn.totalQuantity} unit(s)
            {packing.consignmentWeight ? `, ${packing.consignmentWeight} kg` : ""}
          </p>
          {stn.indents.length > 0 && <p>Indent(s): {stn.indents.map((i) => i.indentNumber).join(", ")}</p>}
        </div>
      </section>

      {cancelled && (
        <p className="mt-2 border border-black px-2 py-1 font-semibold">
          Void: STN {stn.stnNumber} was cancelled {printDate(stn.cancelledAt)}. This gate pass is not valid.
        </p>
      )}

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Case no.</th>
            <th className={th}>Part no.</th>
            <th className={th}>Description</th>
            <th className={th}>UOM</th>
            <th className={`${th} text-right`}>Qty</th>
          </tr>
        </thead>
        {stn.cases.map((c) => (
          <tbody key={c.id} className="break-inside-avoid">
            <tr className="font-semibold">
              <td className={`${td} font-mono`} colSpan={3}>
                Case {c.caseNumber}
                <span className="ml-3 font-normal">
                  {c.lines.length} item(s){c.packerName ? ` · packed by ${c.packerName}` : ""}
                  {c.weight ? ` · ${c.weight} kg` : ""}
                </span>
              </td>
              <td className={td} />
              <td className={`${td} text-right`}>{c.totalQuantity}</td>
            </tr>
            {c.lines.map((cl) => {
              const line = partOf(cl.stnLineId);
              return (
                <tr key={cl.id}>
                  <td className={td} />
                  <td className={`${td} font-mono`}>{line?.part.partNumber ?? ""}</td>
                  <td className={td}>{line?.part.name ?? ""}</td>
                  <td className={td}>{line?.part.uom ?? ""}</td>
                  <td className={`${td} text-right`}>{cl.quantity}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
        <tbody>
          <tr className="font-semibold">
            <td className={td} colSpan={4}>
              Total: {stn.cases.length} case(s), {stn.lines.length} item(s)
            </td>
            <td className={`${td} text-right`}>{stn.totalQuantity}</td>
          </tr>
        </tbody>
      </table>

      {packing.remarks && <p className="mt-2">Remarks: {packing.remarks}</p>}
      <PrintSignatures labels={["Packed by", "Security (gate)", "Driver / courier", "Received by"]} />
    </PrintDocument>
  );
}

/**
 * A picking list on paper (legacy Pick List for STN), in bin order: the fallback when the handheld is
 * not used. The store man ticks what was picked; the quantities are confirmed at dispatch.
 */
export function PickListPrint({ indent, pickingList }: { indent: Indent; pickingList: PickingList }) {
  const lines = [...pickingList.lines].sort((a, b) => (a.binLocation ?? "~").localeCompare(b.binLocation ?? "~"));
  return (
    <PrintDocument>
      <DocumentPrintHeader
        branch={indent.sourceBranch}
        title="Pick list"
        fields={[
          { label: "Picking no.", value: pickingList.pickingNumber },
          { label: "Date", value: printDate(pickingList.createdAt) },
          { label: "Indent no.", value: indent.indentNumber },
        ]}
      />

      <section className="mt-3 grid grid-cols-2 gap-4">
        <BranchAddress label="For" branch={indent.requestingBranch} />
        <div>
          <p>Picker: {pickingList.pickerName || "________________________"}</p>
          {indent.remarks && <p>Remarks: {indent.remarks}</p>}
        </div>
      </section>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>S/N</th>
            <th className={th}>Bin</th>
            <th className={th}>Part no.</th>
            <th className={th}>Description</th>
            <th className={th}>UOM</th>
            <th className={`${th} text-right`}>Qty to pick</th>
            <th className={`${th} w-24 text-right`}>Picked</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="break-inside-avoid">
              <td className={td}>{i + 1}</td>
              <td className={`${td} font-mono`}>{l.binLocation ?? ""}</td>
              <td className={`${td} font-mono`}>
                {l.part.partNumber}
                {l.isAlternate && <span className="block text-xs">alt. for {l.requestedPart.partNumber}</span>}
              </td>
              <td className={td}>{l.part.name}</td>
              <td className={td}>{l.part.uom}</td>
              <td className={`${td} text-right`}>{l.pickedQuantity}</td>
              <td className={td} />
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={td} colSpan={5}>
              Total: {lines.length} item(s)
            </td>
            <td className={`${td} text-right`}>{lines.reduce((s, l) => s + l.pickedQuantity, 0)}</td>
            <td className={td} />
          </tr>
        </tbody>
      </table>

      <PrintSignatures labels={["Picked by", "Checked by"]} />
    </PrintDocument>
  );
}
