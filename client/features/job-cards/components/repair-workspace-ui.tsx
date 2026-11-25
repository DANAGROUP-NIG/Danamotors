import type { ReactNode } from "react";
import { Clock, CircleCheck, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  StatusBadge,
  type StatusTone,
} from "@/components/ui/table-components/StatusBadge";
import { WORKSPACE_COPY as COPY } from "./repair-workspace-copy";
import {
  splitMoney,
  formatEstimateMoney,
  formatSignedDate,
  type EstimateViewModel,
} from "./repair-workspace-helpers";

export const workspaceCardClass =
  "min-w-0 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm";
export function StatusPill({
  label,
  tone = "amber",
}: {
  label: string;
  tone?: StatusTone;
}) {
  return (
    <StatusBadge
      status={label}
      tone={tone}
      className="shrink-0 gap-2 border-transparent px-3 py-1.5 text-xs font-medium normal-case before:block before:size-1.5 before:rounded-full before:bg-current"
    />
  );
}
export function MoneyDisplay({
  amount,
  currency,
}: {
  amount: number;
  currency: string;
}) {
  const money = splitMoney(amount, currency);
  return (
    <p className="break-words text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
      <span>{money.whole}</span>
      <span className="text-xl font-medium text-muted-foreground sm:text-2xl">
        {money.decimals}
      </span>
    </p>
  );
}
export function EstimateLinesTable({
  estimate,
}: {
  estimate: EstimateViewModel;
}) {
  return (
    <div
      className="relative min-w-0 overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-label={COPY.estimate}
    >
      <table className="w-full min-w-[34rem] text-left text-xs sm:text-sm">
        <caption className="sr-only">{COPY.estimate}</caption>
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-3 font-medium">
              {COPY.description}
            </th>
            {[COPY.quantity, COPY.rate, COPY.amount].map((label) => (
              <th
                key={label}
                scope="col"
                className="whitespace-nowrap px-3 py-3 text-right font-medium"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {estimate.lines.map((line) => (
            <tr key={line.id} className="border-b border-border">
              <td className="max-w-80 px-3 py-4">
                <p className="font-medium">{line.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {line.secondary}
                </p>
              </td>
              <td className="px-3 py-4 text-right tabular-nums">
                {line.quantity}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">
                {formatEstimateMoney(line.rate, estimate.currency, true)}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">
                {formatEstimateMoney(line.amount, estimate.currency, true)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ApprovalCallout({ estimate }: { estimate: EstimateViewModel }) {
  const signature = estimate.decision?.signature;
  let content: ReactNode;
  let tone: "amber" | "emerald" | "red" = "amber";
  if (estimate.invalid) {
    tone = "red";
    content = COPY.invalid;
  } else if (estimate.status === "awaiting")
    content = (
      <>
        <p className="font-semibold">{COPY.approvalTitle}</p>
        <p className="mt-1">{COPY.approvalBody}</p>
      </>
    );
  else if (estimate.status === "declined") {
    tone = "red";
    content = (
      <>
        <p className="font-semibold">{COPY.declinedTitle}</p>
        <p className="mt-1">
          {estimate.decision?.comments || COPY.declinedBody}
        </p>
      </>
    );
  } else if (estimate.status === "approved") {
    tone = "emerald";
    content = signature
      ? COPY.signedBy(
          signature.signerName,
          formatSignedDate(signature.signedAt),
        )
      : estimate.decision?.signatureState === "override"
        ? COPY.override
        : estimate.decision?.signatureState === "legacy"
          ? COPY.legacy
          : COPY.estimateStates.approved;
  } else return null;
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
  };
  const Icon =
    tone === "emerald" ? CircleCheck : tone === "red" ? CircleAlert : Clock;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-sm",
        tones[tone],
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{content}</div>
    </div>
  );
}
