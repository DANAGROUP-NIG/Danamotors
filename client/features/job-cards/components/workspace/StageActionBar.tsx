"use client";
import { useId, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Ban, Loader2, MoreHorizontal, Save } from "lucide-react";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { Button } from "@/components/ui/button";
import { ACTION_LABELS } from "../../lib/job-stage.logic";
import type { StageAction, StageActionView } from "../../types/job-workspace.types";

/**
 * The sticky bar at the bottom of the job: one primary handoff on the right, with the reason
 * beside it when it is blocked; Save draft (steps with drafts only) and a More menu on the left.
 */
export function StageActionBar({
  primary,
  secondary,
  danger,
  pending,
  onAction,
  onDangerAction,
  onSaveDraft,
  savingDraft = false,
  back,
  next,
  note,
  status,
}: {
  primary: StageActionView | null;
  secondary: StageActionView[];
  danger: StageActionView[];
  /** The action being sent, if any. Every button waits while one runs. */
  pending: StageAction | null;
  onAction: (action: StageAction) => void;
  /** Danger actions, such as Cancel job, open a confirmation first. */
  onDangerAction: (action: StageAction) => void;
  onSaveDraft?: () => void;
  savingDraft?: boolean;
  /** Moves back a part of the step, for example from Walk-around to Details. */
  back?: { label: string; onClick: () => void };
  /**
   * Moves on inside the step (saving first) instead of the handoff, for example "Continue to
   * walk-around". `form` submits that form.
   */
  next?: { label: string; onClick?: () => void; form?: string; pending?: boolean; pendingLabel?: string };
  /** A short line under the handoff, such as who takes the job next. */
  note?: string;
  /** Extra status on the left, such as "Saved 10:42". */
  status?: ReactNode;
}) {
  const reasonId = useId();
  const noteId = useId();
  const busy = pending !== null || savingDraft || !!next?.pending;
  const shownSecondary = next ? [] : secondary.filter((view) => view.enabled);
  if (!primary && !shownSecondary.length && !danger.length && !onSaveDraft && !back && !next && !status) return null;
  const blocked = !next && primary && !primary.enabled ? primary.reasons.join(" ") : null;
  return (
    <div
      role="region"
      aria-label="Step actions"
      className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/90 lg:-mx-5 lg:px-5 print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {back && (
            <Button type="button" variant="outline" onClick={back.onClick} disabled={busy} aria-label={back.label} title={back.label}>
              <ArrowLeft aria-hidden="true" />
              {/* Phones show the icon only, so the bar stays on one line. */}
              <span className="hidden sm:inline">{back.label}</span>
            </Button>
          )}
          {onSaveDraft && (
            <Button type="button" variant="outline" onClick={onSaveDraft} disabled={busy} aria-label={savingDraft ? "Saving draft" : "Save draft"} title="Save draft">
              {savingDraft ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
              <span className="hidden sm:inline">{savingDraft ? "Saving draft" : "Save draft"}</span>
            </Button>
          )}
          {danger.length > 0 && (
            <ActionMenu
              align="start"
              trigger={
                <Button type="button" variant="outline" disabled={busy} aria-label="More" title="More">
                  <MoreHorizontal aria-hidden="true" />
                  <span className="hidden sm:inline">More</span>
                </Button>
              }
            >
              {danger.map((view) => (
                <div key={view.action} role="none">
                  <ActionMenuItem destructive icon={<Ban />} disabled={!view.enabled} onClick={() => onDangerAction(view.action)}>
                    {ACTION_LABELS[view.action]}
                  </ActionMenuItem>
                  {!view.enabled && <p className="px-2.5 pb-2 text-xs text-muted-foreground">{view.reasons.join(" ")}</p>}
                </div>
              ))}
            </ActionMenu>
          )}
          {status}
        </div>
        <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:basis-auto">
          {blocked && (
            <p id={reasonId} className="min-w-0 max-w-xl flex-1 basis-60 text-right text-sm text-muted-foreground">
              {blocked}
            </p>
          )}
          {shownSecondary.map((view) => (
            <Button key={view.action} type="button" variant="outline" disabled={busy} onClick={() => onAction(view.action)}>
              {pending === view.action && <Loader2 className="animate-spin" aria-hidden="true" />}
              {ACTION_LABELS[view.action]}
            </Button>
          ))}
          {next ? (
            <Button type={next.form ? "submit" : "button"} form={next.form} disabled={busy} onClick={next.onClick} className="w-full sm:w-auto">
              {next.pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              {next.pending ? (next.pendingLabel ?? "Saving") : next.label}
            </Button>
          ) : (
            primary && (
              <div className="flex w-full flex-col items-end gap-1 sm:w-auto">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={!primary.enabled || busy}
                  aria-describedby={[blocked ? reasonId : null, note && primary.enabled ? noteId : null].filter(Boolean).join(" ") || undefined}
                  onClick={() => onAction(primary.action)}
                >
                  {pending === primary.action ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                  {pending === primary.action ? "Sending" : ACTION_LABELS[primary.action]}
                </Button>
                {note && primary.enabled && (
                  <p id={noteId} className="text-xs text-muted-foreground">
                    {note}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
