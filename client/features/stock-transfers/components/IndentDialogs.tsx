"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { useIndentPartLookup } from "../hooks/use-indents";
import {
  useApproveIndent,
  useCancelIndent,
  useCloseIndent,
  useDispatchIndent,
  useRejectIndent,
} from "../hooks/use-indent-mutations";
import { useReceiveStn } from "../hooks/use-stns";
import { DEFAULT_STN_TAX_FORM, TRANSPORT_MODE_LABELS } from "../lib/indent-status";
import { TaxFormSelect } from "./StnDespatchFields";
import { CaseSplitter, NO_SPLIT, StaffNameInput, caseSplitPlan } from "./CaseSplitter";
import type { DispatchIndentPayload, Indent, IndentLine, Stn, TransportMode } from "../types/indent.types";
import { NumberInput } from "@/components/forms/NumberInput";

const textareaCls =
  "min-h-20 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const numCls = cn(inputCls, "h-9 w-20 text-right");
const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400";
const tdCls = "px-3 py-2 align-top";

const toInt = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

interface DialogProps {
  indent: Indent;
  open: boolean;
  onClose: () => void;
}

// ── Approve ──────────────────────────────────────────────────────────────────

type ApproveRowState = { approved: string; supplyPartId: string };

function ApproveRow({
  indent,
  line,
  value,
  onChange,
}: {
  indent: Indent;
  line: IndentLine;
  value: ApproveRowState;
  onChange: (v: ApproveRowState) => void;
}) {
  const { data, isLoading } = useIndentPartLookup({
    partId: line.partId,
    requestingBranchId: indent.requestingBranchId,
    sourceBranchId: indent.sourceBranchId,
  });
  const supplyId = value.supplyPartId || line.partId;
  const available =
    supplyId === line.partId
      ? (data?.sourceBranchStock?.available ?? 0)
      : (data?.alternates.find((a) => a.part.id === supplyId)?.sourceBranchStock?.available ?? 0);
  const approved = toInt(value.approved);
  const valid = Number.isFinite(approved) && approved <= line.requestedQuantity;
  const picked = valid ? Math.min(approved, Math.max(0, available)) : 0;
  const backOrder = valid ? approved - picked : 0;
  const alternates = data?.alternates ?? [];

  return (
    <tr className="border-t border-slate-100">
      <td className={tdCls}>
        <p className="font-mono text-sm font-medium">{line.part.partNumber}</p>
        <p className="text-sm text-slate-500">{line.part.name}</p>
        {alternates.length > 0 && (
          <select
            className={cn(inputCls, "mt-2 h-8 text-sm")}
            value={value.supplyPartId}
            onChange={(e) => onChange({ ...value, supplyPartId: e.target.value })}
          >
            <option value="">Supply requested part</option>
            {alternates.map((a) => (
              <option key={a.part.id} value={a.part.id}>
                Alternate {a.part.partNumber} ({a.sourceBranchStock?.available ?? 0} available)
              </option>
            ))}
          </select>
        )}
      </td>
      <td data-label="Requested" className={cn(tdCls, "text-right")}>{line.requestedQuantity}</td>
      <td data-label="Available" className={cn(tdCls, "text-right")}>
        {isLoading ? <Loader2 className="ml-auto size-4 animate-spin text-slate-400" /> : available}
      </td>
      <td data-label="Approve" className={cn(tdCls, "text-right")}>
        <NumberInput
          min={0}
          max={line.requestedQuantity}
          className={cn(numCls, "ml-auto", !valid && "border-red-400")}
          value={value.approved}
          onChange={(e) => onChange({ ...value, approved: e.target.value })}
        />
      </td>
      <td data-label="Will pick" className={cn(tdCls, "text-right font-medium text-emerald-700")}>{picked}</td>
      <td data-label="Back order" className={cn(tdCls, "text-right", backOrder > 0 ? "font-medium text-amber-700" : "text-slate-400")}>
        {backOrder}
      </td>
    </tr>
  );
}

export function ApproveIndentDialog({ indent, open, onClose }: DialogProps) {
  const approve = useApproveIndent();
  const [remarks, setRemarks] = useState("");
  const [pickerName, setPickerName] = useState("");
  const [rows, setRows] = useState<Record<string, ApproveRowState>>(() =>
    Object.fromEntries(indent.lines.map((l) => [l.id, { approved: String(l.requestedQuantity), supplyPartId: "" }])),
  );

  const invalid = indent.lines.some((l) => {
    const n = toInt(rows[l.id]?.approved ?? "");
    return !Number.isFinite(n) || n > l.requestedQuantity;
  });
  const allZero = indent.lines.every((l) => toInt(rows[l.id]?.approved ?? "") === 0);

  function confirm() {
    const lines = indent.lines
      .map((l) => {
        const r = rows[l.id];
        const approved = toInt(r.approved);
        const changed = approved !== l.requestedQuantity || !!r.supplyPartId;
        return changed
          ? {
              lineId: l.id,
              approvedQuantity: approved,
              ...(r.supplyPartId && { supplyPartId: r.supplyPartId }),
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    approve.mutate(
      {
        id: indent.id,
        body: {
          remarks: remarks.trim() || undefined,
          pickerName: pickerName.trim() || undefined,
          lines: lines.length ? lines : undefined,
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalFame isOpen={open} onClose={onClose} title={`Approve indent ${indent.indentNumber}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          Approving picks what {indent.sourceBranch.name} has in stock and reserves it. Anything not available goes
          on back order and the general store manager is notified.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="stack-table w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={thCls}>Part</th>
                <th className={cn(thCls, "text-right")}>Requested</th>
                <th className={cn(thCls, "text-right")}>Available</th>
                <th className={cn(thCls, "text-right")}>Approve</th>
                <th className={cn(thCls, "text-right")}>Will pick</th>
                <th className={cn(thCls, "text-right")}>Back order</th>
              </tr>
            </thead>
            <tbody>
              {indent.lines.map((line) => (
                <ApproveRow
                  key={line.id}
                  indent={indent}
                  line={line}
                  value={rows[line.id]}
                  onChange={(v) => setRows((prev) => ({ ...prev, [line.id]: v }))}
                />
              ))}
            </tbody>
          </table>
        </div>
        <Field label="Picker (optional)">
          <StaffNameInput branchId={indent.sourceBranchId} value={pickerName} onChange={setPickerName} placeholder="Who picks the parts" />
        </Field>
        <Field label="Approval remarks (optional)">
          <textarea className={textareaCls} value={remarks} maxLength={500} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
        {allZero && <p className="text-sm text-red-500">Approve at least one unit, or reject the indent instead.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={approve.isPending || invalid || allZero} onClick={confirm}>
            {approve.isPending ? "Approving…" : "Approve & pick"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export function DispatchIndentDialog({ indent, open, onClose }: DialogProps) {
  const dispatch = useDispatchIndent();
  const pickLines = indent.openPickingList?.lines ?? [];
  const [ship, setShip] = useState<Record<string, string>>(() =>
    Object.fromEntries(pickLines.map((l) => [l.id, String(l.pickedQuantity)])),
  );
  const [transportMode, setTransportMode] = useState<TransportMode | "">("ROAD");
  const [waybillNumber, setWaybill] = useState("");
  const [courierName, setCourier] = useState("");
  // Legacy STNs between branches use tax form X.
  const [taxForm, setTaxForm] = useState<string>(DEFAULT_STN_TAX_FORM);
  const [packerName, setPacker] = useState("");
  const [remarks, setRemarks] = useState("");
  const [courierDate, setCourierDate] = useState("");
  const [weight, setWeight] = useState("");
  const [split, setSplit] = useState(NO_SPLIT);

  const shipQty = (id: string) => toInt(ship[id] ?? "0");
  const shipInvalid = pickLines.some((l) => {
    const q = shipQty(l.id);
    return !Number.isFinite(q) || q > l.pickedQuantity;
  });
  const totalShip = pickLines.reduce((s, l) => s + (Number.isFinite(shipQty(l.id)) ? shipQty(l.id) : 0), 0);
  const caseRows = pickLines.map((l) => ({ key: l.id, label: l.part.partNumber, quantity: Number.isFinite(shipQty(l.id)) ? shipQty(l.id) : 0 }));
  const casePlan = caseSplitPlan(split, caseRows);

  function confirm() {
    const opt = (v: string) => v.trim() || undefined;
    const overrides = pickLines
      .filter((l) => shipQty(l.id) !== l.pickedQuantity)
      .map((l) => ({ pickingLineId: l.id, quantity: shipQty(l.id) }));
    const body: DispatchIndentPayload = {
      transportMode: transportMode || undefined,
      waybillNumber: opt(waybillNumber),
      courierName: opt(courierName),
      taxForm: opt(taxForm),
      packerName: opt(packerName),
      remarks: opt(remarks),
      courierDate: opt(courierDate),
      // Split cases carry their own weights, which add up to the consignment's.
      consignmentWeight: !split.on && weight.trim() ? Number(weight) : undefined,
      lines: overrides.length ? overrides : undefined,
      cases: casePlan.cases?.map((c) => ({ weight: c.weight, lines: c.lines.map((l) => ({ pickingLineId: l.key, quantity: l.quantity })) })),
    };
    dispatch.mutate({ id: indent.id, body }, { onSuccess: onClose });
  }

  return (
    <ModalFame isOpen={open} onClose={onClose} title={`Dispatch indent ${indent.indentNumber}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          Dispatching creates the STN, cases and packing list cum gate pass in one step, and deducts the stock from{" "}
          {indent.sourceBranch.name}. To ship several indents for {indent.requestingBranch.name} on one STN, use
          Dispatch to branch on the Stock Transfers page.
        </p>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="stack-table w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={thCls}>Part</th>
                <th className={thCls}>Bin</th>
                <th className={cn(thCls, "text-right")}>Picked</th>
                <th className={cn(thCls, "text-right")}>Ship</th>
              </tr>
            </thead>
            <tbody>
              {pickLines.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className={tdCls}>
                    <p className="font-mono text-sm font-medium">{l.part.partNumber}</p>
                    <p className="text-sm text-slate-500">
                      {l.part.name}
                      {l.isAlternate && ` · alternate for ${l.requestedPart.partNumber}`}
                    </p>
                  </td>
                  <td data-label="Bin" className={cn(tdCls, "text-xs text-slate-500")}>{l.binLocation ?? "—"}</td>
                  <td data-label="Picked" className={cn(tdCls, "text-right")}>{l.pickedQuantity}</td>
                  <td data-label="Ship" className={cn(tdCls, "text-right")}>
                    <NumberInput
                      min={0}
                      max={l.pickedQuantity}
                      className={cn(numCls, "ml-auto", (shipQty(l.id) > l.pickedQuantity || !Number.isFinite(shipQty(l.id))) && "border-red-400")}
                      value={ship[l.id]}
                      onChange={(e) => setShip((prev) => ({ ...prev, [l.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pickLines.some((l) => shipQty(l.id) < l.pickedQuantity) && !shipInvalid && (
          <p className="text-sm text-amber-700">
            Units not shipped are released back to stock and stay on back order, to go on a later STN.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Transport mode">
            <select className={inputCls} value={transportMode} onChange={(e) => setTransportMode(e.target.value as TransportMode)}>
              {Object.entries(TRANSPORT_MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Waybill no. (optional)">
            <input className={inputCls} value={waybillNumber} maxLength={30} onChange={(e) => setWaybill(e.target.value)} />
          </Field>
          <Field label="Courier / logistics (optional)">
            <input className={inputCls} value={courierName} maxLength={60} onChange={(e) => setCourier(e.target.value)} />
          </Field>
          <Field label="Packer (optional)">
            <StaffNameInput branchId={indent.sourceBranchId} value={packerName} onChange={setPacker} />
          </Field>
          <Field label="Courier date (blank = today)">
            <input type="date" className={inputCls} value={courierDate} onChange={(e) => setCourierDate(e.target.value)} />
          </Field>
          {!split.on && (
            <Field label="Consignment weight, kg (optional)">
              <NumberInput min={0} step="0.1" className={inputCls} value={weight} onChange={(e) => setWeight(e.target.value)} />
            </Field>
          )}
          <Field label="Tax form">
            <TaxFormSelect value={taxForm} onChange={setTaxForm} />
          </Field>
          <Field label="Remarks (optional)">
            <input className={inputCls} value={remarks} maxLength={500} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>

        <CaseSplitter rows={caseRows} value={split} onChange={setSplit} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">{totalShip} units to ship</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              disabled={dispatch.isPending || shipInvalid || totalShip === 0 || !!casePlan.error}
              onClick={confirm}
            >
              {dispatch.isPending ? "Dispatching…" : "Dispatch"}
            </Button>
          </div>
        </div>
      </div>
    </ModalFame>
  );
}

// ── Receive ──────────────────────────────────────────────────────────────────

/** Generates an MRN against one STN (also used on the STN page for direct and multi-indent STNs). */
export function ReceiveStnForm({
  stn,
  receivingBranchName,
  onDone,
  onCancel,
}: {
  stn: Stn;
  receivingBranchName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const receive = useReceiveStn();
  const stnLines = stn.lines;
  // Case numbers per STN line, for finding the goods in the delivery.
  const caseNumbers = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of stn.cases) {
      for (const l of c.lines) map.set(l.stnLineId, [...(map.get(l.stnLineId) ?? []), c.caseNumber]);
    }
    return map;
  }, [stn.cases]);
  const outstanding = (l: (typeof stnLines)[number]) =>
    l.quantity - l.receivedQuantity - l.damagedQuantity - l.shortQuantity;
  const open_ = stnLines.filter((l) => outstanding(l) > 0);

  const [rows, setRows] = useState<Record<string, { received: string; damaged: string }>>(() =>
    Object.fromEntries(open_.map((l) => [l.id, { received: String(outstanding(l)), damaged: "0" }])),
  );
  const [closeShort, setCloseShort] = useState(false);
  const [remarks, setRemarks] = useState("");

  const values = open_.map((l) => {
    const r = toInt(rows[l.id]?.received ?? "0");
    const d = toInt(rows[l.id]?.damaged ?? "0");
    const ok = Number.isFinite(r) && Number.isFinite(d) && r + d <= outstanding(l);
    const left = ok ? outstanding(l) - r - d : 0;
    return { line: l, r, d, ok, left };
  });
  const invalid = values.some((v) => !v.ok);
  const anything = values.some((v) => v.r + v.d > 0) || (closeShort && values.some((v) => v.left > 0));
  const leftTotal = values.reduce((s, v) => s + v.left, 0);

  function confirm() {
    receive.mutate(
      {
        id: stn.id,
        body: {
          remarks: remarks.trim() || undefined,
          closeShort: closeShort || undefined,
          // Always explicit: an empty list would mean "receive everything" on the server.
          lines: values.map((v) => ({
            stnLineId: v.line.id,
            receivedQuantity: v.r,
            damagedQuantity: v.d || undefined,
          })),
        },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-slate-600">
        This generates an MRN for what arrived on STN {stn.stnNumber}. Good units are added to {receivingBranchName}{" "}
        stock. Damaged units are recorded on the MRN but not added to stock.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="stack-table w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className={thCls}>Part</th>
              <th className={thCls}>Case</th>
              <th className={cn(thCls, "text-right")}>Outstanding</th>
              <th className={cn(thCls, "text-right")}>Received good</th>
              <th className={cn(thCls, "text-right")}>Damaged</th>
              <th className={cn(thCls, "text-right")}>Still missing</th>
            </tr>
          </thead>
          <tbody>
            {values.map(({ line, ok, left }) => (
              <tr key={line.id} className="border-t border-slate-100">
                <td className={tdCls}>
                  <p className="font-mono text-sm font-medium">{line.part.partNumber}</p>
                  <p className="text-sm text-slate-500">{line.part.name}</p>
                </td>
                <td data-label="Case" className={cn(tdCls, "text-xs text-slate-500")}>
                  {caseNumbers.get(line.id)?.join(", ") || "—"}
                </td>
                <td data-label="Outstanding" className={cn(tdCls, "text-right")}>{outstanding(line)}</td>
                {(["received", "damaged"] as const).map((field) => (
                  <td key={field} data-label={field === "received" ? "Received good" : "Damaged"} className={cn(tdCls, "text-right")}>
                    <NumberInput
                      min={0}
                      className={cn(numCls, "ml-auto", !ok && "border-red-400")}
                      value={rows[line.id]?.[field] ?? ""}
                      onChange={(e) =>
                        setRows((prev) => ({ ...prev, [line.id]: { ...prev[line.id], [field]: e.target.value } }))
                      }
                    />
                  </td>
                ))}
                <td data-label="Still missing" className={cn(tdCls, "text-right", left > 0 ? "font-medium text-amber-700" : "text-slate-400")}>
                  {left}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invalid && <p className="text-sm text-red-500">Received plus damaged cannot exceed what is outstanding.</p>}

      {leftTotal > 0 && (
        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <input type="checkbox" className="mt-0.5" checked={closeShort} onChange={(e) => setCloseShort(e.target.checked)} />
          <span>
            Record the {leftTotal} missing {leftTotal === 1 ? "unit" : "units"} as short and close this STN. Leave
            unticked to receive the rest later.
          </span>
        </label>
      )}

      <Field label="Remarks (optional)">
        <textarea className={textareaCls} value={remarks} maxLength={500} onChange={(e) => setRemarks(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Close
        </Button>
        <Button disabled={receive.isPending || invalid || !anything} onClick={confirm}>
          {receive.isPending ? "Generating MRN…" : "Generate MRN"}
        </Button>
      </div>
    </div>
  );
}

/** Receives one of the indent's STNs in transit; asks which when there are several. */
export function ReceiveIndentDialog({ indent, open, onClose }: DialogProps) {
  const [stnId, setStnId] = useState(indent.stnsInTransit[0]?.id ?? "");
  const stn = indent.stnsInTransit.find((s) => s.id === stnId);

  return (
    <ModalFame isOpen={open} onClose={onClose} title={`Receive ${stn ? `STN ${stn.stnNumber}` : "STN"}`}>
      <div className="grid gap-4">
        {indent.stnsInTransit.length > 1 && (
          <Field label="STN to receive">
            <select className={inputCls} value={stnId} onChange={(e) => setStnId(e.target.value)}>
              {indent.stnsInTransit.map((s) => (
                <option key={s.id} value={s.id}>
                  STN {s.stnNumber} · {s.totalQuantity} unit(s)
                  {s.indents.length > 1 ? ` · also for ${s.indents.length - 1} other indent(s)` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        {stn ? (
          <ReceiveStnForm
            key={stn.id}
            stn={stn}
            receivingBranchName={indent.requestingBranch.name}
            onDone={onClose}
            onCancel={onClose}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Nothing is in transit for this indent.</p>
        )}
      </div>
    </ModalFame>
  );
}

// ── Reject / cancel ──────────────────────────────────────────────────────────

export function ReasonDialog({
  indent,
  open,
  onClose,
  mode,
}: DialogProps & { mode: "reject" | "cancel" | "close" }) {
  const reject = useRejectIndent();
  const cancel = useCancelIndent();
  const closeBackOrder = useCloseIndent();
  const [reason, setReason] = useState("");
  const pending = reject.isPending || cancel.isPending || closeBackOrder.isPending;
  const required = mode !== "cancel";
  const tooShort = required && reason.trim().length < 3;
  const backOrder = indent.lines.reduce((s, l) => s + (l.approvedQuantity ?? 0) - l.dispatchedQuantity, 0);

  function confirm() {
    if (mode === "reject") reject.mutate({ id: indent.id, reason: reason.trim() }, { onSuccess: onClose });
    else if (mode === "close") closeBackOrder.mutate({ id: indent.id, reason: reason.trim() }, { onSuccess: onClose });
    else cancel.mutate({ id: indent.id, reason: reason.trim() || undefined }, { onSuccess: onClose });
  }
  const titles = {
    reject: `Reject indent ${indent.indentNumber}`,
    cancel: `Cancel indent ${indent.indentNumber}`,
    close: `Close back order on ${indent.indentNumber}`,
  };

  return (
    <ModalFame
      isOpen={open}
      onClose={onClose}
      title={titles[mode]}
    >
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          {mode === "reject"
            ? "The requesting branch will be notified with your reason."
            : mode === "close"
              ? `The remaining ${backOrder} unit(s) will not be supplied${indent.openPickingList ? " and the open pick is released" : ""}. The indent completes once its STNs are received, and ${indent.requestingBranch.name} is told why.`
              : indent.openPickingList
                ? "Reserved stock will be released back to the supplying branch."
                : "The indent will be closed and no stock will move."}
        </p>
        <Field label={required ? "Reason" : "Reason (optional)"}>
          <textarea className={textareaCls} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="destructive" disabled={pending || tooShort} onClick={confirm}>
            {pending ? "Saving…" : mode === "reject" ? "Reject indent" : mode === "close" ? "Close back order" : "Cancel indent"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
