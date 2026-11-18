"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { useApproveDiscrepancy } from "../hooks";
import type { DiscrepancyFields } from "../types";

type ApprovableMrn = DiscrepancyFields & { id: string; mrnNumber: string; totalDamaged: number; totalShort: number };

/** The Approve button and its remark dialog; used on the MRN cards and on the pending list. */
export function ApproveDiscrepancyButton({ mrn, size = "sm" }: { mrn: ApprovableMrn; size?: "sm" | "default" }) {
  const approve = useApproveDiscrepancy();
  const [open, setOpen] = useState(false);
  const [remark, setRemark] = useState("");

  return (
    <>
      <Button size={size} variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <CheckCircle2 className="size-4" /> Approve
      </Button>
      <ModalFame isOpen={open} onClose={() => setOpen(false)} title={`Approve shortage on MRN ${mrn.mrnNumber}`}>
        <form
          className="grid gap-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            approve.mutate({ mrnId: mrn.id, remark: remark.trim() || undefined }, { onSuccess: () => setOpen(false) });
          }}>
          <p className="text-sm text-muted-foreground">
            {mrn.totalDamaged} damaged and {mrn.totalShort} short unit(s) were recorded. The received stock is already
            in the branch. Approving accepts the shortage and damage.
          </p>
          <Field label="Remark (optional)">
            <input className={inputCls} maxLength={500} value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="e.g. Carrier confirmed the loss" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={approve.isPending}>{approve.isPending ? "Approving…" : "Approve shortage"}</Button>
          </div>
        </form>
      </ModalFame>
    </>
  );
}

/**
 * Shows an MRN's shortage / damage approval (legacy S/E approval) on its MIT or STN page: waiting, with an
 * Approve button for users with stock:discrepancy:approve, or approved by whom and when. Nothing when the
 * receipt had nothing damaged or short.
 */
export function DiscrepancyPanel({ mrn }: { mrn: ApprovableMrn }) {
  const { hasPermission } = useAuth();
  if (!mrn.discrepancyStatus) return null;

  if (mrn.discrepancyStatus === "APPROVED") {
    const by = mrn.discrepancyApprovedBy ? `${mrn.discrepancyApprovedBy.firstName} ${mrn.discrepancyApprovedBy.lastName}` : "an approver";
    const when = mrn.discrepancyApprovedAt ? new Date(mrn.discrepancyApprovedAt).toLocaleString() : "";
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-white/60 px-3 py-2 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <span>
          Shortage / damage approved by {by}{when ? ` on ${when}` : ""}.
          {mrn.discrepancyRemark ? ` Remark: ${mrn.discrepancyRemark}` : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        Shortage / damage awaiting approval: {mrn.totalDamaged} damaged, {mrn.totalShort} short.
      </span>
      {hasPermission(INVENTORY_PERMISSIONS.STOCK_DISCREPANCY_APPROVE) && <ApproveDiscrepancyButton mrn={mrn} />}
    </div>
  );
}
