import type { ReactNode } from "react";
import { WORKSPACE_COPY as COPY } from "./repair-workspace-copy";
import {
  formatEstimateMoney,
  type EstimateViewModel,
} from "./repair-workspace-helpers";
import {
  ApprovalCallout,
  EstimateLinesTable,
  MoneyDisplay,
  StatusPill,
  workspaceCardClass,
} from "./repair-workspace-ui";

export function EstimateApprovalCard({
  estimate,
  actions,
  printAction,
  children,
  latest = true,
}: {
  estimate?: EstimateViewModel;
  actions?: ReactNode;
  printAction?: ReactNode;
  children?: ReactNode;
  latest?: boolean;
}) {
  return (
    <section className={workspaceCardClass} aria-label={COPY.estimate}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-6 sm:py-6">
        <h2 className="text-lg font-semibold">{COPY.estimate}</h2>
        {estimate && (
          <StatusPill
            label={COPY.estimateStates[estimate.status]}
            tone={
              estimate.status === "approved"
                ? "emerald"
                : estimate.status === "declined" ||
                    estimate.status === "revision"
                  ? "red"
                  : estimate.status === "superseded"
                    ? "gray"
                    : "amber"
            }
          />
        )}
      </div>
      <div className="space-y-6 p-5 sm:p-6">
        {estimate ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="min-w-0 space-y-3">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {latest ? COPY.latest : COPY.revision}{" "}
                  <span className="tabular-nums">{estimate.version}</span>
                </p>
                <MoneyDisplay
                  amount={estimate.total}
                  currency={estimate.currency}
                />
                <p className="text-xs text-muted-foreground">
                  {COPY.exclusions}
                </p>
              </div>
              {printAction}
            </div>
            <h3 className="wrap-break-word text-base font-semibold">
              {estimate.description}
            </h3>
            <ApprovalCallout estimate={estimate} />
            <EstimateLinesTable estimate={estimate} />
            <div className="flex items-center justify-between gap-4 border-t border-border pt-5 font-semibold">
              <span>{COPY.total}</span>
              <span className="text-right tabular-nums">
                {formatEstimateMoney(estimate.total, estimate.currency)}
              </span>
            </div>
          </>
        ) : (
          <div className="space-y-2 py-8 text-center">
            <h3 className="font-semibold">{COPY.emptyTitle}</h3>
            <p className="text-sm text-muted-foreground">{COPY.emptyBody}</p>
          </div>
        )}
        {actions && (
          <div className="flex flex-wrap gap-3 print:hidden">{actions}</div>
        )}
        {children}
      </div>
    </section>
  );
}
