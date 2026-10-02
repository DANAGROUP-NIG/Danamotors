"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useBranchStore } from "@/store/branch.store";
import {
  getBillableJobCardsRequest,
  getServiceAdvisorsRequest,
  previewJobBillRequest,
} from "../api/invoice.api";
import { invoiceKeys } from "../api/invoice.keys";
import { useCreateInvoice } from "../hooks/use-create-invoice";

const currency = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

interface InvoiceCreateFormProps {
  onSuccess?: () => void;
}

export function InvoiceCreateForm({ onSuccess }: InvoiceCreateFormProps) {
  const searchParams = useSearchParams();
  const branchId = useBranchStore((state) => state.activeBranch?.id);
  const create = useCreateInvoice();
  const [jobCardId, setJobCardId] = useState(searchParams.get("jobCardId") ?? "");
  const [partsDiscountPercent, setPartsDiscountPercent] = useState(0);
  const [labourDiscountPercent, setLabourDiscountPercent] = useState(0);
  const [serviceAdvisorId, setServiceAdvisorId] = useState("");
  const [notes, setNotes] = useState("");

  const jobCards = useQuery({
    queryKey: [...invoiceKeys.billableJobCards(), branchId],
    queryFn: getBillableJobCardsRequest,
  });
  const advisors = useQuery({
    queryKey: ["finance", "service-advisors", branchId],
    queryFn: getServiceAdvisorsRequest,
  });
  const preview = useQuery({
    queryKey: invoiceKeys.jobBillPreview(jobCardId, partsDiscountPercent, labourDiscountPercent),
    queryFn: () => previewJobBillRequest({ jobCardId, partsDiscountPercent, labourDiscountPercent }),
    enabled: Boolean(jobCardId),
  });

  const bill = preview.data?.preview;
  const hasParts = Boolean(bill?.totals.partsTotal);
  const effectiveAdvisorId = serviceAdvisorId || bill?.jobCard.serviceAdvisorId || "";

  function selectJobCard(id: string) {
    setJobCardId(id);
    setServiceAdvisorId("");
    setPartsDiscountPercent(0);
    setLabourDiscountPercent(0);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!jobCardId || !effectiveAdvisorId || !bill) return;
    create.mutate({
      jobCardId,
      partsDiscountPercent,
      labourDiscountPercent,
      serviceAdvisorId: effectiveAdvisorId,
      notes: notes.trim() || undefined,
    }, { onSuccess });
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <Field label="Completed job card">
        <select className={inputCls} value={jobCardId} onChange={(event) => selectJobCard(event.target.value)} required>
          <option value="">Select a job card</option>
          {jobCards.data?.jobCards.map((jobCard) => (
            <option key={jobCard.id} value={jobCard.id}>
              {jobCard.jobNumber} - {jobCard.customer ? `${jobCard.customer.firstName} ${jobCard.customer.lastName}` : "Customer missing"}
            </option>
          ))}
        </select>
        {jobCards.isLoading && <span className="text-sm text-muted-foreground">Loading billable job cards...</span>}
        {jobCards.isError && <span className="text-sm text-destructive">Could not load billable job cards.</span>}
        {!jobCards.isLoading && !jobCards.isError && jobCards.data?.jobCards.length === 0 && (
          <span className="text-sm text-muted-foreground">No completed job cards are ready to bill.</span>
        )}
      </Field>

      {bill && (
        <section className="grid gap-4 border-y py-4" aria-label="Job bill details">
          <div>
            <p className="font-semibold">{bill.jobCard.jobNumber}</p>
            <p className="text-sm text-muted-foreground">
              {bill.jobCard.customer ? `${bill.jobCard.customer.firstName} ${bill.jobCard.customer.lastName}` : "Customer"}
              {bill.jobCard.vehicle?.registrationNumber ? ` - ${bill.jobCard.vehicle.registrationNumber}` : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr><th className="py-2 font-medium">Type</th><th className="py-2 font-medium">Description</th><th className="py-2 text-right font-medium">Qty / hours</th><th className="py-2 text-right font-medium">Rate</th><th className="py-2 text-right font-medium">Amount</th></tr>
              </thead>
              <tbody>
                {bill.lines.map((line, index) => (
                  <tr key={`${line.type}-${index}`} className="border-b last:border-0">
                    <td className="py-2">{line.type === "PART" ? "Part" : "Labour"}</td>
                    <td className="py-2">{line.description}</td>
                    <td className="py-2 text-right">{line.quantity}</td>
                    <td className="py-2 text-right">{currency.format(line.rate)}</td>
                    <td className="py-2 text-right">{currency.format(line.amount)}</td>
                  </tr>
                ))}
                {bill.lines.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No parts or labour have been recorded.</td></tr>}
              </tbody>
            </table>
          </div>

          <dl className="ml-auto grid w-full max-w-sm grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt>Parts</dt><dd className="text-right">{currency.format(bill.totals.partsTotal)}</dd>
            <dt>Parts discount</dt><dd className="text-right">-{currency.format(bill.totals.partsDiscountAmount)}</dd>
            <dt>Labour</dt><dd className="text-right">{currency.format(bill.totals.labourTotal)}</dd>
            <dt>Labour discount</dt><dd className="text-right">-{currency.format(bill.totals.labourDiscountAmount)}</dd>
            <dt>VAT ({bill.totals.vatRate}%)</dt><dd className="text-right">{currency.format(bill.totals.vatAmount)}</dd>
            <dt>Round-off</dt><dd className="text-right">{currency.format(bill.totals.roundOff)}</dd>
            <dt className="border-t pt-2 font-semibold">Total</dt><dd className="border-t pt-2 text-right font-semibold">{currency.format(bill.totals.total)}</dd>
          </dl>
        </section>
      )}

      {jobCardId && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Parts discount (%)">
            <input type="number" min="0" max="100" step="0.01" className={inputCls} disabled={Boolean(bill && !hasParts)} value={partsDiscountPercent} onChange={(event) => setPartsDiscountPercent(Number(event.target.value))} />
          </Field>
          <Field label="Labour discount (%)">
            <input type="number" min="0" max="100" step="0.01" className={inputCls} value={labourDiscountPercent} onChange={(event) => setLabourDiscountPercent(Number(event.target.value))} />
          </Field>
          <Field label="Service advisor">
            <select className={inputCls} value={effectiveAdvisorId} onChange={(event) => setServiceAdvisorId(event.target.value)} required>
              <option value="">Select advisor</option>
              {advisors.data?.advisors.map((advisor) => (
                <option key={advisor.id} value={advisor.id}>{advisor.firstName} {advisor.lastName}</option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {jobCardId && preview.isFetching && <p className="text-sm text-muted-foreground">Recalculating from job-card lines...</p>}
      {jobCardId && preview.isError && <p role="alert" className="text-sm text-destructive">The bill preview could not be calculated. Check the job-card lines and discount values.</p>}
      <Field label="Notes (optional)">
        <textarea className={inputCls} rows={3} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <Button type="submit" disabled={!bill || preview.isFetching || create.isPending || !effectiveAdvisorId}>
        {create.isPending ? "Creating bill..." : "Create job bill"}
      </Button>
    </form>
  );
}
