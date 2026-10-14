"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { PageHeader } from "@/components/headers/page-header";
import { cn } from "@/lib/utils";
import { CustomerPicker } from "./CustomerPicker";
import { getOrderRequest, partSaleKeys } from "../api/part-sale.api";
import { useCreateCounterSale, useCustomerOrder, useCustomerOrders } from "../hooks/use-part-sale";
import {
  TRANSPORT_MODE_LABELS,
  VAT_RATE,
  billableQuantity,
  customerName,
  fmtCurrency,
  fmtDate,
  previewSale,
} from "../lib/part-sale-format";
import type { CustomerOrder, CustomerOrderLine, SaleCustomer, TransportMode } from "../types/part-sale.types";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";
const toInt = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

/** Default bill quantity: what is picked, else what free stock covers. */
const defaultQuantity = (l: CustomerOrderLine) =>
  l.pickedQuantity > 0 ? l.pickedQuantity : Math.max(0, Math.min(billableQuantity(l), l.freeStock));

export function CounterSaleCreateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const startOrderId = params.get("orderId") ?? "";
  const create = useCreateCounterSale();

  const { data: startOrder } = useCustomerOrder(startOrderId);
  const [customer, setCustomer] = useState<SaleCustomer | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [discountMode, setDiscountMode] = useState<"percent" | "amount">("percent");
  const [discount, setDiscount] = useState("0");
  const [transportMode, setTransportMode] = useState<TransportMode | "">("");
  const [transporter, setTransporter] = useState("");
  const [grNumber, setGrNumber] = useState("");
  const [grDate, setGrDate] = useState("");
  const [numberOfCases, setNumberOfCases] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  // Opened from a CPO: bill that customer, with the CPO's lines ticked.
  useEffect(() => {
    if (startOrder && !customer) setCustomer(startOrder.customer);
  }, [startOrder, customer]);

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

  const rows = orders.flatMap((order) =>
    order.lines.filter((l) => billableQuantity(l) > 0).map((line) => ({ order, line })),
  );
  const chosen = rows.filter((r) => selected[r.line.id]);
  const branchIds = new Set(chosen.map((r) => r.order.branchId));

  const preview = useMemo(() => {
    const lines = chosen.map((r) => ({
      quantity: toInt(qty[r.line.id] ?? "0") || 0,
      rate: r.line.retailRate,
      vatPercent: r.line.part.taxable ? VAT_RATE : 0,
    }));
    const gross = previewSale(lines, 0).gross;
    const value = Number(discount) || 0;
    const percent = discountMode === "percent" ? value : gross > 0 ? (value / gross) * 100 : 0;
    return { ...previewSale(lines, Math.min(100, Math.max(0, percent))), percent };
  }, [chosen, qty, discount, discountMode]);

  function lineProblem(line: CustomerOrderLine) {
    const q = toInt(qty[line.id] ?? "");
    if (!Number.isFinite(q) || q <= 0) return "Enter a whole quantity";
    if (q > billableQuantity(line)) return `Only ${billableQuantity(line)} left on the order`;
    if (q > line.pickedQuantity + Math.max(0, line.freeStock)) return `Only ${line.pickedQuantity + Math.max(0, line.freeStock)} picked or free`;
    return "";
  }

  function submit() {
    setError("");
    if (!customer) return setError("Select the customer.");
    if (chosen.length === 0) return setError("Tick at least one order line to bill.");
    if (branchIds.size > 1) return setError("Bill lines from one selling branch at a time.");
    if (chosen.some((r) => lineProblem(r.line))) return setError("Fix the highlighted quantities.");
    const value = Number(discount) || 0;
    if (value < 0 || (discountMode === "percent" && value > 100)) return setError("Enter a cash discount between 0 and 100%.");
    if (discountMode === "amount" && value > preview.gross) return setError("The cash discount cannot exceed the bill value.");
    create.mutate(
      {
        branchId: chosen[0].order.branchId,
        customerId: customer.id,
        ...(discountMode === "percent" ? { cashDiscountPercent: value } : { cashDiscountAmount: value }),
        transportMode: transportMode || undefined,
        transporter: transporter.trim() || undefined,
        grNumber: grNumber.trim() || undefined,
        grDate: grDate || undefined,
        numberOfCases: numberOfCases ? Number(numberOfCases) : undefined,
        notes: notes.trim() || undefined,
        lines: chosen.map((r) => ({ orderLineId: r.line.id, quantity: toInt(qty[r.line.id]) })),
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
        description="Bill open CPO lines for one customer. Picked units are issued first, then free stock."
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 lg:grid-cols-2">
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
          <div className="grid gap-4 sm:grid-cols-2">
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
                <input type="number" min={0} className={inputCls} value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
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
              <input type="number" min={0} className={inputCls} value={numberOfCases} onChange={(e) => setNumberOfCases(e.target.value)} />
            </Field>
            <Field label="GR no. (optional)">
              <input className={inputCls} maxLength={40} value={grNumber} onChange={(e) => setGrNumber(e.target.value)} />
            </Field>
            <Field label="GR date">
              <input type="date" className={inputCls} value={grDate} onChange={(e) => setGrDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Remarks (optional)">
            <input className={inputCls} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
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
          <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-muted-foreground">
            {customerName(customer)} has no open orders.{" "}
            <Link href="/part-sale/orders/new" className="text-primary hover:underline">
              Create a CPO
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="overflow-x-auto">
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
                  <th className={cn(thCls, "text-right")}>VAT</th>
                  <th className={cn(thCls, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ order, line }) => {
                  const on = !!selected[line.id];
                  const problem = on ? lineProblem(line) : "";
                  const q = toInt(qty[line.id] ?? "0") || 0;
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
                        <input
                          type="number"
                          min={0}
                          disabled={!on}
                          className={cn(inputCls, "ml-auto h-9 w-20 text-right", problem && "border-red-400")}
                          value={qty[line.id] ?? ""}
                          onChange={(e) => setQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                        />
                      </td>
                      <td className={cn(tdCls, "text-right")}>{fmtCurrency(line.retailRate)}</td>
                      <td className={cn(tdCls, "text-right")}>{line.part.taxable ? `${VAT_RATE}%` : "—"}</td>
                      <td className={cn(tdCls, "text-right font-medium")}>{fmtCurrency(on ? q * line.retailRate : 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
          <div>
            <dt className="text-slate-400">Gross</dt>
            <dd className="font-medium">{fmtCurrency(preview.gross)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Cash discount ({Number(preview.percent.toFixed(4))}%)</dt>
            <dd className="font-medium">− {fmtCurrency(preview.discount)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">VAT</dt>
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
          <Button type="button" disabled={create.isPending || chosen.length === 0} onClick={submit}>
            {create.isPending ? "Billing…" : `Create bill (${chosen.length} ${chosen.length === 1 ? "line" : "lines"})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
