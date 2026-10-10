"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { PageHeader } from "@/components/headers/page-header";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { CustomerPicker } from "@/features/part-sale/components/CustomerPicker";
import type { SaleCustomer } from "@/features/part-sale/types/part-sale.types";
import {
  getReportCatalogRequest,
  getReportLookupsRequest,
  partsReportKeys,
  runReportRequest,
  type ReportColumn,
  type ReportParams,
  type ReportResult,
  type ReportRow,
} from "../api/parts-reports.api";
import { exportReportXlsx } from "../lib/export-report";

const lagosToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
const amount = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos" });

/** Formats a cell the way the legacy registers print it. */
export function formatCell(column: ReportColumn, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  switch (column.type) {
    case "money":
      return amount.format(Number(value));
    case "qty":
      return whole.format(Number(value));
    case "percent":
      return `${amount.format(Number(value))}%`;
    case "date":
      return dayFmt.format(new Date(String(value)));
    default:
      return String(value);
  }
}

const numeric = (c: ReportColumn) => c.type === "money" || c.type === "qty" || c.type === "percent";

function subtotal(rows: ReportRow[], columns: ReportColumn[]) {
  return Object.fromEntries(
    columns.filter((c) => c.total).map((c) => [c.key, rows.reduce((s, r) => s + (r.status === "Cancelled" ? 0 : Number(r[c.key] ?? 0)), 0)]),
  );
}

export function PartsReportView({ kind }: { kind: string }) {
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const crossBranch = isSuperAdmin || hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);
  const branches = useBranchStore((s) => s.branches);
  const activeBranch = useBranchStore((s) => s.activeBranch?.id);
  const catalog = useQuery({ queryKey: partsReportKeys.catalog(), queryFn: getReportCatalogRequest });
  const lookups = useQuery({ queryKey: partsReportKeys.lookups(), queryFn: getReportLookupsRequest, staleTime: 60_000 });
  const definition = catalog.data?.find((r) => r.kind === kind);

  const [params, setParams] = useState<ReportParams>(() => ({
    from: `${lagosToday().slice(0, 4)}-01-01`,
    to: lagosToday(),
    branchId: crossBranch ? (activeBranch ?? "") : undefined,
    includeReturns: true,
  }));
  const [customer, setCustomer] = useState<SaleCustomer | null>(null);
  const [applied, setApplied] = useState<ReportParams | null>(null);
  const set = (patch: Partial<ReportParams>) => setParams((p) => ({ ...p, ...patch }));
  const option = params.option ?? definition?.options?.[0]?.value;

  const report = useQuery({
    queryKey: partsReportKeys.run(kind, applied ?? params),
    queryFn: () => runReportRequest(kind, applied!),
    enabled: !!applied,
  });
  const result = report.data;
  const has = (key: Parameters<NonNullable<typeof definition>["filters"]["includes"]>[0]) => !!definition?.filters.includes(key);
  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name;
  const scopeLabel = crossBranch
    ? branchName(applied?.branchId) ?? "All branches"
    : branchName(user?.branchId ?? undefined) ?? "Your branch";

  function run(event: React.FormEvent) {
    event.preventDefault();
    if (!params.from || !params.to || params.from > params.to) return;
    setApplied({ ...params, option, customerId: customer?.id, branchId: crossBranch ? params.branchId || undefined : undefined });
  }

  async function exportExcel(r: ReportResult) {
    const day = (d?: string) => formatCell({ key: "", label: "", type: "date" }, d);
    try {
      await exportReportXlsx(r, {
        subtitle: definition?.options?.find((o) => o.value === option)?.label,
        scope: scopeLabel,
        period: `${day(applied?.from)} to ${day(applied?.to)}`,
        filename: `${kind}-${applied?.from}-to-${applied?.to}`,
      });
    } catch {
      toast.error("The Excel file could not be created");
    }
  }

  const groups = useMemo(() => {
    if (!result) return [];
    if (!result.grouped) return [{ name: null as string | null, start: 0, rows: result.rows }];
    const out: { name: string | null; start: number; rows: ReportRow[] }[] = [];
    result.rows.forEach((row, index) => {
      const name = row.group == null ? null : String(row.group);
      if (!out.length || out[out.length - 1].name !== name) out.push({ name, start: index, rows: [] });
      out[out.length - 1].rows.push(row);
    });
    return out;
  }, [result]);

  if (catalog.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!definition) {
    return (
      <div className="p-6">
        <Link href="/parts-reports" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Parts Reports
        </Link>
        <p className="text-sm text-red-500">Report not found, or you do not have access to it.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6 print:gap-2 print:p-0">
      <style>{"@media print { @page { size: A4 landscape; margin: 10mm; } }"}</style>
      <Link href="/parts-reports" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 print:hidden">
        <ArrowLeft className="size-4" /> Back to Parts Reports
      </Link>
      <div className="print:hidden">
        <PageHeader
          title={definition.title}
          description={definition.description}
          actions={
            result && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" disabled={!result.rows.length} onClick={() => window.print()}>
                  <Printer className="size-4" /> Print
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={!result.rows.length} onClick={() => exportExcel(result)}>
                  <Download className="size-4" /> Export Excel
                </Button>
              </div>
            )
          }
        />
      </div>

      <form onSubmit={run} className="grid gap-4 rounded-xl border bg-background p-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden" aria-label="Report filters">
        <Field label="From date">
          <input type="date" required className={inputCls} value={params.from} max={params.to} onChange={(e) => set({ from: e.target.value })} />
        </Field>
        <Field label="To date">
          <input type="date" required className={inputCls} value={params.to} min={params.from} onChange={(e) => set({ to: e.target.value })} />
        </Field>
        <Field label="Branch">
          {crossBranch ? (
            <select className={inputCls} value={params.branchId ?? ""} onChange={(e) => set({ branchId: e.target.value })}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <input className={inputCls} readOnly value={branchName(user?.branchId ?? undefined) ?? "Your branch"} />
          )}
        </Field>
        {has("branch") && (
          <Field label={definition.labels?.branch ?? "Branch"}>
            <select className={inputCls} value={params.otherBranchId ?? ""} onChange={(e) => set({ otherBranchId: e.target.value || undefined })}>
              <option value="">All</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {has("customer") && (
          <div className="sm:col-span-2">
            <Field label="Customer (optional)">
              <CustomerPicker value={customer} onChange={setCustomer} />
            </Field>
          </div>
        )}
        {has("vendor") && (
          <Field label="Vendor">
            <select className={inputCls} value={params.vendor ?? ""} onChange={(e) => set({ vendor: e.target.value || undefined })}>
              <option value="">All</option>
              {(lookups.data?.vendors ?? []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        )}
        {has("executive") && (
          <Field label="Sales executive">
            <select className={inputCls} value={params.executiveId ?? ""} onChange={(e) => set({ executiveId: e.target.value || undefined })}>
              <option value="">All</option>
              {(lookups.data?.executives ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {has("search") && (
          <Field label={definition.labels?.search ?? "Document no. (optional)"}>
            <input className={inputCls} maxLength={40} value={params.search ?? ""} onChange={(e) => set({ search: e.target.value || undefined })} />
          </Field>
        )}
        {has("part") && (
          <WorkshopPicker
            label="Part (optional)"
            endpoint="/parts-reports/parts"
            collection="parts"
            value={params.partId}
            onChange={(id) => set({ partId: id || undefined })}
            formatLabel={(row) => [row.code, row.name].filter(Boolean).join(" · ")}
          />
        )}
        {has("partFlag") && (
          <Field label="Purchase source (part flag)">
            <select className={inputCls} value={params.partFlag ?? ""} onChange={(e) => set({ partFlag: e.target.value || undefined })}>
              <option value="">All</option>
              {(lookups.data?.partFlags ?? []).map((flag) => (
                <option key={flag} value={flag}>
                  {flag}
                </option>
              ))}
            </select>
          </Field>
        )}
        {has("priceCategory") && (
          <Field label="Part category">
            <select className={inputCls} value={params.priceCategory ?? ""} onChange={(e) => set({ priceCategory: e.target.value || undefined })}>
              <option value="">All</option>
              {(lookups.data?.categories ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.description}
                </option>
              ))}
            </select>
          </Field>
        )}
        {has("status") && (
          <Field label="Order">
            <select
              className={inputCls}
              value={params.status ?? ""}
              onChange={(e) => set({ status: e.target.value || undefined, fullyExecuted: e.target.value === "EXECUTED" ? params.fullyExecuted : undefined })}
            >
              {(definition.statuses ?? []).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {has("fullyExecuted") && (
          <label className={cn("flex items-center gap-2 self-end pb-2 text-sm", params.status !== "EXECUTED" && "opacity-50")}>
            <input
              type="checkbox"
              disabled={params.status !== "EXECUTED"}
              checked={!!params.fullyExecuted}
              onChange={(e) => set({ fullyExecuted: e.target.checked || undefined })}
            />
            Only fully executed
          </label>
        )}
        {has("option") && (
          <fieldset className="flex flex-wrap items-end gap-4 sm:col-span-2">
            {(definition.options ?? []).map((o) => (
              <label key={o.value} className="flex items-center gap-2 pb-2 text-sm">
                <input type="radio" name="report-option" checked={option === o.value} onChange={() => set({ option: o.value })} />
                {o.label}
              </label>
            ))}
          </fieldset>
        )}
        {has("includeReturns") && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={params.includeReturns !== false} onChange={(e) => set({ includeReturns: e.target.checked })} />
            Include returns
          </label>
        )}
        {has("includeCancelled") && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={!!params.includeCancelled} onChange={(e) => set({ includeCancelled: e.target.checked || undefined })} />
            Show cancelled records
          </label>
        )}
        <div className="flex items-end sm:col-span-2 lg:col-span-4">
          <Button type="submit" disabled={report.isFetching}>
            {report.isFetching ? "Running…" : "Run report"}
          </Button>
        </div>
      </form>

      {!applied ? (
        <p className="py-12 text-center text-sm text-muted-foreground print:hidden">Set the filters and run the report.</p>
      ) : report.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      ) : report.isError ? (
        <div className="py-12 text-center">
          <p role="alert" className="text-sm text-red-500">The report could not be run. Check the filters and your branch access.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => report.refetch()}>
            Retry
          </Button>
        </div>
      ) : result && !result.rows.length ? (
        <p className="border-y py-12 text-center text-sm text-muted-foreground">No records match these filters.</p>
      ) : result ? (
        <div className="rounded-xl border bg-background print:border-0">
          {/* Print header, as on the legacy registers. */}
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
            <p className="font-semibold">
              Dana Motors Limited · {result.title}
              {option && definition.options && <span className="font-normal text-muted-foreground"> · {definition.options.find((o) => o.value === option)?.label}</span>}
            </p>
            <p className="text-sm text-muted-foreground">
              {scopeLabel} · {formatCell({ key: "", label: "", type: "date" }, applied.from)} to {formatCell({ key: "", label: "", type: "date" }, applied.to)} ·{" "}
              {result.rows.length} line(s)
            </p>
          </div>
          {result.truncated && (
            <p className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-800">
              Only the first 5,000 lines are shown. Narrow the dates or filters to see the rest; totals cover every line.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm print:text-[10px]">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th scope="col" className="w-12 whitespace-nowrap px-3 py-2 text-right font-medium">
                    S.No.
                  </th>
                  {result.columns.map((c) => (
                    <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 py-2 font-medium", numeric(c) ? "text-right" : "text-left")}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g, gi) => (
                  <Fragment key={`${g.name}-${gi}`}>
                    {g.name !== null && (
                      <tr className="border-b bg-muted/30">
                        <th colSpan={result.columns.length + 1} scope="rowgroup" className="px-3 py-2 text-left font-semibold">
                          {g.name}
                        </th>
                      </tr>
                    )}
                    {g.rows.map((row, i) => (
                      <tr key={i} className={cn("border-b last:border-0 hover:bg-muted/20", row.status === "Cancelled" && "text-muted-foreground line-through")}>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{g.start + i + 1}</td>
                        {result.columns.map((c) => (
                          <td key={c.key} className={cn("px-3 py-1.5", numeric(c) ? "whitespace-nowrap text-right tabular-nums" : "", c.type === "date" && "whitespace-nowrap")}>
                            {formatCell(c, row[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {g.name !== null && (
                      <tr className="border-b bg-muted/10 font-medium">
                        <td />
                        {result.columns.map((c, i) => {
                          const sub = subtotal(g.rows, result.columns);
                          return (
                            <td key={c.key} className={cn("px-3 py-1.5", numeric(c) && "text-right tabular-nums")}>
                              {i === 0 ? "Subtotal" : c.key in sub ? formatCell(c, sub[c.key]) : ""}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-muted/40 font-semibold">
                <tr>
                  <td />
                  {result.columns.map((c, i) => (
                    <td key={c.key} className={cn("px-3 py-2", numeric(c) && "whitespace-nowrap text-right tabular-nums")}>
                      {i === 0 ? "TOTAL" : c.key in result.totals ? formatCell(c, result.totals[c.key]) : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
