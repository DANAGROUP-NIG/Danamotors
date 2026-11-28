"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { PART_SOURCE_LABELS } from "@/features/inventory/lib/part-codes";
import { NOT_PROVIDED, formatDate, formatDateTime, formatKm, formatMoney } from "@/lib/format";
import { useServiceData, type ServiceSlip } from "../hooks/use-service-transactions";
import { slipKeys, slipRoutes, type SlipKind } from "../document.types";
import { remainingReturn, serviceDocumentLabel, slipTotals } from "../transaction.logic";

type PickingPrint = {
  checklist?: { code: string | null; description: string | null; text: string } | null;
  branch: { name: string; address?: string | null } | null;
  job: { number: string; date: string; mileage: number | null; remarks: string | null; service?: { code?: string; description: string } | null } | null;
  estimate: { number: string | null; date: string; version: number; status: string; currency: string; remarks: string | null };
  vehicle: { registrationNumber: string | null; vin: string; model: string | null; trim: string | null } | null;
  lines: { lineId: string; partNumber: string | null; flag: string | null; description: string; uom: string | null; quantityRequired: number; rate: number; amount: number }[];
  totals: { numberOfItems: number; quantityRequired: number; totalAmount: number };
  printedAt: string;
};

const SLIP_TITLES: Record<SlipKind, string> = {
  requisitions: "Job card parts requisition",
  "return-slips": "Item return slip",
  "labour-slips": "Job card labour slip",
};

const cell = "p-2 align-top";
const heading = "whitespace-nowrap border-b border-border p-2";

/** The lines of a saved requisition, return slip or labour slip, with its footer totals. */
export function SlipRows({ document }: { document: ServiceSlip }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["Part or labour code", "Description", "Flag or payer", "Required or standard hours", "Issued or charged hours", "Returned", "Rate", "Amount"].map((label) => (
                <th className={heading} key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {document.lines.map((line) => {
              const person = line.technician ? `${line.technician.firstName} ${line.technician.lastName}` : line.mechanic?.name;
              return (
                <tr key={line.id}>
                  <td className={cell}>{line.partNumber ?? line.requisitionLine?.partNumber ?? line.labourItem?.code ?? NOT_PROVIDED}</td>
                  <td className={cell}>
                    {line.description ?? line.requisitionLine?.description}
                    {line.requestedPartNumber && line.requestedSparePartId !== line.sparePartId && (
                      <p className="text-xs">Requested part: {line.requestedPartNumber}. Substitution reason: {line.substitutionReason}</p>
                    )}
                    {(person || line.uom) && <div className="text-xs text-muted-foreground">{[person, line.uom].filter(Boolean).join(", ")}</div>}
                    {line.group && <div className="text-xs text-muted-foreground">Group: {line.group.code}, {line.group.description}</div>}
                    {(line.location || line.binCard) && (
                      <div className="text-xs text-muted-foreground">Location: {line.location ?? NOT_PROVIDED}. Bin card: {line.binCard ?? NOT_PROVIDED}</div>
                    )}
                    {line.warrantyRate != null && <div className="text-xs text-muted-foreground">Warranty rate: {formatMoney(line.warrantyRate)}</div>}
                  </td>
                  <td className={cell}>{line.partSource ? (PART_SOURCE_LABELS[line.partSource] ?? "Other source") : serviceDocumentLabel(line.chargeLine?.chargeType)}</td>
                  <td className={`${cell} text-right tabular-nums`}>{line.quantityRequired ?? line.standardHours ?? NOT_PROVIDED}</td>
                  <td className={`${cell} text-right tabular-nums`}>{line.quantityIssued ?? line.chargedHours ?? line.quantity ?? NOT_PROVIDED}</td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {document.returnNumber ? line.quantity : line.quantityIssued != null ? line.quantityIssued - remainingReturn(line) : NOT_PROVIDED}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>{formatMoney(line.rate)}</td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {formatMoney(line.amount)}
                    {line.approvedAmount != null && (
                      <div className="text-xs text-muted-foreground">
                        Approved {formatMoney(line.approvedAmount)}. Customer {formatMoney(line.customerAmount)}
                        {line.approvalPercent != null ? ` (${line.approvalPercent}% and ${line.customerPercent}%)` : ""}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-3 rounded-lg bg-muted p-3 text-sm sm:grid-cols-3">
        {slipTotals(document.totals).map((total) => (
          <div key={total.key}>
            <dt className="text-muted-foreground">{total.label}</dt>
            <dd className="font-medium tabular-nums">{total.money ? formatMoney(total.value) : total.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function SlipHeader({ slip }: { slip: ServiceSlip }) {
  return (
    <header className="grid gap-2 text-sm sm:grid-cols-2">
      <p>Document: {slip.requisitionNumber ?? slip.returnNumber ?? slip.slipNumber ?? NOT_PROVIDED}</p>
      <p>Branch: {slip.branch?.name ?? NOT_PROVIDED}</p>
      <p>Date: {formatDateTime(slip.createdAt)}</p>
      {slip.requisition && <p>Requisition: {slip.requisition.requisitionNumber}</p>}
      <p>Job: {slip.jobCard?.jobNumber ?? NOT_PROVIDED}</p>
      <p>Type: {serviceDocumentLabel(slip.chargeType ?? "LABOUR")}</p>
      <p>Status: {slip.status ? serviceDocumentLabel(slip.status) : "Saved"}</p>
      <p>Vehicle: {slip.jobCard?.vehicle?.registrationNumber ?? slip.jobCard?.vehicle?.vin ?? NOT_PROVIDED}</p>
      <p>Mileage: {formatKm(slip.jobCard?.mileage)}</p>
    </header>
  );
}

function PickingList({ data }: { data: PickingPrint }) {
  const { job, estimate, vehicle, checklist } = data;
  return (
    <>
      <header className="grid gap-2 text-sm sm:grid-cols-2">
        <p>Branch: {data.branch?.name ?? NOT_PROVIDED}</p>
        <p>Job: {job?.number ?? "Standalone estimate"}</p>
        <p>Estimate: {estimate.number ?? "Earlier estimate"}, revision {estimate.version}, {estimate.status}</p>
        <p>Estimate date: {formatDate(estimate.date)}</p>
        <p>Job date: {formatDate(job?.date)}</p>
        <p>Checklist code: {checklist?.code ?? NOT_PROVIDED}</p>
        {checklist?.text && (
          <p className="whitespace-pre-wrap">
            Checklist: {checklist.text}
            {checklist.description ? `, ${checklist.description}` : ""}
          </p>
        )}
        <p>Registration and VIN: {vehicle?.registrationNumber ?? NOT_PROVIDED}, {vehicle?.vin ?? NOT_PROVIDED}</p>
        <p>Model and variant: {vehicle?.model ?? NOT_PROVIDED}, {vehicle?.trim ?? NOT_PROVIDED}</p>
        <p>Mileage: {formatKm(job?.mileage)}</p>
        <p>
          Service: {job?.service?.code ? `${job.service.code}, ` : ""}
          {job?.service?.description ?? NOT_PROVIDED}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["Part number", "Flag", "Description", "Unit", "Quantity required", "Rate", "Amount"].map((label) => (
                <th className={heading} key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr key={line.lineId}>
                <td className={cell}>{line.partNumber ?? NOT_PROVIDED}</td>
                <td className={cell}>{line.flag ?? NOT_PROVIDED}</td>
                <td className={cell}>{line.description}</td>
                <td className={cell}>{line.uom ?? NOT_PROVIDED}</td>
                <td className={`${cell} text-right tabular-nums`}>{line.quantityRequired}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatMoney(line.rate)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatMoney(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm tabular-nums">
        Items: {data.totals.numberOfItems}. Quantity required: {data.totals.quantityRequired}. Total: {formatMoney(data.totals.totalAmount)}
      </p>
      <div className="whitespace-pre-wrap text-sm">
        <p>Job remarks: {job?.remarks ?? NOT_PROVIDED}</p>
        <p>Estimate remarks: {estimate.remarks ?? NOT_PROVIDED}</p>
      </div>
      <p className="text-xs text-muted-foreground">Printed {formatDateTime(data.printedAt)}, Lagos time</p>
    </>
  );
}

/** Print view for a job's picking list and its saved requisitions, return slips and labour slips. */
export function ServiceDocumentPrint({ kind, id }: { kind: string; id: string }) {
  const { hasPermission } = useAuth();
  const slipKind = Object.hasOwn(slipRoutes, kind) ? (kind as SlipKind) : null;
  const picking = kind === "job-picking" || kind === "estimate-picking";
  const valid = !!slipKind || picking;
  const permission = picking ? "jobcard:picking-list:print" : slipKind === "labour-slips" ? "jobcard:read" : "requisition:read";
  const allowed = valid && hasPermission(permission);
  const url = slipKind
    ? `${slipRoutes[slipKind]}/${id}/print`
    : `/service/${kind === "job-picking" ? "job-cards" : "estimates"}/${id}/picking-list/print`;
  const query = useServiceData<{ pickingList?: PickingPrint } & Partial<Record<"requisition" | "returnSlip" | "labourSlip", ServiceSlip>>>(url, allowed);
  if (!allowed)
    return <p role="alert">This document is not available, or you do not have print permission. Ask your service manager for access.</p>;
  if (query.isLoading) return <LoadingSkeleton variant="detail" />;
  if (query.isError || !query.data)
    return (
      <div role="alert" className="space-y-3">
        <p>Could not load the document. Check your connection and try again.</p>
        <Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>
      </div>
    );
  const slip = slipKind ? query.data[slipKeys[slipKind] as "requisition" | "returnSlip" | "labourSlip"] : undefined;
  const data = query.data.pickingList;
  return (
    <article id="service-document-print" className="mx-auto max-w-6xl space-y-5 rounded-xl border border-border bg-card p-5 text-card-foreground">
      <style>{`@media print { body * { visibility: hidden; } #service-document-print, #service-document-print * { visibility: visible; } #service-document-print { position: absolute; inset: 0; width: 100%; max-width: none; border: 0; padding: 0; } #service-document-print .print-controls { display: none; } #service-document-print tr { break-inside: avoid; } }`}</style>
      <div className="print-controls flex flex-wrap gap-3">
        <Button onClick={() => window.print()}>Print</Button>
        <Button variant="outline" asChild>
          <Link href="/job-cards">Back to job cards</Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold">{picking ? "Picking list" : slipKind ? SLIP_TITLES[slipKind] : NOT_PROVIDED}</h1>
      {slip && (
        <>
          <SlipHeader slip={slip} />
          <SlipRows document={slip} />
        </>
      )}
      {data && <PickingList data={data} />}
    </article>
  );
}
