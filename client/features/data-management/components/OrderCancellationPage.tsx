"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { PageHeader } from "@/components/headers/page-header";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { isCpd } from "@/features/mobis-receipts/lib/mobis-labels";
import { CustomerPicker } from "@/features/part-sale/components/CustomerPicker";
import { fmtDate } from "@/features/part-sale/lib/part-sale-format";
import type { CustomerSearchResult } from "@/features/part-sale/types/part-sale.types";
import { useCancelLines, usePendingOrders } from "../hooks/use-order-cancellation";
import { CANCELLATION_KINDS, type CancellationKind } from "../lib/order-cancellation";
import type { PendingOrder, PendingOrderFilters } from "../types/order-cancellation.types";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";

/**
 * Legacy Data Management cancellation screens (Customer Purchase Order, Branch Indent From / To Other
 * Branch): fill the pending orders, tick lines across several of them and cancel what is left on
 * those lines with one remark.
 */
export function OrderCancellationPage({ kind }: { kind: CancellationKind }) {
  const config = CANCELLATION_KINDS[kind];
  const branches = useBranchStore((s) => s.branches).filter((b) => b.isActive !== false);
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const crossBranch = isSuperAdmin || hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);

  const [branchId, setBranchId] = useState("");
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [otherBranchId, setOtherBranchId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [filled, setFilled] = useState<PendingOrderFilters | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [remark, setRemark] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (branchId || branches.length === 0) return;
    const cpd = config.preferCpd && crossBranch ? branches.find(isCpd)?.id : undefined;
    setBranchId(cpd ?? user?.branchId ?? "");
  }, [branches, branchId, crossBranch, config.preferCpd, user?.branchId]);

  const { data, isFetching } = usePendingOrders(kind, filled ?? { branchId }, !!filled);
  const orders = filled ? (data ?? []) : [];
  const lines = orders.flatMap((o) => o.lines);
  const chosen = lines.filter((l) => selected.includes(l.id));
  const units = chosen.reduce((s, l) => s + l.pending, 0);

  // Lines no longer pending after a refresh drop out of the selection.
  useEffect(() => setSelected((prev) => prev.filter((id) => lines.some((l) => l.id === id))), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = useCancelLines(kind);

  function fill() {
    setSelected([]);
    setFilled({
      branchId,
      partyId: (kind === "cpo-cancellation" ? customer?.id : otherBranchId) || undefined,
      from: from || undefined,
      to: to || undefined,
      search: search.trim() || undefined,
    });
  }

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => (on ? [...new Set([...prev, ...ids])] : prev.filter((id) => !ids.includes(id))));
  const allOf = (o: PendingOrder) => o.lines.map((l) => l.id);

  function submit() {
    cancel.mutate(
      { lineIds: selected, remark: remark.trim() },
      {
        onSuccess: () => {
          setSelected([]);
          setRemark("");
          setConfirming(false);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader title={config.title} description={config.description} />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label={config.branchLabel}>
            {crossBranch ? (
              <select className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <input className={inputCls} readOnly value={branches.find((b) => b.id === branchId)?.name ?? "Your branch"} />
            )}
          </Field>
          <Field label={`${config.partyLabel} (blank for all)`}>
            {kind === "cpo-cancellation" ? (
              <CustomerPicker value={customer} onChange={setCustomer} />
            ) : (
              <select className={inputCls} value={otherBranchId} onChange={(e) => setOtherBranchId(e.target.value)}>
                <option value="">All</option>
                {branches
                  .filter((b) => b.id !== branchId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          <Field label={`${config.document} no. (blank for all)`}>
            <input className={inputCls} maxLength={40} value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <Field label={`${config.document} date from`}>
            <input type="date" className={inputCls} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Upto">
            <input type="date" className={inputCls} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button className="gap-1.5" disabled={!branchId || isFetching} onClick={fill}>
              {isFetching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Fill orders
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-700">
            {config.document}s with a pending quantity{filled && !isFetching ? ` (${orders.length})` : ""}
          </p>
          {lines.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="size-4"
                checked={selected.length === lines.length}
                onChange={(e) => toggle(lines.map((l) => l.id), e.target.checked)}
              />
              Select all
            </label>
          )}
        </div>
        {!filled ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-muted-foreground">
            Set the filters and choose Fill orders.
          </p>
        ) : isFetching && !data ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-slate-400" />
          </div>
        ) : orders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-muted-foreground">
            Nothing is pending on {config.document.toLowerCase()}s that match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={cn(thCls, "w-10")} />
                  <th className={thCls}>Part No</th>
                  <th className={thCls}>Description</th>
                  <th className={cn(thCls, "text-right")}>Ordered</th>
                  <th className={cn(thCls, "text-right")}>{config.pendingLabel}</th>
                  <th className={cn(thCls, "text-right")}>Picked</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const ids = allOf(o);
                  const ticked = ids.filter((id) => selected.includes(id)).length;
                  return (
                    <Fragment key={o.id}>
                      <tr className="border-t border-slate-200 bg-slate-50/60">
                        <td className={tdCls}>
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={ticked === ids.length}
                            ref={(el) => {
                              if (el) el.indeterminate = ticked > 0 && ticked < ids.length;
                            }}
                            onChange={(e) => toggle(ids, e.target.checked)}
                            aria-label={`Select every line of ${o.number}`}
                          />
                        </td>
                        <td className={tdCls} colSpan={5}>
                          <Link href={config.href(o.id)} className="font-mono font-medium text-slate-800 hover:underline">
                            {o.number}
                          </Link>
                          <span className="ml-3 text-slate-500">
                            {fmtDate(o.date)} · {o.party} · {o.status.toLowerCase().replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                      {o.lines.map((l) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className={tdCls}>
                            <input
                              type="checkbox"
                              className="size-4"
                              checked={selected.includes(l.id)}
                              onChange={(e) => toggle([l.id], e.target.checked)}
                              aria-label={`Cancel ${l.partNumber} on ${o.number}`}
                            />
                          </td>
                          <td className={cn(tdCls, "font-mono text-slate-800")}>{l.partNumber}</td>
                          <td className={cn(tdCls, "text-slate-500")}>{l.description}</td>
                          <td className={cn(tdCls, "text-right")}>{l.ordered}</td>
                          <td className={cn(tdCls, "text-right font-medium text-amber-700")}>{l.pending}</td>
                          <td className={cn(tdCls, "text-right", l.picked ? "text-slate-700" : "text-slate-300")}>{l.picked}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <Field label={config.remarkLabel}>
          <input className={inputCls} maxLength={500} value={remark} onChange={(e) => setRemark(e.target.value)} />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button
          variant="destructive"
          className="gap-1.5"
          disabled={!chosen.length || remark.trim().length < 3 || cancel.isPending}
          onClick={() => setConfirming(true)}
        >
          <Ban className="size-4" /> Cancel {chosen.length} line(s)
        </Button>
      </div>

      {confirming && (
        <ModalFame isOpen onClose={() => setConfirming(false)} title={`Cancel ${chosen.length} line(s)`}>
          <div className="grid gap-4">
            <p className="text-sm text-slate-600">
              {units} unit(s) on {orders.filter((o) => o.lines.some((l) => selected.includes(l.id))).length}{" "}
              {config.document.toLowerCase()}(s) will be cancelled: {remark.trim()}. Picked stock on these lines goes back to free
              stock. A {config.document.toLowerCase()} with nothing left closes. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Close
              </Button>
              <Button variant="destructive" disabled={cancel.isPending} onClick={submit}>
                {cancel.isPending ? "Cancelling…" : "Cancel lines"}
              </Button>
            </div>
          </div>
        </ModalFame>
      )}
    </div>
  );
}
