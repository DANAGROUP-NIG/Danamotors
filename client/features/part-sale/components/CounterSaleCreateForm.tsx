"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { NumberInput } from "@/components/forms/NumberInput";
import { PageHeader } from "@/components/headers/page-header";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { PartPicker, type PartSearchQuery } from "@/features/stock-transfers/components/PartPicker";
import type { PartSearchResult } from "@/features/stock-transfers/types/indent.types";
import { CustomerPicker } from "./CustomerPicker";
import { getOrderRequest, partSaleKeys, searchSalePartsRequest } from "../api/part-sale.api";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCreateCounterSale, useCustomerOrder, useCustomerOrders, useHandlingRates, useSalesExecutives } from "../hooks/use-part-sale";
import {
  TAX_FORM_LABELS,
  TRANSPORT_MODE_LABELS,
  billableQuantity,
  customerName,
  fmtCurrency,
  fmtDate,
  isCpd,
  lineVatPercent,
  previewSale,
} from "../lib/part-sale-format";
import type { CustomerOrder, CustomerOrderLine, SaleCustomer, SaleTaxForm, TransportMode } from "../types/part-sale.types";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";
const toInt = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

/** Default bill quantity: what is picked, else what free stock covers. */
const defaultQuantity = (l: CustomerOrderLine) =>
  l.pickedQuantity > 0 ? l.pickedQuantity : Math.max(0, Math.min(billableQuantity(l), l.freeStock));

/** A part billed without a CPO (legacy counter sale with no customer order). */
type DirectLine = { part: PartSearchResult; quantity: number | null };

/** Legacy line trade discount % and handling %, as typed; null handling = the category default. */
type Charges = { trade: number | null; handling: number | null };

const directKey = (partId: string) => `p:${partId}`;
const badPercent = (n: number) => !Number.isFinite(n) || n < 0 || n > 100;

export function CounterSaleCreateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const startOrderId = params.get("orderId") ?? "";
  const create = useCreateCounterSale();
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const branches = useBranchStore((s) => s.branches);
  const crossBranch = isSuperAdmin || hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);

  const { data: startOrder } = useCustomerOrder(startOrderId);
  const [customer, setCustomer] = useState<SaleCustomer | null>(null);
  const [branchId, setBranchId] = useState("");
  const [taxForm, setTaxForm] = useState<SaleTaxForm>("VAT_SALE");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [direct, setDirect] = useState<DirectLine[]>([]);
  // Legacy bill "Handling" box: on, each line defaults to its category's handling % at the branch.
  const [chargeHandling, setChargeHandling] = useState(true);
  const [charges, setCharges] = useState<Record<string, Charges>>({});
  const [discountMode, setDiscountMode] = useState<"percent" | "amount">("percent");
  const [discount, setDiscount] = useState("0");
  const [transportMode, setTransportMode] = useState<TransportMode | "">("");
  const [transporter, setTransporter] = useState("");
  const [grNumber, setGrNumber] = useState("");
  const [grDate, setGrDate] = useState("");
  const [numberOfCases, setNumberOfCases] = useState("");
  const [notes, setNotes] = useState("");
  // "" = the user who bills (the server's default), as legacy CPD usually recorded the store clerk.
  const [salesExecutiveId, setSalesExecutiveId] = useState("");
  const [error, setError] = useState("");

  // Opened from a CPO: bill that customer at the CPO's branch, with its lines ticked.
  useEffect(() => {
    if (startOrder && !customer) {
      setCustomer(startOrder.customer);
      setBranchId(startOrder.branchId);
    }
  }, [startOrder, customer]);

  // Otherwise the user's own branch; cross-branch users default to CPD, where part sale mostly runs.
  useEffect(() => {
    if (branchId || startOrderId || branches.length === 0) return;
    setBranchId(crossBranch ? (branches.find(isCpd)?.id ?? user?.branchId ?? "") : (user?.branchId ?? ""));
  }, [branches, branchId, crossBranch, startOrderId, user?.branchId]);

  const { data: orderList, isLoading: listLoading } = useCustomerOrders(
    { customerId: customer?.id, billable: true },
    !!customer,
  );
  const orderQueries = useQueries({
    queries: (orderList ?? []).map((o) => ({ queryKey: partSaleKeys.order(o.id), queryFn: () => getOrderRequest(o.id) })),
  });
  const orders = orderQueries.map((q) => q.data).filter(Boolean) as CustomerOrder[];
  const loadingOrders = listLoading || orderQueries.some((q) => q.isLoading);

  // Tick lines and fill default quantities as orders load.
  const loadedKey = orders.map((o) => o.id).join(",");
  useEffect(() => {
    const quantities: Record<string, string> = {};
    const ticks: Record<string, boolean> = {};
    for (const order of orders) {
      for (const line of order.lines) {
        if (billableQuantity(line) <= 0 || line.id in qty) continue;
        const q = defaultQuantity(line);
        quantities[line.id] = String(q);
        ticks[line.id] = q > 0 && (!startOrderId || order.id === startOrderId);
      }
    }
    if (Object.keys(quantities).length === 0) return;
    setQty((prev) => ({ ...prev, ...quantities }));
    setSelected((prev) => ({ ...prev, ...ticks }));
    // Runs when a new set of orders has loaded; quantities already filled are kept.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey, startOrderId]);

  // One selling branch per bill: only that branch's open order lines can go on it.
  const allRows = orders.flatMap((order) =>
    order.lines.filter((l) => billableQuantity(l) > 0).map((line) => ({ order, line })),
  );
  const rows = allRows.filter((r) => r.order.branchId === branchId);
  const elsewhere = allRows.length - rows.length;
  const chosen = rows.filter((r) => selected[r.line.id]);
  const lineCount = chosen.length + direct.length;

  const { data: executives = [] } = useSalesExecutives(branchId);
  const others = executives.filter((e) => e.id !== user?.id);
  // A choice from another branch's list no longer applies once the branch changes.
  const executiveId = others.some((e) => e.id === salesExecutiveId) ? salesExecutiveId : "";

  const { data: handlingRates = {} } = useHandlingRates(branchId);
  const tradeOf = (key: string) => charges[key]?.trade ?? 0;
  const handlingOf = (key: string, priceCategoryCode?: string | null) =>
    !chargeHandling ? 0 : (charges[key]?.handling ?? handlingRates[priceCategoryCode ?? ""] ?? 0);
  const setCharge = (key: string, change: Partial<Charges>) =>
    setCharges((prev) => ({ ...prev, [key]: { trade: prev[key]?.trade ?? null, handling: prev[key]?.handling ?? null, ...change } }));

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "Your branch";
  const partSearch: PartSearchQuery = (search) => ({
    queryKey: partSaleKeys.parts(search, branchId),
    queryFn: () => searchSalePartsRequest(search, branchId),
  });

  const preview = useMemo(() => {
    const lines = [
      ...chosen.map((r) => ({
        quantity: toInt(qty[r.line.id] ?? "0") || 0,
        rate: r.line.retailRate,
        vatPercent: lineVatPercent(taxForm, r.line.part.taxable),
        tradeDiscountPercent: tradeOf(r.line.id),
        handlingPercent: handlingOf(r.line.id, r.line.part.priceCategoryCode),
      })),
      ...direct.map((d) => ({
        quantity: d.quantity ?? 0,
        rate: d.part.retailRate ?? 0,
        vatPercent: lineVatPercent(taxForm, d.part.taxable),
        tradeDiscountPercent: tradeOf(directKey(d.part.id)),
        handlingPercent: handlingOf(directKey(d.part.id), d.part.priceCategoryCode),
      })),
    ].map((l) => ({ ...l, tradeDiscountPercent: badPercent(l.tradeDiscountPercent) ? 0 : l.tradeDiscountPercent, handlingPercent: badPercent(l.handlingPercent) ? 0 : l.handlingPercent }));
    // A cash discount amount is a % of the value after the trade discount (legacy CashDiscAmtorPer).
    const base = previewSale(lines, 0);
    const afterTrade = base.gross - base.tradeDiscount;
    const value = Number(discount) || 0;
    const percent = discountMode === "percent" ? value : afterTrade > 0 ? (value / afterTrade) * 100 : 0;
    return { ...previewSale(lines, Math.min(100, Math.max(0, percent))), percent, afterTrade };
    // tradeOf/handlingOf read charges, handlingRates and chargeHandling, listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, direct, qty, discount, discountMode, taxForm, charges, handlingRates, chargeHandling]);

  function lineProblem(line: CustomerOrderLine) {
    const q = toInt(qty[line.id] ?? "");
    if (!Number.isFinite(q) || q <= 0) return "Enter a whole quantity";
    if (q > billableQuantity(line)) return `Only ${billableQuantity(line)} left on the order`;
    if (q > line.pickedQuantity + Math.max(0, line.freeStock)) return `Only ${line.pickedQuantity + Math.max(0, line.freeStock)} picked or free`;
    return "";
  }

  function directProblem(d: DirectLine) {
    const q = d.quantity ?? 0;
    if (d.part.retailRate == null) return "No retail rate. Set it in Part Master first.";
    if (!Number.isInteger(q) || q <= 0) return "Enter a whole quantity";
    if (q > d.part.sourceAvailable) return `Only ${Math.max(0, d.part.sourceAvailable)} free in stock`;
    return "";
  }

  /** Trade discount % and handling % inputs for one bill line. */
  function chargeCells(key: string, partNumber: string, priceCategoryCode: string | null | undefined, disabled: boolean) {
    const defaultHandling = chargeHandling ? (handlingRates[priceCategoryCode ?? ""] ?? 0) : 0;
    const percentCls = cn(inputCls, "ml-auto h-9 w-16 text-right");
    return (
      <>
        <td className={cn(tdCls, "text-right")}>
          <NumberInput
            min={0}
            max={100}
            step="0.01"
            placeholder="0"
            disabled={disabled}
            aria-label={`Trade discount % on ${partNumber}`}
            className={cn(percentCls, badPercent(tradeOf(key)) && "border-red-400")}
            value={charges[key]?.trade ?? null}
            onValueChange={(v) => setCharge(key, { trade: v })}
          />
        </td>
        <td className={cn(tdCls, "text-right")}>
          <NumberInput
            min={0}
            max={100}
            step="0.01"
            placeholder={String(defaultHandling)}
            disabled={disabled || !chargeHandling}
            aria-label={`Handling % on ${partNumber}`}
            className={cn(percentCls, badPercent(handlingOf(key, priceCategoryCode)) && "border-red-400")}
            value={chargeHandling ? (charges[key]?.handling ?? null) : null}
            onValueChange={(v) => setCharge(key, { handling: v })}
          />
        </td>
      </>
    );
  }

  function addPart(part: PartSearchResult) {
    setError("");
    if (direct.some((d) => d.part.id === part.id)) return setError(`${part.partNumber} is already on the bill. Change its quantity instead.`);
    setDirect((prev) => [...prev, { part, quantity: null }]);
  }

  function changeBranch(id: string) {
    setBranchId(id);
    setDirect([]);
    setSalesExecutiveId("");
  }

  function submit() {
    setError("");
    if (!customer) return setError("Select the customer.");
    if (!branchId) return setError("Select the selling branch.");
    if (lineCount === 0) return setError("Tick an order line or add a part to bill.");
    if (chosen.some((r) => lineProblem(r.line)) || direct.some((d) => directProblem(d))) return setError("Fix the highlighted lines.");
    const keys = [
      ...chosen.map((r) => ({ key: r.line.id, category: r.line.part.priceCategoryCode })),
      ...direct.map((d) => ({ key: directKey(d.part.id), category: d.part.priceCategoryCode })),
    ];
    if (keys.some(({ key, category }) => badPercent(tradeOf(key)) || badPercent(handlingOf(key, category)))) {
      return setError("Trade discount and handling must be between 0 and 100%.");
    }
    const value = Number(discount) || 0;
    if (value < 0 || (discountMode === "percent" && value > 100)) return setError("Enter a cash discount between 0 and 100%.");
    if (discountMode === "amount" && value > preview.afterTrade) return setError("The cash discount cannot exceed the bill value after trade discount.");
    create.mutate(
      {
        branchId,
        customerId: customer.id,
        taxForm,
        salesExecutiveId: executiveId || undefined,
        ...(discountMode === "percent" ? { cashDiscountPercent: value } : { cashDiscountAmount: value }),
        transportMode: transportMode || undefined,
        transporter: transporter.trim() || undefined,
        grNumber: grNumber.trim() || undefined,
        grDate: grDate || undefined,
        numberOfCases: numberOfCases ? Number(numberOfCases) : undefined,
        notes: notes.trim() || undefined,
        lines: chosen.map((r) => ({
          orderLineId: r.line.id,
          quantity: toInt(qty[r.line.id]),
          tradeDiscountPercent: tradeOf(r.line.id),
          handlingPercent: handlingOf(r.line.id, r.line.part.priceCategoryCode),
        })),
        parts: direct.map((d) => ({
          partId: d.part.id,
          quantity: d.quantity!,
          tradeDiscountPercent: tradeOf(directKey(d.part.id)),
          handlingPercent: handlingOf(directKey(d.part.id), d.part.priceCategoryCode),
        })),
      },
      { onSuccess: (sale) => router.push(`/part-sale/counter-sales/${sale.id}`) },
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <Link href="/part-sale/counter-sales" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Counter Sales
      </Link>
      <PageHeader
        title="New counter sale"
        description="Bill a customer's open CPO lines (picked units first, then free stock), parts without an order, or both."
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <Field label="Customer">
              <CustomerPicker
                value={customer}
                onChange={(c) => {
                  setCustomer(c);
                  setQty({});
                  setSelected({});
                }}
                disabled={!!startOrderId && !!startOrder}
              />
            </Field>
            <Field label="Remarks (optional)">
              <input className={inputCls} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Selling branch">
              {crossBranch ? (
                <select
                  className={inputCls}
                  value={branchId}
                  disabled={(!!startOrderId && !!startOrder) || direct.length > 0}
                  onChange={(e) => changeBranch(e.target.value)}
                >
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
            <Field label="Tax type">
              <select className={inputCls} value={taxForm} onChange={(e) => setTaxForm(e.target.value as SaleTaxForm)}>
                {Object.entries(TAX_FORM_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Handling">
              <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="size-4" checked={chargeHandling} onChange={(e) => setChargeHandling(e.target.checked)} />
                Charge handling (category % at this branch)
              </label>
            </Field>
            <Field label="Cash discount">
              <div className="flex gap-2">
                <select
                  className={cn(inputCls, "w-28")}
                  value={discountMode}
                  onChange={(e) => setDiscountMode(e.target.value as "percent" | "amount")}
                >
                  <option value="percent">%</option>
                  <option value="amount">Amount</option>
                </select>
                <NumberInput min={0} className={inputCls} value={discount === "" ? null : Number(discount)} onValueChange={(v) => setDiscount(v == null ? "" : String(v))} />
              </div>
            </Field>
            <Field label="Sales executive">
              <select className={inputCls} value={executiveId} onChange={(e) => setSalesExecutiveId(e.target.value)}>
                <option value="">{user ? `${user.firstName} ${user.lastName} (me)` : "Me"}</option>
                {others.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Despatch mode">
              <select className={inputCls} value={transportMode} onChange={(e) => setTransportMode(e.target.value as TransportMode | "")}>
                <option value="">Not set</option>
                {Object.entries(TRANSPORT_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Transporter (optional)">
              <input className={inputCls} maxLength={100} value={transporter} onChange={(e) => setTransporter(e.target.value)} />
            </Field>
            <Field label="No. of cases (optional)">
              <NumberInput min={0} className={inputCls} value={numberOfCases === "" ? null : Number(numberOfCases)} onValueChange={(v) => setNumberOfCases(v == null ? "" : String(v))} />
            </Field>
            <Field label="GR no. (optional)">
              <input className={inputCls} maxLength={40} value={grNumber} onChange={(e) => setGrNumber(e.target.value)} />
            </Field>
            <Field label="GR date">
              <input type="date" className={inputCls} value={grDate} onChange={(e) => setGrDate(e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="mb-4 text-sm font-semibold text-slate-700">Open order lines</p>
        {!customer ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-muted-foreground">
            Choose a customer to see their open orders.
          </p>
        ) : loadingOrders ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-slate-400" />
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-muted-foreground">
            {customerName(customer)} has no open orders at {branchName}. Add parts below to bill without an order.
            {elsewhere > 0 && ` (${elsewhere} open order line(s) at other branches: change the selling branch to bill them.)`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            {elsewhere > 0 && (
              <p className="mb-2 text-sm text-slate-500">
                {elsewhere} open order line(s) at other branches are not shown. Change the selling branch to bill them.
              </p>
            )}
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls} />
                  <th className={thCls}>CPO</th>
                  <th className={thCls}>Part</th>
                  <th className={cn(thCls, "text-right")}>Left to bill</th>
                  <th className={cn(thCls, "text-right")}>Picked</th>
                  <th className={cn(thCls, "text-right")}>Free stock</th>
                  <th className={cn(thCls, "text-right")}>Bill qty</th>
                  <th className={cn(thCls, "text-right")}>Rate</th>
                  <th className={cn(thCls, "text-right")} title="Trade discount % (legacy line discount)">Disc %</th>
                  <th className={cn(thCls, "text-right")} title="Handling % (category default at this branch)">Hdl %</th>
                  <th className={cn(thCls, "text-right")}>VAT</th>
                  <th className={cn(thCls, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ order, line }) => {
                  const on = !!selected[line.id];
                  const problem = on ? lineProblem(line) : "";
                  const q = toInt(qty[line.id] ?? "0") || 0;
                  const vat = lineVatPercent(taxForm, line.part.taxable);
                  return (
                    <tr key={line.id} className={cn("border-t border-slate-100", !on && "text-slate-400")}>
                      <td className={tdCls}>
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={on}
                          onChange={(e) => setSelected((prev) => ({ ...prev, [line.id]: e.target.checked }))}
                          aria-label={`Bill ${line.part.partNumber}`}
                        />
                      </td>
                      <td className={tdCls}>
                        <Link href={`/part-sale/orders/${order.id}`} className="font-mono hover:underline">
                          {order.cpoNumber}
                        </Link>
                        <span className="block text-xs text-slate-400">{fmtDate(order.orderDate)}</span>
                      </td>
                      <td className={tdCls}>
                        <p className="font-mono font-medium">{line.part.partNumber}</p>
                        <p className="max-w-56 truncate text-slate-500">{line.part.name}</p>
                        {problem && <p className="text-red-500">{problem}</p>}
                      </td>
                      <td className={cn(tdCls, "text-right")}>{billableQuantity(line)}</td>
                      <td className={cn(tdCls, "text-right")}>{line.pickedQuantity}</td>
                      <td className={cn(tdCls, "text-right")}>{line.freeStock}</td>
                      <td className={cn(tdCls, "text-right")}>
                        <NumberInput
                          min={0}
                          disabled={!on}
                          className={cn(inputCls, "ml-auto h-9 w-20 text-right", problem && "border-red-400")}
                          value={qty[line.id] ? Number(qty[line.id]) : null}
                          onValueChange={(v) => setQty((prev) => ({ ...prev, [line.id]: v == null ? "" : String(v) }))}
                        />
                      </td>
                      <td className={cn(tdCls, "text-right")}>{fmtCurrency(line.retailRate)}</td>
                      {chargeCells(line.id, line.part.partNumber, line.part.priceCategoryCode, !on)}
                      <td className={cn(tdCls, "text-right")}>{vat ? `${vat}%` : "—"}</td>
                      <td className={cn(tdCls, "text-right font-medium")}>{fmtCurrency(on ? q * line.retailRate : 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Package className="size-4" /> Parts without an order
          </div>
          <div className="w-full sm:w-96">
            <PartPicker
              onSelect={addPart}
              disabled={!branchId || !customer}
              searchQuery={partSearch}
              placeholder={!customer ? "Choose the customer first…" : branchId ? "Add a part: search number or name…" : "Choose the selling branch first…"}
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
        {direct.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-muted-foreground">
            None. Search above to bill a part that is not on an order, at its Part Master retail rate.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Part</th>
                  <th className={thCls}>UOM</th>
                  <th className={cn(thCls, "text-right")}>Free stock</th>
                  <th className={cn(thCls, "text-right")}>Bill qty</th>
                  <th className={cn(thCls, "text-right")}>Rate</th>
                  <th className={cn(thCls, "text-right")} title="Trade discount % (legacy line discount)">Disc %</th>
                  <th className={cn(thCls, "text-right")} title="Handling % (category default at this branch)">Hdl %</th>
                  <th className={cn(thCls, "text-right")}>VAT</th>
                  <th className={cn(thCls, "text-right")}>Amount</th>
                  <th className={thCls} />
                </tr>
              </thead>
              <tbody>
                {direct.map((d) => {
                  const problem = d.quantity == null ? "" : directProblem(d);
                  const vat = lineVatPercent(taxForm, d.part.taxable);
                  return (
                    <tr key={d.part.id} className="border-t border-slate-100 align-top">
                      <td className={tdCls}>
                        <p className="font-mono font-medium">{d.part.partNumber}</p>
                        <p className="max-w-56 truncate text-slate-500">{d.part.name}</p>
                        {problem && <p className="text-red-500">{problem}</p>}
                      </td>
                      <td className={cn(tdCls, "text-slate-500")}>{d.part.uom}</td>
                      <td className={cn(tdCls, "text-right text-slate-500")}>{d.part.sourceAvailable}</td>
                      <td className={cn(tdCls, "text-right")}>
                        <NumberInput
                          min={1}
                          step={1}
                          autoFocus
                          aria-label={`Quantity of ${d.part.partNumber}`}
                          className={cn(inputCls, "ml-auto h-9 w-20 text-right", problem && "border-red-400")}
                          value={d.quantity}
                          onValueChange={(v) => setDirect((prev) => prev.map((x) => (x.part.id === d.part.id ? { ...x, quantity: v } : x)))}
                        />
                      </td>
                      <td className={cn(tdCls, "text-right")}>{d.part.retailRate != null ? fmtCurrency(d.part.retailRate) : "—"}</td>
                      {chargeCells(directKey(d.part.id), d.part.partNumber, d.part.priceCategoryCode, false)}
                      <td className={cn(tdCls, "text-right")}>{vat ? `${vat}%` : "—"}</td>
                      <td className={cn(tdCls, "text-right font-medium")}>{fmtCurrency((d.quantity ?? 0) * (d.part.retailRate ?? 0))}</td>
                      <td className={cn(tdCls, "text-right")}>
                        <button
                          type="button"
                          onClick={() => setDirect((prev) => prev.filter((x) => x.part.id !== d.part.id))}
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

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4 lg:grid-cols-7">
          <div>
            <dt className="text-slate-400">Gross</dt>
            <dd className="font-medium">{fmtCurrency(preview.gross)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Trade discount</dt>
            <dd className="font-medium">− {fmtCurrency(preview.tradeDiscount)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Cash discount ({Number(preview.percent.toFixed(4))}%)</dt>
            <dd className="font-medium">− {fmtCurrency(preview.discount)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Handling</dt>
            <dd className="font-medium">{fmtCurrency(preview.handling)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">VAT{taxForm === "TRANSFER_WITHOUT_VAT" ? " (none: transfer)" : ""}</dt>
            <dd className="font-medium">{fmtCurrency(preview.vat)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Round off</dt>
            <dd className="font-medium">{fmtCurrency(preview.roundOff)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Net amount</dt>
            <dd className="text-lg font-semibold text-slate-800">{fmtCurrency(preview.total)}</dd>
          </div>
        </dl>
        <div className="flex flex-col items-end gap-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="button" disabled={create.isPending || lineCount === 0} onClick={submit}>
            {create.isPending ? "Billing…" : `Create bill (${lineCount} ${lineCount === 1 ? "line" : "lines"})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
