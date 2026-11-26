"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import { cn } from "@/lib/utils";
import { useRecordReimbursement, useTransitionWarrantyCase, useUpdateWarrantyCase, useWarrantyCodes } from "../hooks/use-warranty";
import { parseAmount } from "../lib/decision.logic";
import { fmtNaira, toDateInput, todayInLagos } from "../lib/warranty-format";
import type { WarrantyCase } from "../types/warranty.types";

export type SimpleAction = "START_REVIEW" | "SUBMIT" | "RETURN" | "RESUME" | "SETTLE" | "CLOSE";

const ACTION_COPY: Record<SimpleAction, { title: string; button: string; pending: string; remarks: string; required?: boolean }> = {
  START_REVIEW: { title: "Start review", button: "Start review", pending: "Starting review", remarks: "Remarks (optional)" },
  SUBMIT: { title: "Submit claim to Kia", button: "Submit claim", pending: "Submitting claim", remarks: "Remarks (optional)" },
  RETURN: { title: "Return for correction", button: "Return for correction", pending: "Returning", remarks: "What did the manufacturer ask to be corrected?", required: true },
  RESUME: { title: "Resume review", button: "Resume review", pending: "Resuming review", remarks: "Remarks (optional)" },
  SETTLE: { title: "Record settlement", button: "Save settlement", pending: "Saving settlement", remarks: "Remarks (optional)" },
  CLOSE: { title: "Close case", button: "Close case", pending: "Closing case", remarks: "Remarks (optional)" },
};

const amountText = (value: number | null) => (value == null ? "" : value.toFixed(2));

/** Workflow actions that need at most a few fields. The server validates every transition. */
export function CaseActionDialog({ warrantyCase, action, onClose }: { warrantyCase: WarrantyCase; action: SimpleAction; onClose: () => void }) {
  const transition = useTransitionWarrantyCase(warrantyCase.id);
  const withdrawing = action === "CLOSE" && !["SETTLED", "REJECTED"].includes(warrantyCase.status);
  const copy = withdrawing
    ? { ...ACTION_COPY.CLOSE, title: "Withdraw case", button: "Withdraw case", pending: "Withdrawing case", remarks: "Reason for withdrawing", required: true }
    : ACTION_COPY[action];
  const [attempted, setAttempted] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [claimNo, setClaimNo] = useState(warrantyCase.manufacturerClaimNo ?? "");
  const [claimDate, setClaimDate] = useState(toDateInput(warrantyCase.manufacturerClaimDate) || todayInLagos());
  const [settledAmount, setSettledAmount] = useState(amountText(warrantyCase.approvedAmount));
  const [settledAt, setSettledAt] = useState(todayInLagos());
  const [received, setReceived] = useState(false);
  const [settlementRef, setSettlementRef] = useState("");
  const [reimbursedAmount, setReimbursedAmount] = useState(amountText(warrantyCase.approvedAmount));
  const [reimbursedAt, setReimbursedAt] = useState(todayInLagos());

  const settling = action === "SETTLE";
  const errors = {
    remarks: copy.required && !remarks.trim() ? (withdrawing ? "Say why the case is being withdrawn" : "Describe what the manufacturer asked to be corrected") : undefined,
    settledAmount: settling && parseAmount(settledAmount) == null ? "Enter the settled amount in naira, for example 186800.00" : undefined,
    settledAt: settling && !settledAt ? "Enter the settlement date as dd/mm/yyyy" : undefined,
    settlementRef: settling && received && !settlementRef.trim() ? "Enter the credit note or payment reference" : undefined,
    reimbursedAmount: settling && received && parseAmount(reimbursedAmount) == null ? "Enter the amount received in naira" : undefined,
    reimbursedAt: settling && received && !reimbursedAt ? "Enter the date the reimbursement was received" : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);
  const show = (e: string | undefined) => (attempted ? e : undefined);

  function confirm() {
    setAttempted(true);
    if (!valid || transition.isPending) return;
    transition.mutate(
      {
        action,
        remarks: remarks.trim() || null,
        ...(action === "SUBMIT" && { manufacturerClaimNo: claimNo.trim() || null, manufacturerClaimDate: claimNo.trim() ? claimDate : null }),
        ...(settling && {
          settledAmount: parseAmount(settledAmount),
          settledAt,
          reimbursementReceived: received,
          ...(received && { settlementRef: settlementRef.trim(), reimbursedAmount: parseAmount(reimbursedAmount), reimbursedAt }),
        }),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalFame isOpen onClose={onClose} title={copy.title} preventAccidentalClose={settling || action === "SUBMIT" || Boolean(copy.required)}>
      <div className="grid gap-4">
        {action === "SUBMIT" && (
          <>
            <p className="text-sm text-slate-600">
              Submit the claim on the Kia portal, then record the claim number it gave you. Lines are locked after submission.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kia claim no. (optional)">
                <input className={cn(inputCls, "font-mono")} value={claimNo} onChange={(e) => setClaimNo(e.target.value)} maxLength={40} />
              </Field>
              <Field label="Claim date">
                <DateInput value={claimDate} onChange={setClaimDate} max={todayInLagos()} />
              </Field>
            </div>
          </>
        )}
        {settling && (
          <>
            <p className="text-sm text-slate-600">
              Record the amount agreed with Kia. You can close the case straight after, even if the credit note or payment has not arrived yet.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Settled amount (₦)" required error={show(errors.settledAmount)}>
                <input className={cn(inputCls, "text-right tabular-nums")} inputMode="decimal" value={settledAmount} onChange={(e) => setSettledAmount(e.target.value)} />
              </Field>
              <Field label="Settled on" required error={show(errors.settledAt)}>
                <DateInput value={settledAt} onChange={setSettledAt} max={todayInLagos()} invalid={attempted && Boolean(errors.settledAt)} />
              </Field>
            </div>
            <p className="-mt-2 text-xs text-slate-500">Approved by Kia: {fmtNaira(warrantyCase.approvedAmount)}</p>

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-semibold">Reimbursement from Kia</legend>
              {[
                { value: false, label: "Pending", hint: "The credit note or payment has not arrived. Record it later from the case." },
                { value: true, label: "Received", hint: "The credit note or payment is in hand." },
              ].map((option) => (
                <label
                  key={option.label}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm focus-within:ring-2 focus-within:ring-ring",
                    received === option.value ? "border-slate-400 bg-slate-50" : "border-slate-200",
                  )}
                >
                  <input type="radio" name="reimbursement" className="mt-0.5 size-4" checked={received === option.value} onChange={() => setReceived(option.value)} />
                  <span>
                    <span className="font-medium text-slate-800">{option.label}</span>
                    <span className="block text-xs text-slate-500">{option.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {received && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Credit note or payment ref." required error={show(errors.settlementRef)}>
                  <input className={inputCls} value={settlementRef} onChange={(e) => setSettlementRef(e.target.value)} maxLength={60} />
                </Field>
                <Field label="Amount received (₦)" required error={show(errors.reimbursedAmount)}>
                  <input className={cn(inputCls, "text-right tabular-nums")} inputMode="decimal" value={reimbursedAmount} onChange={(e) => setReimbursedAmount(e.target.value)} />
                </Field>
                <Field label="Received on" required error={show(errors.reimbursedAt)}>
                  <DateInput value={reimbursedAt} onChange={setReimbursedAt} max={todayInLagos()} invalid={attempted && Boolean(errors.reimbursedAt)} />
                </Field>
              </div>
            )}
          </>
        )}
        {action === "CLOSE" && !withdrawing && warrantyCase.reimbursementStatus === "PENDING" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            The reimbursement from Kia is still pending. You can close the case now and record the credit note or payment when it arrives.
          </p>
        )}
        {withdrawing && <p className="text-sm text-slate-600">The case was never decided by the manufacturer. Say why it is being withdrawn.</p>}
        <Field label={copy.remarks} required={copy.required} error={show(errors.remarks)}>
          <textarea className={cn(inputCls, "h-20 py-2")} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={transition.isPending}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={transition.isPending || (attempted && !valid)} variant={withdrawing ? "outline" : "default"}>
            {transition.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {transition.isPending ? copy.pending : copy.button}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

/** Records the credit note or payment for a case settled with the reimbursement pending. */
export function RecordReimbursementDialog({ warrantyCase, onClose }: { warrantyCase: WarrantyCase; onClose: () => void }) {
  const record = useRecordReimbursement(warrantyCase.id);
  const [attempted, setAttempted] = useState(false);
  const [settlementRef, setSettlementRef] = useState(warrantyCase.settlementRef ?? "");
  const [amount, setAmount] = useState(amountText(warrantyCase.settledAmount ?? warrantyCase.approvedAmount));
  const [receivedOn, setReceivedOn] = useState(todayInLagos());
  const [remarks, setRemarks] = useState("");

  const errors = {
    settlementRef: settlementRef.trim() ? undefined : "Enter the credit note or payment reference",
    amount: parseAmount(amount) == null ? "Enter the amount received in naira, for example 186800.00" : undefined,
    receivedOn: receivedOn ? undefined : "Enter the date the reimbursement was received",
  };
  const valid = Object.values(errors).every((e) => !e);
  const show = (e: string | undefined) => (attempted ? e : undefined);

  function save() {
    setAttempted(true);
    const reimbursedAmount = parseAmount(amount);
    if (!valid || reimbursedAmount == null || record.isPending) return;
    record.mutate(
      { settlementRef: settlementRef.trim(), reimbursedAmount, reimbursedAt: receivedOn, remarks: remarks.trim() || null },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalFame isOpen onClose={onClose} title="Record reimbursement" preventAccidentalClose>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          Case {warrantyCase.caseNumber} was settled at {fmtNaira(warrantyCase.settledAmount)}. Enter the credit note or payment Kia sent for it.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Credit note or payment ref." required error={show(errors.settlementRef)}>
            <input className={inputCls} value={settlementRef} onChange={(e) => setSettlementRef(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Amount received (₦)" required error={show(errors.amount)}>
            <input className={cn(inputCls, "text-right tabular-nums")} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Received on" required error={show(errors.receivedOn)}>
            <DateInput value={receivedOn} onChange={setReceivedOn} max={todayInLagos()} invalid={attempted && Boolean(errors.receivedOn)} />
          </Field>
        </div>
        <Field label="Remarks (optional)">
          <textarea className={cn(inputCls, "h-20 py-2")} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={record.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={record.isPending || (attempted && !valid)}>
            {record.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {record.isPending ? "Saving reimbursement" : "Save reimbursement"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

/** Complaint code and text (editable while unsubmitted) and the Kia claim number (until closed). */
export function EditClaimDetailsDialog({ warrantyCase, onClose }: { warrantyCase: WarrantyCase; onClose: () => void }) {
  const update = useUpdateWarrantyCase(warrantyCase.id);
  const { data: codes } = useWarrantyCodes();
  const [complaintCodeId, setComplaintCodeId] = useState(warrantyCase.complaintCodeId ?? "");
  const [complaint, setComplaint] = useState(warrantyCase.complaint ?? "");
  const [claimNo, setClaimNo] = useState(warrantyCase.manufacturerClaimNo ?? "");
  const [claimDate, setClaimDate] = useState(toDateInput(warrantyCase.manufacturerClaimDate));

  function save() {
    if (update.isPending) return;
    update.mutate(
      {
        ...(warrantyCase.editable && { complaintCodeId: complaintCodeId || null, complaint: complaint.trim() || null }),
        manufacturerClaimNo: claimNo.trim() || null,
        manufacturerClaimDate: claimDate || null,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalFame isOpen onClose={onClose} title="Claim details" preventAccidentalClose>
      <div className="grid gap-4">
        <Field label="Complaint code">
          <select className={inputCls} value={complaintCodeId} onChange={(e) => setComplaintCodeId(e.target.value)} disabled={!warrantyCase.editable}>
            <option value="">No complaint code</option>
            {codes?.complaint.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.description}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Complaint">
          <textarea className={cn(inputCls, "h-20 py-2")} value={complaint} onChange={(e) => setComplaint(e.target.value)} disabled={!warrantyCase.editable} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kia claim no.">
            <input className={cn(inputCls, "font-mono")} value={claimNo} onChange={(e) => setClaimNo(e.target.value)} maxLength={40} />
          </Field>
          <Field label="Claim date">
            <DateInput value={claimDate} onChange={setClaimDate} max={todayInLagos()} />
          </Field>
        </div>
        {!warrantyCase.editable && <p className="text-xs text-slate-500">The complaint is locked once the claim is submitted.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {update.isPending ? "Saving claim details" : "Save claim details"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
