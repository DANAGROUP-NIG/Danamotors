"use client";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useServiceData, type ServiceSlip } from '../hooks/use-service-transactions';
import { slipKeys, slipRoutes, type SlipKind } from '../document.types';
import { SlipRows } from './SavedSlip';
import { lagosDate, moneyText } from '../transaction.logic';
type PickingPrint = { branch: { name: string; address?: string | null } | null; job: { number: string; date: string; mileage: number | null; remarks: string | null; service?: { description: string } | null } | null; estimate: { number: string | null; date: string; version: number; status: string; currency: string; remarks: string | null }; vehicle: { registrationNumber: string | null; vin: string; model: string | null; trim: string | null } | null; lines: { lineId: string; partNumber: string | null; flag: string | null; description: string; uom: string | null; quantityRequired: number; rate: number; amount: number }[]; totals: { numberOfItems: number; quantityRequired: number; totalAmount: number }; printedAt: string };
export function ServiceDocumentPrint({ kind, id }: { kind: string; id: string }) {
  const { hasPermission } = useAuth();
  const slipKind = Object.hasOwn(slipRoutes, kind) ? kind as SlipKind : null;
  const picking = kind === 'job-picking' || kind === 'estimate-picking';
  const valid = !!slipKind || picking;
  const permission = picking ? 'jobcard:picking-list:print' : slipKind === 'labour-slips' ? 'jobcard:read' : 'requisition:read';
  const allowed = valid && hasPermission(permission);
  const url = slipKind ? `${slipRoutes[slipKind]}/${id}/print` : `/service/${kind === 'job-picking' ? 'job-cards' : 'estimates'}/${id}/picking-list/print`;
  const query = useServiceData<{ pickingList?: PickingPrint } & Partial<Record<'requisition' | 'returnSlip' | 'labourSlip', ServiceSlip>>>(url, allowed);
  if (!allowed) return <p role="alert">This document is unavailable or you do not have print permission.</p>;
  if (query.isLoading) return <p role="status">Loading print document?</p>;
  if (query.isError || !query.data) return <div role="alert">Could not load the print document. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>;
  const slip = slipKind ? query.data[slipKeys[slipKind] as 'requisition' | 'returnSlip' | 'labourSlip'] : undefined;
  const data = query.data.pickingList;
  return <article id="service-document-print" className="mx-auto max-w-6xl space-y-5 rounded-xl border border-border bg-card p-5 text-card-foreground">
    <style>{`@media print { body * { visibility: hidden; } #service-document-print, #service-document-print * { visibility: visible; } #service-document-print { position: absolute; inset: 0; width: 100%; max-width: none; border: 0; padding: 0; } #service-document-print .print-controls { display: none; } #service-document-print tr { break-inside: avoid; } }`}</style>
    <div className="print-controls flex flex-wrap gap-3"><Button onClick={() => window.print()}>Print</Button><Button variant="outline" asChild><Link href="/job-cards">Back to job cards</Link></Button></div>
    <h1 className="text-2xl font-semibold">{picking ? 'Picking list' : slipKind === 'labour-slips' ? 'Job card labour slip' : slipKind === 'return-slips' ? 'Item return slip' : 'Job card parts requisition'}</h1>
    {slip && <><header className="grid gap-2 text-sm sm:grid-cols-2"><p>Document: {slip.requisitionNumber ?? slip.returnNumber ?? slip.slipNumber}</p><p>Branch: {slip.branch?.name}</p><p>Date: {lagosDate(slip.createdAt)}</p>{slip.requisition && <p>Requisition: {slip.requisition.requisitionNumber}</p>}<p>Job: {slip.jobCard?.jobNumber}</p><p>Type / status: {slip.chargeType ?? 'Labour'} ? {slip.status ?? 'Saved'}</p><p>Vehicle: {slip.jobCard?.vehicle?.registrationNumber ?? slip.jobCard?.vehicle?.vin}</p><p>Mileage: {slip.jobCard?.mileage ?? '?'}</p></header><SlipRows document={slip} /></>}
    {data && <><header className="grid gap-2 text-sm sm:grid-cols-2"><p>Branch: {data.branch?.name}</p><p>Job: {data.job?.number ?? 'Standalone estimate'}</p><p>Estimate: {data.estimate.number ?? 'Legacy estimate'} ? Revision {data.estimate.version} ? {data.estimate.status}</p><p>Date: {lagosDate(data.estimate.date)}</p><p>Registration / VIN: {data.vehicle?.registrationNumber ?? '?'} / {data.vehicle?.vin ?? '?'}</p><p>Model / variant: {data.vehicle?.model ?? '?'} / {data.vehicle?.trim ?? '?'}</p><p>Mileage: {data.job?.mileage ?? '?'}</p><p>Service: {data.job?.service?.description ?? '?'}</p></header><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Part number', 'Flag', 'Description', 'UOM', 'Quantity required', 'Rate', 'Amount'].map(label => <th className="border-b border-border p-2" key={label}>{label}</th>)}</tr></thead><tbody>{data.lines.map(line => <tr key={line.lineId}><td className="p-2">{line.partNumber ?? '?'}</td><td className="p-2">{line.flag ?? '?'}</td><td className="p-2">{line.description}</td><td className="p-2">{line.uom ?? '?'}</td><td className="p-2">{line.quantityRequired}</td><td className="p-2">{moneyText(line.rate, data.estimate.currency)}</td><td className="p-2">{moneyText(line.amount, data.estimate.currency)}</td></tr>)}</tbody></table></div><p className="text-sm">Items: {data.totals.numberOfItems} ? Quantity required: {data.totals.quantityRequired} ? Total: {moneyText(data.totals.totalAmount, data.estimate.currency)}</p><div className="whitespace-pre-wrap text-sm"><p>Job remarks: {data.job?.remarks ?? '?'}</p><p>Estimate remarks: {data.estimate.remarks ?? '?'}</p></div><p className="text-xs text-muted-foreground">Printed {lagosDate(data.printedAt)} ? Africa/Lagos</p></>}
  </article>;
}
