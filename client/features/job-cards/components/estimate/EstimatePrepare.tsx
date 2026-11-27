"use client";
import { useId, useState } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ADVANCE_PRESETS,
  KIND_LABEL,
  PAYER_SECTION,
  draftAmount,
  estimateTotals,
  percentProblem,
  quantityProblem,
  suggestedAdvance,
  type DraftLine,
} from "../../lib/estimate.logic";
import type { EstimatePayer, EstimateTotals } from "../../types/job-estimate.types";
import { ItemPicker } from "../diagnosis/ItemPicker";

const PAYER_ORDER: EstimatePayer[] = ["CUSTOMER", "WARRANTY", "GOODWILL", "CAMPAIGN"];
const money = "text-right tabular-nums";

/** The draft lines, grouped by who pays. Prices come from the server; the advisor changes quantities, adds and removes lines. */
export function EstimateLinesEditor({
  jobCardId,
  lines,
  editable,
  saving,
  onChange,
}: {
  jobCardId: string;
  lines: DraftLine[];
  editable: boolean;
  saving: boolean;
  onChange: (lines: DraftLine[]) => void;
}) {
  const [picking, setPicking] = useState<"LABOUR" | "PART" | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const sections = PAYER_ORDER.flatMap((payer) => {
    const rows = lines.filter((line) => line.payer === payer);
    return payer === "CUSTOMER" || rows.length ? [{ payer, rows }] : [];
  });
  const update = (key: string, quantity: string) => onChange(lines.map((line) => (line.key === key ? { ...line, quantity } : line)));
  const remove = (key: string) => onChange(lines.filter((line) => line.key !== key));

  return (
    <div className="space-y-4">
      {sections.map(({ payer, rows }) => (
        <PayerSection key={payer} payer={payer} rows={rows} editable={editable} saving={saving} onQuantity={update} onRemove={remove}>
          {payer === "CUSTOMER" && editable ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-3">
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setPicking("LABOUR")}>
                <Plus aria-hidden="true" />
                Add labour
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setPicking("PART")}>
                <Plus aria-hidden="true" />
                Add part or oil
              </Button>
              {duplicate && (
                <p role="alert" className="basis-full text-sm text-destructive">
                  {duplicate}
                </p>
              )}
            </div>
          ) : payer !== "CUSTOMER" && editable ? (
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              Items paid by warranty, goodwill or a campaign come from the warranty check. Ask the warranty officer to change who pays.
            </p>
          ) : null}
        </PayerSection>
      ))}
      <ItemPicker
        jobCardId={jobCardId}
        kind={picking ?? "LABOUR"}
        open={picking !== null}
        onClose={() => setPicking(null)}
        onPick={(item) => {
          setPicking(null);
          const type = item.kind === "LABOUR" ? "LABOUR" : "PART";
          const same = lines.find((line) => line.type === type && line.referenceId === item.referenceId);
          if (same) {
            setDuplicate(`${same.description} is already on the estimate. Change its quantity instead.`);
            return;
          }
          setDuplicate(null);
          onChange([
            ...lines,
            {
              key: `new-${crypto.randomUUID()}`,
              type,
              kind: item.kind,
              referenceId: item.referenceId,
              description: item.description,
              quantity: String(item.quantity || 1),
              // The server prices the line when the draft is saved.
              rate: "",
              payer: "CUSTOMER",
              findingItemId: null,
              complaintId: null,
              locked: false,
            },
          ]);
        }}
      />
    </div>
  );
}

function PayerSection({
  payer,
  rows,
  editable,
  saving,
  onQuantity,
  onRemove,
  children,
}: {
  payer: EstimatePayer;
  rows: DraftLine[];
  editable: boolean;
  saving: boolean;
  onQuantity: (key: string, quantity: string) => void;
  onRemove: (key: string) => void;
  children?: React.ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn("overflow-hidden rounded-lg border border-border", payer !== "CUSTOMER" && "bg-muted/30")}>
      <h3 id={titleId} className="bg-muted/60 px-3 py-2 text-sm font-semibold">
        {PAYER_SECTION[payer]} <span className="font-normal text-muted-foreground">({rows.length} {rows.length === 1 ? "item" : "items"})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">No customer-pay items. Add a line if the customer asked for more work.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Description</th>
                <th scope="col" className="px-3 py-2 font-medium">Type</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Qty or hours</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Rate</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                {editable && <th scope="col" className="w-12 px-2 py-2"><span className="sr-only">Remove</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => (
                <LineRow key={line.key} line={line} editable={editable} saving={saving} onQuantity={onQuantity} onRemove={onRemove} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {children}
    </section>
  );
}

function LineRow({
  line,
  editable,
  saving,
  onQuantity,
  onRemove,
}: {
  line: DraftLine;
  editable: boolean;
  saving: boolean;
  onQuantity: (key: string, quantity: string) => void;
  onRemove: (key: string) => void;
}) {
  const errorId = useId();
  const problem = quantityProblem(line.quantity);
  const amount = line.rate ? draftAmount(line) : null;
  // Fixed labour (one charge) and the service line are always 1.
  const fixed = line.locked || line.kind === "SERVICE";
  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="px-3 py-2">
        <span className="block max-w-[22rem] truncate" title={line.description}>
          {line.description}
        </span>
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={KIND_LABEL[line.kind]} tone={line.kind === "LABOUR" ? "blue" : line.kind === "SERVICE" ? "gray" : "purple"} className="text-xs normal-case" />
      </td>
      <td className={cn("px-3 py-2", money)}>
        {editable && !fixed ? (
          <>
            <label className="sr-only" htmlFor={`${line.key}-qty`}>
              Quantity for {line.description}
            </label>
            <input
              id={`${line.key}-qty`}
              className={cn(inputCls, "ml-auto h-9 w-24 text-right tabular-nums")}
              inputMode="decimal"
              value={line.quantity}
              disabled={saving}
              aria-invalid={!!problem}
              aria-describedby={problem ? errorId : undefined}
              onChange={(event) => onQuantity(line.key, event.target.value)}
            />
            {problem && (
              <p id={errorId} className="mt-1 text-xs text-destructive">
                {problem}
              </p>
            )}
          </>
        ) : (
          <span>{Number(line.quantity).toLocaleString("en-NG", { minimumFractionDigits: 2 })}{line.kind === "LABOUR" ? " h" : ""}</span>
        )}
      </td>
      <td className={cn("px-3 py-2", money)}>{line.rate ? formatMoney(line.rate) : <span className="text-muted-foreground">Priced on save</span>}</td>
      <td className={cn("px-3 py-2 font-medium", money)}>
        {amount ? (
          formatMoney(amount)
        ) : (
          <span className="font-normal text-muted-foreground">{problem ? "Check the quantity" : "Priced on save"}</span>
        )}
      </td>
      {editable && (
        <td className="px-2 py-1 text-right">
          {!line.locked && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={saving}
              aria-label={`Remove ${line.description}`}
              title={`Remove ${line.description}`}
              onClick={() => onRemove(line.key)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </td>
      )}
    </tr>
  );
}

/** The right-hand summary: customer subtotal, VAT, the customer total, other payers, and the suggested advance. */
export function EstimateSummary({
  totals,
  vatRate,
  percent,
  editable,
  saving,
  promisedAt,
  onPercent,
}: {
  totals: EstimateTotals;
  vatRate: string;
  percent: string;
  editable: boolean;
  saving: boolean;
  promisedAt: string | null;
  onPercent: (percent: string) => void;
}) {
  const [custom, setCustom] = useState(!ADVANCE_PRESETS.includes(Number(percent).toString() as (typeof ADVANCE_PRESETS)[number]));
  const problem = percentProblem(percent);
  const errorId = useId();
  const advance = problem ? null : suggestedAdvance(totals.customerTotal, percent);
  const vat = Number(vatRate).toLocaleString("en-NG", { maximumFractionDigits: 2 });
  return (
    <aside aria-label="Estimate summary" className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5 lg:sticky lg:top-40">
      <h3 className="text-base font-semibold">Estimate summary</h3>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt>Customer subtotal</dt>
          <dd className="tabular-nums">{formatMoney(totals.customerSubtotal)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>VAT ({vat}%)</dt>
          <dd className="tabular-nums">{formatMoney(totals.vat)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 rounded-lg bg-muted px-3 py-3">
          <dt className="font-semibold">Customer total</dt>
          <dd className="text-2xl font-semibold tabular-nums">{formatMoney(totals.customerTotal)}</dd>
        </div>
        {Number(totals.otherPayerTotal) > 0 && (
          <div className="rounded-lg border border-border px-3 py-2 text-muted-foreground">
            <div className="flex justify-between gap-3">
              <dt>Warranty and other payers</dt>
              <dd className="tabular-nums">{formatMoney(totals.otherPayerTotal)}</dd>
            </div>
            <p className="mt-1 text-xs">Claimed from the manufacturer or paid by the campaign. Not charged to the customer.</p>
          </div>
        )}
      </dl>
      <fieldset className="space-y-2" disabled={!editable || saving}>
        <legend className="text-sm font-semibold">Suggested advance</legend>
        <p className="text-xs text-muted-foreground">The cashier asks for this before work starts. Any positive amount is accepted.</p>
        <div className="grid grid-cols-4 gap-2">
          {ADVANCE_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={!custom && Number(percent) === Number(preset) ? "default" : "outline"}
              aria-pressed={!custom && Number(percent) === Number(preset)}
              onClick={() => {
                setCustom(false);
                onPercent(preset);
              }}
            >
              {preset}%
            </Button>
          ))}
          <Button type="button" size="sm" variant={custom ? "default" : "outline"} aria-pressed={custom} onClick={() => setCustom(true)}>
            Custom
          </Button>
        </div>
        {custom && (
          <div>
            <label htmlFor={`${errorId}-percent`} className="text-sm font-medium">
              Advance percentage
            </label>
            <input
              id={`${errorId}-percent`}
              className={cn(inputCls, "mt-1 h-9 w-28 text-right tabular-nums")}
              inputMode="decimal"
              value={percent}
              aria-invalid={!!problem}
              aria-describedby={problem ? errorId : undefined}
              onChange={(event) => onPercent(event.target.value)}
            />
            {problem && (
              <p id={errorId} className="mt-1 text-xs text-destructive">
                {problem}
              </p>
            )}
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3 rounded-lg border border-border px-3 py-2">
          <span className="text-sm">Advance ({problem ? "check the percentage" : `${Number(percent)}%`})</span>
          <span className="text-lg font-semibold tabular-nums">{advance ? formatMoney(advance) : formatMoney(null)}</span>
        </div>
      </fieldset>
      <p className="flex items-center gap-2 text-sm">
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
        <span>
          Estimated delivery <span className="font-medium">{formatDateTime(promisedAt)}</span>
        </span>
      </p>
    </aside>
  );
}

/** Totals for the summary while editing: lines not priced yet count once saved. */
export function draftTotals(lines: DraftLine[], vatRate: string) {
  return estimateTotals(
    lines.map((line) => ({ payer: line.payer, amount: (line.rate && draftAmount(line)) || "0.00" })),
    vatRate,
  );
}
