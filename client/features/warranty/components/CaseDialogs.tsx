"use client";

import { useState } from "react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import { cn } from "@/lib/utils";
import { useTransitionWarrantyCase, useUpdateWarrantyCase, useWarrantyCodes } from "../hooks/use-warranty";
import { fmtNaira, toDateInput } from "../lib/warranty-format";
import type { WarrantyCase } from "../types/warranty.types";

export type SimpleAction = "START_REVIEW" | "SUBMIT" | "RETURN" | "RESUME" | "SETTLE" | "CLOSE";

const ACTION_COPY: Record<SimpleAction, { title: string; button: string; remarks: string; required?: boolean }> = {
  START_REVIEW: { title: "Start review", button: "Start review", remarks: "Remarks (optional)" },
  SUBMIT: { title: "Submit claim to Kia", button: "Submit claim", remarks: "Remarks (optional)" },
  RETURN: { title: "Return for correction", button: "Return", remarks: "What did the manufacturer ask to be corrected?", required: true },
  RESUME: { title: "Resume review", button: "Resume review", remarks: "Remarks (optional)" },
  SETTLE: { title: "Record settlement", button: "Record settlement", remarks: "Remarks (optional)" },
  CLOSE: { title: "Close case", button: "Close case", remarks: "Reason" },
};

/** Workflow actions that need at most a few fields. The server validates every transition. */
export function CaseActionDialog({ warrantyCase, action, onClose }: { warrantyCase: WarrantyCase; action: SimpleAction; onClose: () => void }) {
  const transition = useTransitionWarrantyCase(warrantyCase.id);
  const withdrawing = action === "CLOSE" && !["SETTLED", "REJECTED"].includes(warrantyCase.status);
  const copy = withdrawing ? { ...ACTION_COPY.CLOSE, title: "Withdraw case", button: "Withdraw", required: true } : ACTION_COPY[action];
  const [remarks, setRemarks] = useState("");
  const [claimNo, setClaimNo] = useState(warrantyCase.manufacturerClaimNo ?? "");
  const [claimDate, setClaimDate] = useState(toDateInput(warrantyCase.manufacturerClaimDate) || new Date().toISOString().slice(0, 10));
  const [settlementRef, setSettlementRef] = useState("");
  const [settledAmount, setSettledAmount] = useState(warrantyCase.approvedAmount != null ? String(warrantyCase.approvedAmount) : "");
  const [settledAt, setSettledAt] = useState(new Date().toISOString().slice(0, 10));

  const remarksOk = !copy.required || remarks.trim().length > 0;
  const settleOk = action !== "SETTLE" || settlementRef.trim().length > 0;

  function confirm() {
    transition.mutate(
      {
        action,
        remarks: remarks.trim() || null,
        ...(action === "SUBMIT" && { manufacturerClaimNo: claimNo.trim() || null, manufacturerClaimDate: claimNo.trim() ? claimDate : null }),
        ...(action === "SETTLE" && {
          settlementRef: settlementRef.trim(),
          settledAmount: settledAmount ? Number(settledAmount) : null,
          settledAt,
        }),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalFame isOpen onClose={onClose} title={copy.title}>
      <div className="grid gap-4">
        {action === "SUBMIT" && (
          <>
            <p className="text-sm text-slate-600">
              Submit the claim on the Kia portal, then record the claim number it gave you. Lines are locked after submission.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kia claim no. (optional)">
                <input className={cn(inputCls, "font-mono")} value={claimNo} onChange={(e) => setClaimNo(e.target.value)} placeholder="KNG-WC-558213" />
              </Field>
              <Field label="Claim date">
                <DateInput value={claimDate} onChange={setClaimDate} />
              </Field>
            </div>
          </>
        )}
        {action === "SETTLE" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Settlement ref.">
              <input className={inputCls} value={settlementRef} onChange={(e) => setSettlementRef(e.target.value)} placeholder="Credit note CN-2026-0091" />
            </Field>
            <Field label="Amount received (₦)">
              <input className={inputCls} inputMode="decimal" value={settledAmount} onChange={(e) => setSettledAmount(e.target.value)} />
            </Field>
            <Field label="Settled on">
              <DateInput value={settledAt} onChange={setSettledAt} />
            </Field>
            <p className="text-xs text-slate-500 sm:col-span-3">Approved: {fmtNaira(warrantyCase.approvedAmount)}</p>
          </div>
        )}
        {withdrawing && <p className="text-sm text-slate-600">The case was never decided by the manufacturer. Say why it is being withdrawn.</p>}
        <Field label={copy.remarks}>
          <textarea className={cn(inputCls, "h-20 py-2")} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!remarksOk || !settleOk || transition.isPending} variant={action === "CLOSE" && withdrawing ? "outline" : "default"}>
            {transition.isPending ? "Saving…" : copy.button}
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
    <ModalFame isOpen onClose={onClose} title="Claim details">
      <div className="grid gap-4">
        <Field label="Complaint code">
          <select className={inputCls} value={complaintCodeId} onChange={(e) => setComplaintCodeId(e.target.value)} disabled={!warrantyCase.editable}>
            <option value="">—</option>
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
            <input className={cn(inputCls, "font-mono")} value={claimNo} onChange={(e) => setClaimNo(e.target.value)} />
          </Field>
          <Field label="Claim date">
            <DateInput value={claimDate} onChange={setClaimDate} />
          </Field>
        </div>
        {!warrantyCase.editable && <p className="text-xs text-slate-500">The complaint is locked once the claim is submitted.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
