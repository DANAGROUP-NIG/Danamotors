"use client";

import { useState } from "react";
import { CheckCircle2, Clock, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { useCheckers } from "@/features/stock-taking/hooks/use-stock-taking";
import { useHandheldPickers, useSendToHandheld, useStationState } from "../hooks/use-handheld";
import type { SendTarget, StationState } from "../types/handheld.types";

/** The branch's station state, in the words the store sees (user decision 2026-10-28). */
export function StationStateLine({ state, branchName }: { state?: StationState; branchName: string }) {
  if (!state) return <p className="text-sm text-slate-400">Checking the handheld station…</p>;
  if (state.docked.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="size-4 shrink-0" />
        Handheld docked at {state.docked.map((s) => `${s.name} (${s.dockedDevice?.name})`).join(", ")}
      </p>
    );
  }
  if (state.online) {
    return (
      <p className="flex items-center gap-2 text-sm text-amber-700">
        <Clock className="size-4 shrink-0" />
        Station online, no handheld docked: the job will go to the next handheld docked.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-red-600">
      <WifiOff className="size-4 shrink-0" />
      No handheld station online at {branchName}.
    </p>
  );
}

/**
 * Send a picking list, CPO, MIT or count sheet to the handheld: choose who works it (an employee
 * picks; a count sheet's checker is a user) and see whether a handheld station can take it.
 */
export function SendToHandheldDialog({ target, onClose }: { target: SendTarget; onClose: () => void }) {
  const sheet = target.type === "COUNT_SHEET";
  const { data: state } = useStationState(target.branchId);
  const { data: pickers } = useHandheldPickers(target.branchId, !sheet);
  const { data: checkers } = useCheckers(sheet ? target.branchId : "");
  const send = useSendToHandheld();
  const [who, setWho] = useState(sheet ? (target.checkerId ?? "") : "");
  const branchName = state?.branch?.name ?? "this branch";
  const blocked = !!state && !state.online;

  return (
    <ModalFame isOpen onClose={onClose} title={`Send ${target.label} to the handheld`}>
      <div className="grid gap-4">
        <Field label={sheet ? "Checker" : "Picker"} required>
          <select className={inputCls} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">{sheet ? "Choose the checker" : "Choose who picks it"}</option>
            {sheet
              ? (checkers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                  </option>
                ))
              : (pickers ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.code ? ` (${p.code})` : ""}
                  </option>
                ))}
          </select>
        </Field>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <StationStateLine state={state} branchName={branchName} />
          {!blocked && (
            <p className="mt-1 text-sm text-slate-500">
              Nothing to do on the PC: the job goes to the handheld when it is docked, and the result comes back to this page.
            </p>
          )}
          {blocked && <p className="mt-1 text-sm text-slate-500">Ask IT to start the handheld station on a store PC of {branchName}.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={!who || blocked || !state || send.isPending}
            title={blocked ? `No handheld station online at ${branchName}` : undefined}
            onClick={() =>
              send.mutate(
                { type: target.type, sourceId: target.sourceId, ...(sheet ? { checkerId: who } : { pickerId: who }) },
                { onSuccess: onClose },
              )
            }
          >
            {send.isPending ? "Sending…" : "Send to handheld"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
