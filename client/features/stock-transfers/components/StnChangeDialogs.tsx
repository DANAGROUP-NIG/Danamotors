"use client";

import { useState } from "react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { NumberInput } from "@/components/forms/NumberInput";
import { cn } from "@/lib/utils";
import { useCancelStn, useEditStn } from "../hooks/use-stns";
import { DEFAULT_STN_TAX_FORM, STN_VAT_FORMS, fmtCurrency } from "../lib/indent-status";
import { TaxFormSelect } from "./StnDespatchFields";
import type { StnDetail } from "../types/indent.types";

const textareaCls =
  "min-h-20 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400";
const tdCls = "px-3 py-2 align-top";

const toQty = (v: string) => {
  const n = Number(v);
  return v.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : NaN;
};

/** Legacy STN cancel: before any MRN, the stock goes back to the sender. */
export function CancelStnDialog({ stn, onClose }: { stn: StnDetail; onClose: () => void }) {
  const cancel = useCancelStn();
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 3;
  return (
    <ModalFame isOpen onClose={onClose} title={`Cancel STN ${stn.stnNumber}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          The {stn.totalQuantity} unit(s) go back into {stn.sourceBranch.name}&rsquo;s stock, the case(s), packing list and gate
          pass {stn.packingList?.gatePassNumber} become void, and {stn.destinationBranch.name} is told there is nothing to
          receive.
          {stn.indents.length > 0 && " The indent lines go back on back order, to be picked and sent again."}
        </p>
        <Field label="Reason" required>
          <textarea
            className={textareaCls}
            maxLength={500}
            placeholder="e.g. Sent to the wrong branch"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Keep the STN
          </Button>
          <Button
            variant="destructive"
            disabled={!ok || cancel.isPending}
            onClick={() => cancel.mutate({ id: stn.id, reason: reason.trim() }, { onSuccess: onClose })}
          >
            {cancel.isPending ? "Cancelling…" : "Cancel STN"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

/**
 * Legacy STN edit (CSSTNEditLog): the issued quantities and the tax form, before any MRN. More units
 * come from the indent's back order (or free stock on a direct STN); 0 takes the part off the STN.
 */
export function EditStnDialog({ stn, onClose }: { stn: StnDetail; onClose: () => void }) {
  const edit = useEditStn();
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(stn.lines.map((l) => [l.id, String(l.quantity)])));
  const [taxForm, setTaxForm] = useState<string>(stn.taxForm ?? DEFAULT_STN_TAX_FORM);
  const [reason, setReason] = useState("");

  const newQty = (id: string) => toQty(qty[id] ?? "");
  const invalid = stn.lines.some((l) => Number.isNaN(newQty(l.id)));
  const changes = stn.lines.filter((l) => !Number.isNaN(newQty(l.id)) && newQty(l.id) !== l.quantity);
  const formChanged = taxForm !== (stn.taxForm ?? DEFAULT_STN_TAX_FORM);
  const allZero = stn.lines.every((l) => newQty(l.id) === 0);
  const value = stn.lines.reduce((s, l) => s + (Number.isNaN(newQty(l.id)) ? 0 : newQty(l.id)) * l.unitRate, 0);
  const vat = STN_VAT_FORMS.includes(taxForm)
    ? stn.lines.reduce((s, l) => s + (l.part.taxable === false || Number.isNaN(newQty(l.id)) ? 0 : newQty(l.id) * l.unitRate * 0.075), 0)
    : 0;

  function save() {
    edit.mutate(
      {
        id: stn.id,
        body: {
          reason: reason.trim(),
          taxForm: formChanged ? taxForm : undefined,
          lines: changes.length ? changes.map((l) => ({ stnLineId: l.id, quantity: newQty(l.id) })) : undefined,
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalFame isOpen onClose={onClose} size="wide" title={`Change STN ${stn.stnNumber}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          Only before {stn.destinationBranch.name} generates an MRN. Units taken off go back into {stn.sourceBranch.name}
          &rsquo;s stock{stn.indents.length ? " and the indent's back order" : ""}; extra units come from{" "}
          {stn.indents.length ? "the indent's back order" : "free stock"}. Set a quantity to 0 to take the part off the STN.
          Reprint the STN and packing list after the change.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={thCls}>Part</th>
                <th className={cn(thCls, "text-right")}>Sent</th>
                <th className={cn(thCls, "text-right")}>New qty</th>
                <th className={cn(thCls, "text-right")}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {stn.lines.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className={tdCls}>
                    <p className="font-mono font-medium">{l.part.partNumber}</p>
                    <p className="text-slate-500">
                      {l.part.name}
                      {l.indentLine ? ` · indent ${l.indentLine.indent.indentNumber}` : ""}
                    </p>
                  </td>
                  <td className={cn(tdCls, "text-right")}>{l.quantity}</td>
                  <td className={cn(tdCls, "text-right")}>
                    <NumberInput
                      min={0}
                      className={cn(inputCls, "ml-auto h-9 w-20 text-right", Number.isNaN(newQty(l.id)) && "border-red-400")}
                      value={qty[l.id] ?? ""}
                      onChange={(e) => setQty((prev) => ({ ...prev, [l.id]: e.target.value }))}
                    />
                  </td>
                  <td className={cn(tdCls, "text-right")}>{fmtCurrency(l.unitRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tax form">
            <TaxFormSelect value={taxForm} onChange={setTaxForm} />
          </Field>
          <Field label="Reason" required>
            <input
              className={inputCls}
              maxLength={500}
              placeholder="e.g. Two units damaged in the store"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            New value {fmtCurrency(value)}
            {vat > 0 && ` + VAT ${fmtCurrency(vat)}`}
          </p>
          <div className="flex flex-col items-end gap-1">
            {allZero && <p className="text-sm text-red-500">Every quantity is 0: cancel the STN instead.</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button
                disabled={edit.isPending || invalid || allZero || (!changes.length && !formChanged) || reason.trim().length < 3}
                onClick={save}
              >
                {edit.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ModalFame>
  );
}
