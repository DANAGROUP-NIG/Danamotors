"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { PageHeader } from "@/components/headers/page-header";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { PartPicker, type PartSearchQuery } from "@/features/stock-transfers/components/PartPicker";
import type { PartSearchResult } from "@/features/stock-transfers/types/indent.types";
import { cn } from "@/lib/utils";
import { CustomerPicker } from "./CustomerPicker";
import { partSaleKeys, searchSalePartsRequest } from "../api/part-sale.api";
import { useCreateOrder } from "../hooks/use-part-sale";
import { fmtCurrency, isCpd } from "../lib/part-sale-format";
import type { CustomerSearchResult } from "../types/part-sale.types";

type DraftLine = { part: PartSearchResult; quantity: string };

const toInt = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const inThreeMonths = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return isoDate(d);
};

export function OrderCreateForm() {
  const router = useRouter();
  const create = useCreateOrder();
  const branches = useBranchStore((s) => s.branches);
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const crossBranch = isSuperAdmin || hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);

  const [branchId, setBranchId] = useState("");
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [customerRefNo, setCustomerRefNo] = useState("");
  const [customerRefDate, setCustomerRefDate] = useState(isoDate(new Date()));
  const [validTill, setValidTill] = useState(inThreeMonths());
  const [remarks, setRemarks] = useState("");
  const [pick, setPick] = useState(true);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Part sale runs at CPD; default to it, else to the user's own branch.
  useEffect(() => {
    if (branchId || branches.length === 0) return;
    setBranchId(crossBranch ? (branches.find(isCpd)?.id ?? user?.branchId ?? "") : (user?.branchId ?? ""));
  }, [branches, branchId, crossBranch, user?.branchId]);

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "Your branch";
  const searchQuery: PartSearchQuery = (search) => ({
    queryKey: partSaleKeys.parts(search, branchId),
    queryFn: () => searchSalePartsRequest(search, branchId),
  });

  const totals = useMemo(
    () =>
      lines.reduce(
        (t, l) => ({ qty: t.qty + toInt(l.quantity), amount: t.amount + toInt(l.quantity) * (l.part.retailRate ?? 0) }),
        { qty: 0, amount: 0 },
      ),
    [lines],
  );

  function addPart(part: PartSearchResult) {
    if (lines.some((l) => l.part.id === part.id)) {
      setErrors({ lines: `${part.partNumber} is already on the order. Change its quantity instead.` });
      return;
    }
    setErrors({});
    setLines((prev) => [...prev, { part, quantity: "1" }]);
  }

  function submit() {
    const e: Record<string, string> = {};
    if (!branchId) e.branchId = "Select the selling branch";
    if (!customer) e.customer = "Select the customer";
    if (lines.length === 0) e.lines = "Add at least one part";
    for (const l of lines) {
      if (!toInt(l.quantity)) e[l.part.id] = "Enter a whole quantity above zero";
      if (l.part.retailRate == null) e[l.part.id] = "This part has no retail rate. Set it in Part Master first.";
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    create.mutate(
      {
        branchId,
        customerId: customer!.id,
        customerRefNo: customerRefNo.trim() || undefined,
        customerRefDate: customerRefDate || undefined,
        validTill: validTill || undefined,
        remarks: remarks.trim() || undefined,
        pick,
        lines: lines.map((l) => ({ partId: l.part.id, quantity: toInt(l.quantity) })),
      },
      { onSuccess: (order) => router.push(`/part-sale/orders/${order.id}`) },
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <Link href="/part-sale/orders" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Customer Orders
      </Link>
      <PageHeader
        title="New customer purchase order"
        description="Rates come from the Part Master retail rate. Free stock can be picked for the order straight away."
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Customer" error={errors.customer}>
            <CustomerPicker value={customer} onChange={setCustomer} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Selling branch" error={errors.branchId}>
              {crossBranch ? (
                <select className={inputCls} value={branchId} disabled={lines.length > 0} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">Select branch</option>
                  {branches
                    .filter((b) => b.isActive !== false)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              ) : (
                <input className={inputCls} readOnly value={branchName} />
              )}
            </Field>
            <Field label="Customer ref. no. (optional)">
              <input
                className={inputCls}
                placeholder="e.g. Mail order dated 15.04.2026"
                maxLength={60}
                value={customerRefNo}
                onChange={(e) => setCustomerRefNo(e.target.value)}
              />
            </Field>
            <Field label="Customer ref. date">
              <input type="date" className={inputCls} value={customerRefDate} onChange={(e) => setCustomerRefDate(e.target.value)} />
            </Field>
            <Field label="Valid till">
              <input type="date" className={inputCls} value={validTill} onChange={(e) => setValidTill(e.target.value)} />
            </Field>
          </div>
          <Field label="Remarks (optional)">
            <input className={inputCls} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4" checked={pick} onChange={(e) => setPick(e.target.checked)} />
            Pick free stock for this order now
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Package className="size-4" /> Parts
          </div>
          <div className="w-full sm:w-96">
            <PartPicker
              onSelect={addPart}
              disabled={!branchId}
              searchQuery={searchQuery}
              placeholder={branchId ? "Add a part: search number or name…" : "Choose the selling branch first…"}
              renderMeta={(part) => (
                <>
                  <span className={cn("block font-medium", part.sourceAvailable > 0 ? "text-emerald-700" : "text-red-600")}>
                    {part.sourceAvailable} free
                  </span>
                  <span className="block text-muted-foreground">
                    {part.retailRate != null ? fmtCurrency(part.retailRate) : "No retail rate"}
                  </span>
                </>
              )}
            />
          </div>
        </div>
        {errors.lines && <p className="mb-3 text-sm text-red-500">{errors.lines}</p>}

        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-muted-foreground">
            No parts yet. Search above to add the first one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-sm font-medium uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-2">Part</th>
                  <th className="px-3 py-2">UOM</th>
                  <th className="px-3 py-2 text-right">Free stock</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const qty = toInt(l.quantity);
                  return (
                    <tr key={l.part.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2">
                        <p className="font-mono font-medium">{l.part.partNumber}</p>
                        <p className="text-slate-500">{l.part.name}</p>
                        {errors[l.part.id] && <p className="text-red-500">{errors[l.part.id]}</p>}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{l.part.uom}</td>
                      <td className={cn("px-3 py-2 text-right", qty > l.part.sourceAvailable ? "text-amber-700" : "text-slate-500")}>
                        {l.part.sourceAvailable}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={1}
                          className={cn(inputCls, "ml-auto h-9 w-24 text-right")}
                          value={l.quantity}
                          onChange={(e) =>
                            setLines((prev) => prev.map((x) => (x.part.id === l.part.id ? { ...x, quantity: e.target.value } : x)))
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">{l.part.retailRate != null ? fmtCurrency(l.part.retailRate) : "—"}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtCurrency(qty * (l.part.retailRate ?? 0))}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((x) => x.part.id !== l.part.id))}
                          className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove line"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {lines.length > 0 && pick && lines.some((l) => toInt(l.quantity) > l.part.sourceAvailable) && (
          <p className="mt-3 text-sm text-amber-700">
            Some lines need more than the free stock. What is available will be picked; the rest stays open on the order.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          {lines.length} {lines.length === 1 ? "line" : "lines"} · {totals.qty} units ·{" "}
          <span className="font-semibold text-slate-800">{fmtCurrency(totals.amount)}</span>
        </p>
        <Button type="button" disabled={create.isPending} onClick={submit}>
          {create.isPending ? "Saving…" : pick ? "Save and pick" : "Save CPO"}
        </Button>
      </div>
    </div>
  );
}
