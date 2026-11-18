"use client";

import { useState } from "react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChange, useRecordHistory } from "../hooks/use-change-log";
import type { ChangeLogEntry } from "../types/change-log.types";
import { ACTION_COLORS, ACTION_LABELS, changedBy, formatAt, formatFieldChange } from "./change-log-format";

/** One change, field by field, with the full history of the same record below it. */
export function ChangeDetailModal({ changeId, onClose }: { changeId: string | null; onClose: () => void }) {
  const { data, isLoading, isError } = useChange(changeId);
  const change = data?.change;
  const [showHistory, setShowHistory] = useState(false);
  const history = useRecordHistory(showHistory && change ? change.entity : null, showHistory && change ? change.recordId : null);

  return (
    <ModalFame
      isOpen={!!changeId}
      onClose={() => {
        setShowHistory(false);
        onClose();
      }}
      title="Change details"
      size="wide"
    >
      {isLoading && <div className="h-52 animate-pulse rounded-xl bg-muted" />}
      {isError && <p className="text-sm text-red-600">Unable to load this change.</p>}
      {change && (
        <div className="space-y-5 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label="Record" value={`${change.entityLabel}: ${change.recordLabel || change.recordId}`} />
            <Detail label="When" value={formatAt(change.at)} />
            <Detail label="By" value={changedBy(change)} />
            <Detail
              label="Source"
              value={
                change.source === "DB"
                  ? `Outside the app: ${[change.appName, change.clientAddr].filter(Boolean).join(", ") || "direct database connection"}`
                  : "The app"
              }
            />
          </div>
          {change.source === "DB" && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
              This change was made directly in the database, not through the app. Nobody signed in to the app made it.
            </p>
          )}
          <FieldTable change={change} />
          <p className="text-xs text-muted-foreground">Record id {change.recordId} · transaction {change.txId}</p>

          {!showHistory ? (
            <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
              Show every change to this record
            </Button>
          ) : (
            <div className="space-y-3">
              <h3 className="font-semibold">History of this record</h3>
              {history.isLoading && <div className="h-24 animate-pulse rounded-xl bg-muted" />}
              {history.data?.changes.map((entry) => (
                <div key={entry.id} className={cn("rounded-lg border p-3", entry.id === change.id && "border-primary")}>
                  <p className="mb-2 flex flex-wrap items-center gap-2 text-muted-foreground">
                    <ActionBadge entry={entry} />
                    {formatAt(entry.at)} · {changedBy(entry)}
                  </p>
                  <FieldTable change={entry} compact />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </ModalFame>
  );
}

export function ActionBadge({ entry }: { entry: Pick<ChangeLogEntry, "action"> }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", ACTION_COLORS[entry.action])}>
      {ACTION_LABELS[entry.action]}
    </span>
  );
}

function FieldTable({ change, compact }: { change: ChangeLogEntry; compact?: boolean }) {
  if (!change.changes.length) return <p className="text-muted-foreground">No field values recorded.</p>;
  const showOld = change.action !== "INSERT";
  const showNew = change.action !== "DELETE";
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className={cn("w-full text-left", compact ? "text-xs" : "text-sm")}>
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Field</th>
            {showOld && <th className="px-3 py-2 font-medium">{showNew ? "Old value" : "Value"}</th>}
            {showNew && <th className="px-3 py-2 font-medium">{showOld ? "New value" : "Value"}</th>}
          </tr>
        </thead>
        <tbody>
          {change.changes.map((fieldChange, index) => {
            const row = formatFieldChange(fieldChange);
            return (
              <tr key={`${fieldChange.field}-${index}`} className="border-t align-top">
                <td className="px-3 py-1.5 font-medium">{row.field}</td>
                {showOld && <td className="break-all px-3 py-1.5 text-red-700">{row.old}</td>}
                {showNew && <td className="break-all px-3 py-1.5 text-green-700">{row.new}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words">{value}</p>
    </div>
  );
}
