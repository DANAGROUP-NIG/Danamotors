"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { NumberInput } from "@/components/forms/NumberInput";
import { PageHeader } from "@/components/headers/page-header";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { PartPicker, type PartSearchQuery } from "@/features/stock-transfers/components/PartPicker";
import type { PartSearchResult } from "@/features/stock-transfers/types/indent.types";
import { CustomerPicker, type CustomerSearchQuery } from "@/features/part-sale/components/CustomerPicker";
import { fmtCurrency } from "@/features/part-sale/lib/part-sale-format";
import type { CustomerSearchResult } from "@/features/part-sale/types/part-sale.types";
import { cn } from "@/lib/utils";
import { challanKeys, searchChallanPartsRequest, searchCostCentresRequest } from "../api/challan.api";
import { useCreateChallan } from "../hooks/use-challans";

type DraftLine = { part: PartSearchResult; quantity: number | null };

const costCentreSearch: CustomerSearchQuery = (search) => ({
  queryKey: challanKeys.costCentres(search),
  queryFn: () => searchCostCentresRequest(search),
});

/** Legacy Dispatch Challan: issue fuel and consumables to a cost centre, unbilled. */
export function ChallanCreateForm() {
  const router = useRouter();
  const create = useCreateChallan();
  const branches = useBranchStore((s) => s.branches);
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const crossBranch = isSuperAdmin || hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);

  const [branchId, setBranchId] = useState("");
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Challans are issued from the user's own store.
  useEffect(() => {
    if (!branchId && user?.branchId) setBranchId(user.branchId);
  }, [branchId, user?.branchId]);

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "Your branch";
  const partSearch: PartSearchQuery = (search) => ({
    queryKey: challanKeys.parts(search, branchId),
    queryFn: () => searchChallanPartsRequest(search, branchId),
  });

  const totals = useMemo(
    () =>
      lines.reduce(
        (t, l) => ({ qty: t.qty + (l.quantity ?? 0), amount: t.amount + (l.quantity ?? 0) * (l.part.retailRate ?? 0) }),
        { qty: 0, amount: 0 },
      ),
    [lines],
  );

  function addPart(part: PartSearchResult) {
    if (lines.some((l) => l.part.id === part.id)) {
      setErrors({ lines: `${part.partNumber} is already on the challan. Change its quantity instead.` });
      return;
    }
    setErrors({});
    setLines((prev) => [...prev, { part, quantity: null }]);
  }

  function submit() {
    const e: Record<string, string> = {};
    if (!branchId) e.branchId = "Select the issuing branch";
    if (!customer) e.customer = "Select the cost centre";
    if (lines.length === 0) e.lines = "Add at least one part";
    for (const l of lines) {
      const q = l.quantity ?? 0;
      if (!Number.isInteger(q) || q <= 0) e[l.part.id] = "Enter a whole quantity above zero";
      else if (q > l.part.sourceAvailable) e[l.part.id] = `Only ${Math.max(0, l.part.sourceAvailable)} free in stock`;
      if (l.part.retailRate == null) e[l.part.id] = "This part has no retail rate. Set it in Part Master first.";
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    create.mutate(
      {
        branchId,
        customerId: customer!.id,
        remarks: remarks.trim() || undefined,
        lines: lines.map((l) => ({ partId: l.part.id, quantity: l.quantity! })),
      },
      { onSuccess: (challan) => router.push(`/part-sale/challans/${challan.id}`) },
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <Link href="/part-sale/challans" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Dispatch Challans
      </Link>
      <PageHeader
        title="New dispatch challan"
        description="Issue fuel and consumables to a cost centre. Stock goes out at the retail rate, with a gate pass. Challans are never billed."
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Cost centre" error={errors.customer}>
            <CustomerPicker
              value={customer}
              onChange={setCustomer}
              searchQuery={costCentreSearch}
              placeholder="Search cost centre code or name, e.g. ALLEN 5…"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Issuing branch" error={errors.branchId}>
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
            <Field label="Remarks (optional)">
              <input
                className={inputCls}
                maxLength={500}
                placeholder="e.g. Gen set 350KVA, vehicle KJA 123 AB"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </Field>
          </div>
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
              searchQuery={partSearch}
              placeholder={branchId ? "Add a part: search number or name, e.g. PETROL…" : "Choose the issuing branch first…"}
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
                  const qty = l.quantity ?? 0;
                  return (
                    <tr key={l.part.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2">
                        <p className="font-mono font-medium">{l.part.partNumber}</p>
                        <p className="text-slate-500">{l.part.name}</p>
                        {errors[l.part.id] && <p className="text-red-500">{errors[l.part.id]}</p>}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{l.part.uom}</td>
                      <td className={cn("px-3 py-2 text-right", qty > l.part.sourceAvailable ? "text-red-600" : "text-slate-500")}>
                        {l.part.sourceAvailable}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <NumberInput
                          min={1}
                          step={1}
                          autoFocus
                          aria-label={`Quantity of ${l.part.partNumber}`}
                          className={cn(inputCls, "ml-auto h-9 w-24 text-right")}
                          value={l.quantity}
                          onValueChange={(v) => setLines((prev) => prev.map((x) => (x.part.id === l.part.id ? { ...x, quantity: v } : x)))}
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          {lines.length} {lines.length === 1 ? "line" : "lines"} · {totals.qty} units ·{" "}
          <span className="font-semibold text-slate-800">{fmtCurrency(totals.amount)}</span>
        </p>
        <Button type="button" disabled={create.isPending} onClick={submit}>
          {create.isPending ? "Issuing…" : "Issue challan"}
        </Button>
      </div>
    </div>
  );
}
