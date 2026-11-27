"use client";
import { useId, useState } from "react";
import { Loader2, PauseCircle } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";

/**
 * "Pause job": the only reason today is Waiting parts (status WAITING_PARTS through the workflow).
 * Work in progress stops its clock. It closes only on Cancel, the close icon or success.
 */
export function PauseJobDialog({ jobNumber, pending, onConfirm, onClose }: { jobNumber: string; pending: boolean; onConfirm: (note: string) => void; onClose: () => void }) {
  const [details, setDetails] = useState("");
  const ids = useId();
  return (
    <ModalFame isOpen onClose={pending ? () => undefined : onClose} title="Pause job" description={`Job ${jobNumber} stops until you resume it.`} placement="sheet" preventAccidentalClose>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) onConfirm(details.trim() ? `Waiting parts: ${details.trim()}` : "Waiting parts");
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Reason</legend>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3">
            <input type="radio" name="reason" className="size-5 accent-primary" checked readOnly />
            <span className="font-medium">Waiting parts</span>
          </label>
        </fieldset>
        <div>
          <label htmlFor={`${ids}-details`} className="text-sm font-medium">
            Which parts (optional)
          </label>
          <input id={`${ids}-details`} className={`${inputCls} mt-1`} maxLength={300} value={details} onChange={(event) => setDetails(event.target.value)} disabled={pending} />
          <p className="mt-1 text-sm text-muted-foreground">Work in progress stops its clock. Press Resume repair when the parts arrive.</p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PauseCircle aria-hidden="true" />}
            {pending ? "Pausing" : "Pause job"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}
