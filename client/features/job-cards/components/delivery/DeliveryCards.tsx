"use client";
import { useId, type ReactNode } from "react";
import { AlertTriangle, BadgeCheck, CalendarClock, CheckCircle2, Clock, Loader2, Package, RefreshCw, ShieldAlert, UserRound } from "lucide-react";
import { inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { formatDateTime, NOT_PROVIDED } from "@/lib/format";
import { cn } from "@/lib/utils";
import { approverRoleLabel, collectorOptions, MAX_LATE_REASONS, RELEASE_RULE } from "../../lib/delivery.logic";
import type { CollectorType, JobDeliveryStep, WorkDoneLine } from "../../types/job-delivery.types";
import { StageCard } from "../workspace/StageCard";

const Muted = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

/** "Work done", in plain words for the customer, with extra work and work not charged noted. */
export function WorkDoneCard({ lines }: { lines: WorkDoneLine[] }) {
  return (
    <StageCard title="Work done">
      {lines.length ? (
        <ul className="space-y-2 text-sm">
          {lines.map((line, index) => (
            <li key={`${index}-${line.text}`} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <span className="min-w-0">
                {line.text}
                {line.note && <span className="text-muted-foreground"> ({line.note.charAt(0).toLowerCase() + line.note.slice(1)})</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Muted>No work was recorded on this job.</Muted>
      )}
    </StageCard>
  );
}

/** "Declined, recommended for next visit". */
export function DeclinedCard({ items }: { items: string[] }) {
  return (
    <StageCard title="Declined, recommended for next visit">
      {items.length ? (
        <ul className="space-y-1 text-sm">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <Muted>The customer did not decline any recommended work.</Muted>
      )}
    </StageCard>
  );
}

/** "Your belongings": each item recorded at check-in, ticked Returned as it is handed back. */
export function BelongingsCard({
  step,
  returned,
  editable,
  disabled,
  onChange,
}: {
  step: Pick<JobDeliveryStep, "belongings">;
  returned: string[];
  editable: boolean;
  disabled: boolean;
  onChange: (codes: string[]) => void;
}) {
  const ids = useId();
  const all = step.belongings.map((item) => item.code);
  const allTicked = all.every((code) => returned.includes(code));
  return (
    <StageCard
      title="Your belongings"
      description="Items recorded at check-in. Tick each one as it is handed back."
      actions={
        editable && step.belongings.length > 1 && !allTicked ? (
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange(all)}>
            Tick all returned
          </Button>
        ) : undefined
      }
    >
      {step.belongings.length === 0 ? (
        <Muted>No belongings were recorded at check-in.</Muted>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {step.belongings.map((item) => {
            const id = `${ids}-${item.code}`;
            const ticked = returned.includes(item.code);
            return (
              <li key={item.code} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 text-sm">
                <label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-2">
                  <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 break-words">{item.label}</span>
                </label>
                {editable ? (
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 font-medium">
                    <input
                      id={id}
                      type="checkbox"
                      className="size-5"
                      checked={ticked}
                      disabled={disabled}
                      onChange={(event) => onChange(event.target.checked ? [...returned, item.code] : returned.filter((code) => code !== item.code))}
                    />
                    Returned
                  </label>
                ) : (
                  <span className="shrink-0 text-muted-foreground">To return</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </StageCard>
  );
}

/**
 * "Collected by": the owner, the person who signed at check-in, or someone else. Someone else needs a service or
 * workshop manager's approval with a reason (terms clause 7): a manager approves here; an advisor asks one.
 */
export function CollectorCard({
  step,
  value,
  editable,
  disabled,
  onChange,
  onApprove,
  request,
}: {
  step: JobDeliveryStep;
  value: CollectorType | null;
  editable: boolean;
  disabled: boolean;
  onChange: (type: CollectorType) => void;
  onApprove: () => void;
  request: { name: string; onName: (name: string) => void; onSend: () => void; pending: boolean; error: string | null };
}) {
  const ids = useId();
  const options = collectorOptions(step);
  const approval = step.releaseApproval;
  return (
    <StageCard title="Collected by" description="Check who is taking the vehicle away. Ask for ID if you do not know them.">
      {editable ? (
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="sr-only">Who is collecting the vehicle</legend>
          {options.map((option) => (
            <label
              key={option.type}
              className={cn(
                "flex min-h-12 cursor-pointer flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring",
                value === option.type ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <input type="radio" name={`${ids}-collector`} className="size-4" checked={value === option.type} onChange={() => onChange(option.type)} />
                <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 break-words font-medium">{option.label}</span>
              </span>
              {option.badge && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  <BadgeCheck className="size-3.5" aria-hidden="true" />
                  {option.badge}
                </span>
              )}
            </label>
          ))}
        </fieldset>
      ) : (
        <ul className="space-y-1 text-sm">
          {options
            .filter((option) => option.type !== "OTHER")
            .map((option) => (
              <li key={option.type}>{option.label}</li>
            ))}
        </ul>
      )}

      {(value === "OTHER" || (!editable && (approval || step.access.canApproveRelease))) && (
        <div className="space-y-3">
          {approval ? (
            <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Release to {approval.collectorName} ({approval.collectorPhone}) approved by {approval.approvedBy ?? NOT_PROVIDED} (
                {approverRoleLabel(approval.approvedByRole)}), {formatDateTime(approval.approvedAt)}. Reason: {approval.reason}
              </span>
            </p>
          ) : (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {RELEASE_RULE}
            </p>
          )}
          {step.access.canApproveRelease && (
            <Button type="button" variant="outline" disabled={disabled} onClick={onApprove}>
              {approval ? "Approve a different person" : "Approve release to someone else"}
            </Button>
          )}
          {editable && !approval && !step.access.canApproveRelease && step.access.canRequestRelease && (
            <div className="space-y-2">
              <label htmlFor={`${ids}-request`} className="text-sm font-semibold">
                Name of the person collecting<span className="text-destructive" aria-hidden="true"> *</span>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={`${ids}-request`}
                  className={inputCls}
                  value={request.name}
                  maxLength={120}
                  disabled={disabled || request.pending}
                  aria-describedby={`${ids}-request-help${request.error ? ` ${ids}-request-error` : ""}`}
                  onChange={(event) => request.onName(event.target.value)}
                />
                <Button type="button" variant="outline" className="shrink-0" disabled={disabled || request.pending} onClick={request.onSend}>
                  {request.pending && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {request.pending ? "Asking" : "Ask a manager to approve"}
                </Button>
              </div>
              <p id={`${ids}-request-help`} className="text-sm text-muted-foreground">
                The branch service and workshop managers get a notice. One of them opens this job and approves the release.
              </p>
              {request.error && (
                <p id={`${ids}-request-error`} role="alert" className="text-sm text-destructive">
                  {request.error}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </StageCard>
  );
}

/** Late delivery: the existing late reasons (1 to 6) and an optional internal remark. */
export function LateReasonsCard({
  promisedAt,
  reasons,
  selected,
  remarks,
  disabled,
  showError,
  onChange,
  onRemarks,
}: {
  promisedAt: string | null;
  reasons: { state: "loading" | "error" | "ready"; options: { id: string; description: string }[]; retry: () => void };
  selected: string[];
  remarks: string;
  disabled: boolean;
  showError: boolean;
  onChange: (ids: string[]) => void;
  onRemarks: (text: string) => void;
}) {
  const ids = useId();
  const missing = selected.length === 0;
  return (
    <StageCard title="Reasons for late delivery" description="Select all that apply (1 to 6).">
      <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Delivered after the promised time of {promisedAt ? formatDateTime(promisedAt) : NOT_PROVIDED}.
      </p>
      {reasons.state === "loading" && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4" aria-hidden="true" />
          Loading the reasons
        </p>
      )}
      {reasons.state === "error" && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-destructive">
            The reasons could not be loaded. Check your connection and try again.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={reasons.retry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}
      {reasons.state === "ready" && !reasons.options.length && (
        <Muted>No late-delivery reasons are set up. Ask an administrator to add them in Workshop masters.</Muted>
      )}
      {reasons.options.length > 0 && (
        <fieldset disabled={disabled} aria-describedby={showError && missing ? `${ids}-error` : undefined}>
          <legend className="sr-only">Reasons for late delivery</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {reasons.options.map((reason) => {
              const checked = selected.includes(reason.id);
              return (
                <label
                  key={reason.id}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-ring",
                    checked ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={checked}
                    disabled={!checked && selected.length >= MAX_LATE_REASONS}
                    onChange={(event) => onChange(event.target.checked ? [...selected, reason.id] : selected.filter((id) => id !== reason.id))}
                  />
                  {reason.description}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      {showError && missing && (
        <p id={`${ids}-error`} className="text-sm text-destructive">
          Choose at least one reason for late delivery.
        </p>
      )}
      <div>
        <label htmlFor={`${ids}-remarks`} className="text-sm font-semibold">
          Delay remark (optional)
        </label>
        <textarea
          id={`${ids}-remarks`}
          className={`${inputCls} mt-1 h-20 py-2`}
          maxLength={1000}
          value={remarks}
          disabled={disabled}
          aria-describedby={`${ids}-remarks-help`}
          onChange={(event) => onRemarks(event.target.value)}
        />
        <p id={`${ids}-remarks-help`} className="mt-1 text-sm text-muted-foreground">
          What held the job up. Internal only, not shown to the customer.
        </p>
      </div>
    </StageCard>
  );
}

/** Blocked until paid or credit approved, with the way to fix it. */
export function PaymentBlockedCard({ problem, invoiceId }: { problem: string; invoiceId: string | null }) {
  return (
    <div role="alert" className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <p className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          {problem} The vehicle can be delivered once the cashier records the payment or a manager approves credit.
        </span>
      </p>
      {invoiceId && (
        <a href={`/invoices/${invoiceId}`} className="shrink-0 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Open the invoice in Billing
        </a>
      )}
    </div>
  );
}
