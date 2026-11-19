"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import { cn } from "@/lib/utils";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { useCreatePdiBill, usePdi, usePdiBillPreview, usePdiSettings } from "../hooks/use-pdi";
import { apiError, BILL_TYPES, formatDate, formatMoney, personName } from "../lib/pdi.logic";
import type { PdiBillType } from "../types/pdi.types";
import { AlertBanner, ChargePill, DetailField, MoneyText, PageState, PdiField, SectionCard, Segmented, pdiInput, pdiNumberInput, tdCls, thCls } from "./pdi-ui";

/** Debounced value, so typing a discount does not fire a preview per keystroke. */
function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const percent = (raw: string) => {
  const value = Number(raw || 0);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 100) / 100 : NaN;
};

/** PDI job card bill: lines come from the job only; the server calculates every amount. */
export function PdiBillPage({ jobId }: { jobId: string }) {
  const router = useRouter();
  const job = usePdi(jobId);
  const settings = usePdiSettings();
  const create = useCreatePdiBill();
  const [billType, setBillType] = useState<PdiBillType | null>(null);
  const [form, setForm] = useState({ parts: "0", labour: "0", deliveryAdvisorId: "", creditCompany: "", cardNumber: "", remarks: "" });
  const set = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));
  const parts = percent(useDebounced(form.parts));
  const labour = percent(useDebounced(form.labour));
  const discountsValid = !Number.isNaN(parts) && !Number.isNaN(labour);
  const preview = usePdiBillPreview(jobId, discountsValid ? parts : 0, discountsValid ? labour : 0, !!job.data?.actions.canBill);
  const data = preview.data;
  const chosen = billType ?? data?.suggestedBillType ?? "ZERO";
  const chargeable = data?.split.chargeableTotal ?? 0;

  useEffect(() => {
    const advisorId = job.data?.serviceAdvisor?.id;
    if (advisorId) setForm(current => current.deliveryAdvisorId ? current : { ...current, deliveryAdvisorId: advisorId });
  }, [job.data?.serviceAdvisor?.id]);

  if (job.isLoading) return <PageState loading />;
  if (!job.data) return <PageState message="PDI job card not found." />;
  const pdi = job.data;
  if (!pdi.actions.canBill) {
    return (
      <div className="space-y-4 px-4 py-6 lg:px-6">
        <Link href={`/pdi/${pdi.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {pdi.jobNumber}</Link>
        <AlertBanner tone="amber" icon={<AlertTriangle />} title="This PDI cannot be billed now">Only a PDI marked vehicle ready, with no active bill, can be billed. Current status: {pdi.status}.</AlertBanner>
      </div>
    );
  }

  const typeError = chosen === "ZERO" && chargeable !== 0 ? "Zero bill is only allowed when nothing is chargeable" : chosen !== "ZERO" && chargeable === 0 ? "Nothing is chargeable; use a zero bill" : chosen === "INVOICE" && !form.creditCompany.trim() ? "Enter the credit company" : undefined;
  const canSubmit = !!data && discountsValid && !typeError && !!form.deliveryAdvisorId && !create.isPending && !preview.isFetching;
  const title = chosen === "INVOICE" ? settings.data?.invoiceTitle ?? "PDI INVOICE" : settings.data?.cashMemoTitle ?? "PDI CASH MEMO";

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <Link href={`/pdi/${pdi.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {pdi.jobNumber}</Link>
      <PageHeader title="PDI job card bill" description={`${pdi.jobNumber} · PDI reg. ${pdi.pdiRegistration ?? "—"} · ${pdi.vehicle?.vin ?? ""}`} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard icon={<Receipt />} title="Bill type" note={`Prints as ${title}`}>
            <Segmented<PdiBillType>
              label="Bill type"
              value={chosen}
              onChange={setBillType}
              options={BILL_TYPES.map(type => ({ value: type.value, label: type.label, hint: type.hint, disabled: !!data && (type.value === "ZERO" ? chargeable !== 0 : chargeable === 0) }))}
            />
            {typeError && data && <p className="mt-2 text-xs text-destructive">{typeError}</p>}
            {chosen === "INVOICE" && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <PdiField label="Credit company" required><input className={pdiInput} maxLength={200} value={form.creditCompany} onChange={event => set({ creditCompany: event.target.value })} /></PdiField>
                <PdiField label="Card no."><input className={pdiInput} maxLength={50} value={form.cardNumber} onChange={event => set({ cardNumber: event.target.value })} /></PdiField>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Customer and job">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DetailField label="Name" value={pdi.customerName} />
              <DetailField label="Address" value={pdi.customer?.address} />
              <DetailField label="Job date" value={formatDate(pdi.createdAt)} />
              <DetailField label="Model / variant" value={[pdi.vehicle?.catalogue?.parent?.description ?? pdi.vehicle?.model, pdi.vehicle?.catalogue?.description].filter(Boolean).join(" · ")} />
              <DetailField label="Engineer" value={personName(pdi.engineer)} />
              <DetailField label="Bay" value={pdi.bay?.description} />
              <DetailField label="PDI reg." mono value={pdi.pdiRegistration} />
              <DetailField label="VIN" mono value={pdi.vehicle?.vin} />
            </dl>
            <div className="mt-5 grid gap-4 border-t border-border pt-5 md:grid-cols-2">
              <WorkshopPicker label="Delivery service adviser" required endpoint={`/service/staff?role=ServiceAdviser&branchId=${pdi.branchId}`} collection="users" value={form.deliveryAdvisorId} onChange={deliveryAdvisorId => set({ deliveryAdvisorId })} />
              <PdiField label="Remarks"><input className={pdiInput} maxLength={2000} value={form.remarks} onChange={event => set({ remarks: event.target.value })} /></PdiField>
            </div>
          </SectionCard>

          <SectionCard title="Bill lines" note="From the PDI requisitions (net of returns), labour and service charge. Amounts cannot be edited.">
            {preview.isError ? <p role="alert" className="text-sm text-destructive">{apiError(preview.error, "Could not load the bill lines")}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>{["Type", "Ref.", "Code", "Description", "Qty", "Rate", "Amount", "Charge"].map(label => <th key={label} className={thCls}>{label}</th>)}</tr></thead>
                  <tbody>
                    {(data?.lines ?? []).map((line, index) => (
                      <tr key={index} className={cn("border-t border-border", !line.chargeable && "text-muted-foreground")}>
                        <td className={tdCls}>{line.type === "PART" ? "Part" : line.type === "LABOUR" ? "Labour" : "Service"}</td>
                        <td className={cn(tdCls, "font-mono text-xs")}>{line.reference ?? "—"}</td>
                        <td className={cn(tdCls, "font-mono")}>{line.partNumber ?? "—"}</td>
                        <td className={tdCls}>{line.description}</td>
                        <td className={cn(tdCls, "tabular-nums")}>{line.quantity}</td>
                        <td className={tdCls}><MoneyText value={line.rate} /></td>
                        <td className={tdCls}><MoneyText value={line.amount} /></td>
                        <td className={tdCls}>{line.chargeable ? <ChargePill type="CUSTOMER" /> : <span className="inline-flex items-center gap-1.5"><ChargePill type={line.chargeType} /><span className="text-xs">no charge</span></span>}</td>
                      </tr>
                    ))}
                    {!preview.isLoading && !data?.lines.length && <tr><td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">No parts, labour or service charge on this PDI.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
            <div className="grid grid-cols-2 gap-3">
              <PdiField label="Spares disc. %" error={Number.isNaN(percent(form.parts)) ? "0 – 100" : undefined}><input className={pdiNumberInput} inputMode="decimal" value={form.parts} onChange={event => set({ parts: event.target.value })} /></PdiField>
              <PdiField label="Lab./serv. disc. %" error={Number.isNaN(percent(form.labour)) ? "0 – 100" : undefined}><input className={pdiNumberInput} inputMode="decimal" value={form.labour} onChange={event => set({ labour: event.target.value })} /></PdiField>
            </div>
            <dl className={cn("space-y-1.5 text-sm transition-opacity", preview.isFetching && "opacity-60")} aria-busy={preview.isFetching}>
              {data && <>
                <Line label="Spares (chargeable)" value={data.totals.partsTotal} />
                <Line label="Spares discount" value={-data.totals.partsDiscountAmount} />
                <Line label="Labour (chargeable)" value={data.totals.labourTotal} />
                <Line label="Labour discount" value={-data.totals.labourDiscountAmount} />
                <Line label="Service charges" value={data.totals.serviceTotal} />
                <Line label={`VAT on labour (${data.totals.vatRate}%)`} value={data.totals.vatAmount} />
                <Line label="Round off" value={data.totals.roundOff} />
                <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold"><dt>Net bill amount</dt><dd className="tabular-nums">{formatMoney(data.totals.total)}</dd></div>
                <p className="pt-1 text-xs text-muted-foreground">Not charged (warranty, FOC, goodwill share, company-paid): {formatMoney(data.split.nonChargeableTotal)}</p>
              </>}
              {preview.isLoading && <p role="status" className="text-muted-foreground">Calculating…</p>}
            </dl>
            <Button className="w-full" disabled={!canSubmit} onClick={() => create.mutate({
              jobCardId: pdi.id, billType: chosen, deliveryAdvisorId: form.deliveryAdvisorId, partsDiscountPercent: parts, labourDiscountPercent: labour,
              creditCompany: chosen === "INVOICE" ? form.creditCompany.trim() : undefined, cardNumber: chosen === "INVOICE" ? form.cardNumber.trim() || undefined : undefined, remarks: form.remarks.trim() || undefined,
            }, { onSuccess: bill => router.push(`/pdi/bills/${bill.id}`) })}>
              {create.isPending ? "Creating…" : `Create ${BILL_TYPES.find(type => type.value === chosen)?.label.toLowerCase()}`}
            </Button>
            <p className="text-xs text-muted-foreground">Billing marks the vehicle as PDI done with today&apos;s date.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{formatMoney(value)}</dd></div>;
}
