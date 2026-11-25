"use client";
import { useId } from "react";
import { ArrowRight, Ban, Loader2, MoreHorizontal, Save } from "lucide-react";
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
}) {
  const reasonId = useId();
  const busy = pending !== null || savingDraft;
  const shownSecondary = secondary.filter((view) => view.enabled);
  if (!primary && !shownSecondary.length && !danger.length && !onSaveDraft) return null;
  const blocked = primary && !primary.enabled ? primary.reasons.join(" ") : null;
  return (
    <div
      role="region"
      aria-label="Step actions"
      className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/90 lg:-mx-5 lg:px-5 print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {onSaveDraft && (
            <Button type="button" variant="outline" onClick={onSaveDraft} disabled={busy}>
              {savingDraft ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
              {savingDraft ? "Saving draft" : "Save draft"}
            </Button>
          )}
          {danger.length > 0 && (
            <ActionMenu
              align="start"
              trigger={
                <Button type="button" variant="outline" disabled={busy}>
                  <MoreHorizontal aria-hidden="true" />
                  More
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
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-2">
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
          {primary && (
            <Button
              type="button"
              disabled={!primary.enabled || busy}
              aria-describedby={blocked ? reasonId : undefined}
              onClick={() => onAction(primary.action)}
            >
              {pending === primary.action ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              {pending === primary.action ? "Sending" : ACTION_LABELS[primary.action]}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
