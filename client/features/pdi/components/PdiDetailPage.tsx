"use client";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft, Car, CheckCircle2, ClipboardList, Disc3, FilePenLine, History, Package, PackageMinus, Printer, Receipt, Wrench, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCancelPdi, usePdi, usePrintPdi, useVehicleReady, useWorkDone } from "../hooks/use-pdi";
import { formatDate, formatDateTime, formatMoney, PDI_PERMISSIONS, PDI_STEPS, personName, stepIndex, chargeLabel } from "../lib/pdi.logic";
import type { PdiJob, PdiPrintKind } from "../types/pdi.types";
import { LabourForm, LabourSlipCard, chargeTotalsStrip } from "./PdiLabour";
import { RequisitionCard, RequisitionForm } from "./PdiRequisitions";
import { ReturnCard, ReturnForm } from "./PdiReturns";
import { PdiEditDialog } from "./PdiEditDialog";
import { PdiPrintSheet, type PrintSheetProps } from "./PdiPrintSheet";
import { AlertBanner, DetailField, EmptyNote, KpiCard, MoneyText, PageState, PdiStatusPill, SectionCard, Stepper, TotalsStrip, pdiInput, tdCls, thCls } from "./pdi-ui";

type Tab = "overview" | "requisitions" | "returns" | "labour" | "bill";

/** One PDI job card: summary, status stepper, actions, and its requisitions, returns, labour and bill. */
export function PdiDetailPage({ id }: { id: string }) {
  const { data: job, isLoading, error } = usePdi(id);
  if (isLoading) return <PageState loading />;
  if (error || !job) return <PageState message="PDI job card not found, or you do not have access to it." />;
  return <PdiDetail job={job} />;
}

function PdiDetail({ job }: { job: PdiJob }) {
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission(PDI_PERMISSIONS.UPDATE);
  const canBill = hasPermission(PDI_PERMISSIONS.BILL);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"workDone" | "ready" | "cancel" | null>(null);
  const [note, setNote] = useState("");
  const [printing, setPrinting] = useState<PrintSheetProps | null>(null);
  const workDone = useWorkDone(job.id);
  const ready = useVehicleReady(job.id);
  const cancel = useCancelPdi(job.id);
  const print = usePrintPdi();
  const writable = canUpdate && job.actions.canWork;
  const bill = job.invoices.find(invoice => !/cancel|void/i.test(invoice.status));

  const steps = useMemo(() => {
    const current = stepIndex(job.status);
    return PDI_STEPS.map((step, index) => {
      const entry = [...job.statusHistory].reverse().find(row => row.toStatus === step.key);
      return { key: step.key, label: step.label, completed: job.status !== "CANCELLED" && index < current + (job.status === "BILLED" || job.status === "DELIVERED" ? 1 : 0), skipped: false, at: entry?.createdAt ?? null, by: entry ? { id: "", ...entry.actor } : null };
    });
  }, [job.status, job.statusHistory]);

  const startPrint = (kind: PdiPrintKind, docId: string, sheet: PrintSheetProps) => {
    setPrinting(sheet);
    print.mutate({ kind, id: docId });
  };
  const vehicleName = [job.vehicle?.catalogue?.parent?.description ?? job.vehicle?.model, job.vehicle?.catalogue?.description ?? job.vehicle?.trim].filter(Boolean).join(" · ");
  const baseMeta: [string, ReactNode][] = [["PDI job no.", job.jobNumber], ["Job date", formatDate(job.createdAt)], ["PDI reg.", job.pdiRegistration], ["VIN", job.vehicle?.vin], ["Model / variant", vehicleName], ["Engineer", personName(job.engineer)]];

  const tabs: { key: Tab; label: string; count?: number; icon: ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <ClipboardList className="size-4" /> },
    { key: "requisitions", label: "Requisitions", count: job.requisitions.length, icon: <Package className="size-4" /> },
    { key: "returns", label: "Returns", count: job.returnSlips.length, icon: <PackageMinus className="size-4" /> },
    { key: "labour", label: "Labour", count: job.labourSlips.length, icon: <Wrench className="size-4" /> },
    { key: "bill", label: "Bill", count: job.invoices.length, icon: <Receipt className="size-4" /> },
  ];

  return (
    <>
      <div className="space-y-6 px-4 py-6 lg:px-6 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/pdi" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> PDI job cards</Link>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => startPrint("job", job.id, {
              title: "PDI job card", number: job.jobNumber, date: formatDateTime(job.createdAt), branch: job.branch.name,
              meta: [...baseMeta, ["Colour", job.vehicle?.colour?.description ?? job.vehicle?.color], ["Engine no.", job.vehicle?.engineNumber], ["Mileage", job.mileage != null ? `${job.mileage} km` : "—"], ["Service", job.serviceType ? `${job.serviceType.code} · ${job.serviceType.description}` : "—"], ["Bay", job.bay?.description], ["Promised", formatDateTime(job.promisedAt)], ["Customer", job.customerName], ["Received by", personName(job.serviceAdvisor)]],
              columns: ["Defect", "Description", "Spare", "Oil", "Labour", "Total"],
              rows: job.complaints.map(line => [line.complaintCode?.code ?? line.defectCode ?? "—", line.description, formatMoney(line.spare), formatMoney(line.oil), formatMoney(line.labour), formatMoney(Number(line.spare) + Number(line.oil) + Number(line.labour))]),
              totals: [["Spare", formatMoney(job.defectTotals.spare)], ["Oil", formatMoney(job.defectTotals.oil)], ["Labour", formatMoney(job.defectTotals.labour)], ["Estimated total", formatMoney(job.defectTotals.total)]],
              footnote: job.tyres?.some(tyre => tyre.make || tyre.number) ? `Tyres: ${job.tyres.filter(tyre => tyre.make || tyre.number).map(tyre => `${tyre.make} ${tyre.number}`.trim()).join("; ")}. Battery: ${[job.batteryMake, job.batteryNumber].filter(Boolean).join(" ") || "—"}` : undefined,
              signatures: ["Received by", "Engineer", "Customer"],
            })}><Printer className="size-4" /> Print job card</Button>
            {writable && job.actions.canEdit && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit</Button>}
            {writable && job.actions.canMarkWorkDone && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setNote(job.workDone ?? ""); setConfirm("workDone"); }}><Wrench className="size-4" /> Work done</Button>}
            {writable && job.actions.canMarkReady && <Button size="sm" className="gap-1.5" onClick={() => { setNote(""); setConfirm("ready"); }}><CheckCircle2 className="size-4" /> Vehicle ready</Button>}
            {canBill && job.actions.canBill && <Button size="sm" className="gap-1.5" asChild><Link href={`/pdi/${job.id}/bill`}><Receipt className="size-4" /> Bill PDI</Link></Button>}
            {bill && <Button size="sm" variant="outline" className="gap-1.5" asChild><Link href={`/pdi/bills/${bill.id}`}><Receipt className="size-4" /> View bill</Link></Button>}
          </div>
        </div>

        <section className="rounded-xl border border-border bg-card p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">PDI job card · {job.branch.name}</p>
              <h1 className="font-mono text-2xl font-semibold text-foreground">{job.jobNumber}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{vehicleName || "Vehicle"} · <span className="font-mono">{job.vehicle?.vin}</span></p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <PdiStatusPill status={job.status} />
              <span className="rounded-md border border-border px-2 py-1 font-mono text-sm">PDI reg. {job.pdiRegistration ?? "—"}</span>
            </div>
          </div>
          {job.status === "CANCELLED" ? (
            <AlertBanner tone="red" icon={<XCircle />} title="This PDI job card is cancelled">{job.statusHistory.at(-1)?.remarks}</AlertBanner>
          ) : <Stepper steps={steps} />}
        </section>

        {job.status === "READY" && !bill && (
          <AlertBanner tone="emerald" icon={<CheckCircle2 />} title="Vehicle ready for billing" action={canBill ? <Button size="sm" asChild><Link href={`/pdi/${job.id}/bill`}>Bill now</Link></Button> : undefined}>
            Work done and inspection passed {formatDateTime(job.readyAt)}. The billing officer can now create the PDI bill.
          </AlertBanner>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Defect estimate" icon={<ClipboardList />} value={formatMoney(job.defectTotals.total)} sub={`${job.complaints.length} defect line(s)`} />
          <KpiCard label="Parts issued" icon={<Package />} value={formatMoney(job.summary.partsIssuedAmount)} sub={`${job.summary.requisitions} requisition(s) · returns ${formatMoney(job.summary.returnsAmount)}`} />
          <KpiCard label="Labour" icon={<Wrench />} value={formatMoney(job.summary.labour.total)} sub={`W ${formatMoney(job.summary.labour.warranty)} · FOC ${formatMoney(job.summary.labour.foc)} · Paid ${formatMoney(job.summary.labour.nonWarranty)}`} />
          <KpiCard label="Vehicle PDI" icon={<Car />} dot={job.vehicle?.pdiDone ? "emerald" : "amber"} value={job.vehicle?.pdiDone ? "Done" : "Pending"} sub={job.vehicle?.pdiDone ? formatDate(job.vehicle.pdiDate) : "Set when the PDI is billed"} />
        </div>

        <div role="tablist" aria-label="PDI documents" className="flex flex-wrap gap-1 border-b border-border">
          {tabs.map(item => (
            <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)}
              className={cn("-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors", tab === item.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {item.icon}{item.label}{item.count ? <span className="rounded-full bg-muted px-1.5 text-xs">{item.count}</span> : null}
            </button>
          ))}
        </div>

        {tab === "overview" && <Overview job={job} />}

        {tab === "requisitions" && (
          <div className="space-y-4">
            {writable ? <SectionCard icon={<Package />} title="New PDI requisition (IPO)" note="Issues parts to this PDI; stock is deducted"><RequisitionForm job={job} /></SectionCard>
              : <ReadOnlyNote job={job} what="Requisitions" />}
            {job.requisitions.length ? job.requisitions.map(doc => (
              <RequisitionCard key={doc.id} doc={doc} canChange={writable} onPrint={() => startPrint("requisition", doc.id, {
                title: `PDI requisition · ${chargeLabel(doc.chargeType)}`, number: doc.requisitionNumber, date: formatDateTime(doc.requisitionDate), branch: job.branch.name,
                meta: [...baseMeta, ["Picking list no.", doc.pickingListNumber], ["Mileage", doc.mileage != null ? `${doc.mileage} km` : "—"]],
                columns: ["Part no.", "Description", "Qty req.", "Qty iss.", "Rate", "Amount", "Approv. amt", "Cust. amt"],
                rows: doc.lines.map(line => [line.partNumber ?? line.sparePart?.partNumber, line.description, line.quantityRequired, line.quantityIssued, formatMoney(line.rate), formatMoney(line.amount), formatMoney(line.approvedAmount), formatMoney(line.customerAmount)]),
                totals: [["Number of items", doc.totals.numberOfItems], ["Net quantity issued", doc.totals.netQuantityIssued], ["Total amount", formatMoney(doc.totals.totalAmount)], ["Approved amount", formatMoney(doc.totals.approvedAmount)]],
                signatures: ["Issued by", "Received by", "Engineer"],
              })} />
            )) : <EmptyNote>No requisitions yet.</EmptyNote>}
          </div>
        )}

        {tab === "returns" && (
          <div className="space-y-4">
            {writable ? <SectionCard icon={<PackageMinus />} title="New PDI requisition return" note="Puts stock back"><ReturnForm job={job} /></SectionCard>
              : <ReadOnlyNote job={job} what="Returns" />}
            {job.returnSlips.length ? job.returnSlips.map(doc => (
              <ReturnCard key={doc.id} doc={doc} canChange={writable} onPrint={() => startPrint("return", doc.id, {
                title: "PDI requisition return", number: doc.returnNumber, date: formatDateTime(doc.returnDate), branch: job.branch.name,
                meta: [...baseMeta, ["Requisition no.", doc.requisition.requisitionNumber]],
                columns: ["Part no.", "Description", "Qty returned", "Rate", "Amount"],
                rows: (doc.lines ?? []).map(line => [line.partIssuance.sparePart.partNumber, line.partIssuance.sparePart.name, line.quantity, formatMoney(line.rate), formatMoney(line.amount)]),
                totals: [["Number of items", doc.totals.numberOfItems], ["Net quantity returned", doc.totals.netQuantityReturned], ["Total amount", formatMoney(doc.totals.totalAmount)]],
                signatures: ["Returned by", "Received by (store)", "Engineer"],
              })} />
            )) : <EmptyNote>No returns yet.</EmptyNote>}
          </div>
        )}

        {tab === "labour" && (
          <div className="space-y-4">
            {writable ? <SectionCard icon={<Wrench />} title="New PDI labour slip" note="W = warranty, T = free of cost, Q = paid"><LabourForm job={job} /></SectionCard>
              : <ReadOnlyNote job={job} what="Labour" />}
            {job.labourSlips.length ? job.labourSlips.map(slip => (
              <LabourSlipCard key={slip.id} slip={slip} onPrint={() => startPrint("labour", slip.id, {
                title: "PDI labour details", number: slip.slipNumber, date: formatDateTime(slip.slipDate), branch: job.branch.name,
                meta: [...baseMeta, ["Group", slip.group?.description], ["Mileage", slip.mileage != null ? `${slip.mileage} km` : "—"]],
                columns: ["W/T/Q", "Lab code", "Description", "Std hrs", "Chrg hrs", "Amount", "Technician"],
                rows: (slip.lines ?? []).map(line => [chargeLabel(line.chargeLine?.chargeType ?? "CUSTOMER"), line.labourItem.code, line.description, line.standardHours ?? "—", line.hours, formatMoney(line.amount), personName(line.technician)]),
                totals: [["Warranty", formatMoney(slip.totals.warranty)], ["Non-warranty", formatMoney(slip.totals.nonWarranty)], ["FOC", formatMoney(slip.totals.foc)], ["Total", formatMoney(slip.totals.total)]],
                signatures: ["Technician", "Engineer", "Workshop manager"],
              })} />
            )) : <EmptyNote>No labour slips yet.</EmptyNote>}
            {job.labourSlips.length > 0 && <TotalsStrip items={chargeTotalsStrip(job.summary.labour)} />}
          </div>
        )}

        {tab === "bill" && (
          <SectionCard icon={<Receipt />} title="PDI bill">
            {job.invoices.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>{["Bill no.", "Type", "Date", "Amount", "Voucher no.", "Status", ""].map(label => <th key={label} className={thCls}>{label}</th>)}</tr></thead>
                  <tbody>
                    {job.invoices.map(invoice => (
                      <tr key={invoice.id} className="border-t border-border">
                        <td className={cn(tdCls, "font-mono")}>{invoice.invoiceNumber}</td>
                        <td className={tdCls}>{invoice.printTitle}</td>
                        <td className={tdCls}>{formatDate(invoice.issuedDate)}</td>
                        <td className={tdCls}><MoneyText value={invoice.total} /></td>
                        <td className={tdCls}>{invoice.tallyVoucherNo ?? "—"}</td>
                        <td className={tdCls}>{invoice.status}</td>
                        <td className={tdCls}><Link className="text-primary hover:underline" href={`/pdi/bills/${invoice.id}`}>Open</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : job.actions.canBill ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">The vehicle is ready. Create the PDI bill: zero, cash memo or invoice.</p>
                {canBill && <Button asChild><Link href={`/pdi/${job.id}/bill`}>Bill PDI</Link></Button>}
              </div>
            ) : <EmptyNote>The PDI can be billed once the vehicle is marked ready.</EmptyNote>}
          </SectionCard>
        )}

        {writable && job.actions.canCancel && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={() => { setNote(""); setConfirm("cancel"); }}><XCircle className="size-4" /> Cancel PDI job card</Button>
          </div>
        )}
      </div>

      {printing && <div className="hidden print:block"><PdiPrintSheet {...printing} /></div>}
      {editing && <PdiEditDialog job={job} onClose={() => setEditing(false)} />}

      <ModalFame
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === "workDone" ? "Record work done" : confirm === "ready" ? "Mark vehicle ready" : "Cancel PDI job card"}
        description={confirm === "workDone" ? "The PDI moves to work done (QC)." : confirm === "ready" ? "The PDI is the inspection: QC is recorded as passed and the job is ready for billing." : "Only possible with no issued parts or labour left on the job."}
      >
        <form className="space-y-4" onSubmit={event => {
          event.preventDefault();
          const done = { onSuccess: () => setConfirm(null) };
          if (confirm === "workDone") workDone.mutate(note.trim() || undefined, done);
          else if (confirm === "ready") ready.mutate(note.trim() || undefined, done);
          else if (note.trim()) cancel.mutate(note.trim(), done);
        }}>
          <label className="grid gap-1.5 text-sm font-semibold">
            {confirm === "workDone" ? "Work done" : confirm === "ready" ? "Remarks (optional)" : "Reason"}
            <textarea className={`${pdiInput} h-24 py-2`} required={confirm === "cancel"} maxLength={confirm === "workDone" ? 5000 : 2000} value={note} onChange={event => setNote(event.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>Back</Button>
            <Button variant={confirm === "cancel" ? "destructive" : "default"} disabled={workDone.isPending || ready.isPending || cancel.isPending || (confirm === "cancel" && !note.trim())}>
              {confirm === "workDone" ? "Record work done" : confirm === "ready" ? "Vehicle ready" : "Cancel PDI"}
            </Button>
          </div>
        </form>
      </ModalFame>
    </>
  );
}

function ReadOnlyNote({ job, what }: { job: PdiJob; what: string }) {
  return <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">{what} are read-only {job.actions.canWork ? "for your role (needs pdi:update)" : "after billing, delivery or cancellation"}.</p>;
}

function Overview({ job }: { job: PdiJob }) {
  const tyres = (job.tyres ?? []).filter(tyre => tyre.make || tyre.number);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <SectionCard icon={<ClipboardList />} title="Defects detected" note={`${job.complaints.length} line(s)`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr>{["Defect", "Description", "Spare", "Oil", "Labour", "Total"].map(label => <th key={label} className={thCls}>{label}</th>)}</tr></thead>
              <tbody>
                {job.complaints.map(line => (
                  <tr key={line.id} className="border-t border-border">
                    <td className={tdCls}><span className="font-mono">{line.complaintCode?.code ?? line.defectCode ?? "—"}</span>{line.complaintCode?.parent && <p className="text-xs text-muted-foreground">{line.complaintCode.parent.description}</p>}</td>
                    <td className={tdCls}>{line.description}</td>
                    <td className={tdCls}><MoneyText value={line.spare} /></td>
                    <td className={tdCls}><MoneyText value={line.oil} /></td>
                    <td className={tdCls}><MoneyText value={line.labour} /></td>
                    <td className={cn(tdCls, "font-semibold")}><MoneyText value={Number(line.spare) + Number(line.oil) + Number(line.labour)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TotalsStrip className="mt-3" items={[
            { label: "Spare", value: <MoneyText value={job.defectTotals.spare} /> },
            { label: "Oil", value: <MoneyText value={job.defectTotals.oil} /> },
            { label: "Labour", value: <MoneyText value={job.defectTotals.labour} /> },
            { label: "Total", value: <MoneyText value={job.defectTotals.total} />, strong: true },
          ]} />
        </SectionCard>
        <SectionCard icon={<Disc3 />} title="Tyres and battery">
          {tyres.length || job.batteryMake ? (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(job.tyres ?? []).map((tyre, index) => (tyre.make || tyre.number) && <DetailField key={index} label={["Front left", "Front right", "Rear left", "Rear right", "Spare"][index] ?? `Tyre ${index + 1}`} value={`${tyre.make || "—"} · ${tyre.number || "no number"}`} />)}
              <DetailField label="Battery" value={[job.batteryMake, job.batteryNumber].filter(Boolean).join(" · ") || null} />
            </dl>
          ) : <EmptyNote>No tyre or battery details recorded.</EmptyNote>}
        </SectionCard>
      </div>
      <div className="space-y-6">
        <SectionCard icon={<Car />} title="Vehicle and job">
          <dl className="grid grid-cols-2 gap-4">
            <DetailField label="VIN" mono value={job.vehicle?.vin} />
            <DetailField label="Registration" value={job.vehicle?.registrationNumber ?? "Not registered"} />
            <DetailField label="Colour" value={job.vehicle?.colour?.description ?? job.vehicle?.color} />
            <DetailField label="Engine no." mono value={job.vehicle?.engineNumber} />
            <DetailField label="Mileage" value={job.mileage != null ? `${job.mileage.toLocaleString()} km` : null} />
            <DetailField label="Service" value={job.serviceType ? `${job.serviceType.code} · ${job.serviceType.description}` : null} />
            <DetailField label="Bay" value={job.bay?.description} />
            <DetailField label="Group" value={job.team?.description} />
            <DetailField label="Engineer" value={personName(job.engineer)} />
            <DetailField label="Received by" value={personName(job.serviceAdvisor)} />
            <DetailField label="Customer" value={job.customerName} />
            <DetailField label="Promised" value={formatDateTime(job.promisedAt)} />
            {job.workDone && <DetailField label="Work done" value={job.workDone} className="col-span-2" />}
            {job.remarks && <DetailField label="Remarks" value={job.remarks} className="col-span-2" />}
          </dl>
        </SectionCard>
        <SectionCard icon={<History />} title="Status history">
          <ol className="space-y-3">
            {[...job.statusHistory].reverse().map(row => (
              <li key={row.id} className="border-l-2 border-border pl-3 text-sm">
                <p className="font-medium text-foreground">{row.fromStatus ? `${row.fromStatus} → ` : ""}{row.toStatus}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)} · {row.actor.firstName} {row.actor.lastName}</p>
                {row.remarks && <p className="text-xs text-muted-foreground">{row.remarks}</p>}
              </li>
            ))}
          </ol>
        </SectionCard>
      </div>
    </div>
  );
}
