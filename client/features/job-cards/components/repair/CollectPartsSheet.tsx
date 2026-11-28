"use client";
import { formatQuantity } from "@/lib/format";
import { useId, useState } from "react";
import { Check, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { useCollectParts } from "../../hooks/use-job-repair";
import { collectProblems, collectionConfirmation } from "../../lib/repair.logic";
import type { CollectablePart } from "../../types/job-repair.types";
import { SignaturePad } from "../SignaturePad";

/**
 * "Collect parts": tick what you take from the store and sign once. The signature is recorded on each
 * part through the existing collection endpoint. It closes only on Close, Cancel or success; a part
 * that fails stays ticked with the reason, so Sign and collect sends only what is left.
 */
export function CollectPartsSheet({ jobCardId, parts, onClose }: { jobCardId: string; parts: CollectablePart[]; onClose: () => void }) {
  const collect = useCollectParts(jobCardId);
  const [selected, setSelected] = useState<string[]>(() => parts.map((part) => part.issuanceId));
  const [signature, setSignature] = useState<string | null>(null);
  // After the first try, the messages follow what is on screen, so a fixed mistake clears at once.
  const [tried, setTried] = useState(false);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const ids = useId();
  const busy = collect.isPending;
  const chosen = parts.filter((part) => selected.includes(part.issuanceId));
  const errors = tried ? collectProblems(selected, signature) : {};

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (Object.keys(collectProblems(selected, signature)).length || !signature) return;
    collect
      .mutateAsync({ issuanceIds: selected, signatureImage: signature })
      .then(({ collected, failed }) => {
        if (!failed.length) {
          toast.success(collected === 1 ? "1 part collected and signed for" : `${collected} parts collected and signed for`);
          onClose();
          return;
        }
        setFailures(Object.fromEntries(failed.map((row) => [row.issuanceId, apiErrorMessage(row.error, "Not saved. Check your connection.")])));
        setSelected(failed.map((row) => row.issuanceId));
        if (collected) toast.success(collected === 1 ? "1 part collected and signed for" : `${collected} parts collected and signed for`);
      });
  }

  const failedCount = Object.keys(failures).length;
  return (
    <ModalFame isOpen onClose={busy ? () => undefined : onClose} title="Collect parts" description="Tick the parts you are taking from the store, then sign." placement="sheet" preventAccidentalClose>
      <form onSubmit={submit} noValidate className="space-y-4">
        <fieldset aria-describedby={errors.parts ? `${ids}-parts` : undefined} disabled={busy}>
          <legend className="sr-only">Parts to collect</legend>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {parts.map((part) => {
              const checked = selected.includes(part.issuanceId);
              const failure = failures[part.issuanceId];
              return (
                <li key={part.issuanceId}>
                  <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-5 shrink-0 accent-primary"
                      checked={checked}
                      onChange={(event) => setSelected((current) => (event.target.checked ? [...current, part.issuanceId] : current.filter((id) => id !== part.issuanceId)))}
                    />
                    <Package className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words font-medium">{part.description}</span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">Qty {formatQuantity(part.quantity)}</span>
                  </label>
                  {failure && (
                    <p role="alert" className="px-3 pb-2 text-sm text-destructive">
                      {failure}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {errors.parts && (
            <p id={`${ids}-parts`} className="mt-1 text-sm text-destructive">
              {errors.parts}
            </p>
          )}
        </fieldset>
        <div className="space-y-2">
          <SignaturePad label="Sign to confirm you collected these parts" onChange={setSignature} disabled={busy} />
          {errors.signature && <p className="text-sm text-destructive">{errors.signature}</p>}
          <p className="text-sm text-muted-foreground">{collectionConfirmation(chosen.map((part) => part.issuedBy))}</p>
        </div>
        {failedCount > 0 && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {failedCount === 1 ? "1 part was not saved." : `${failedCount} parts were not saved.`} Your signature is kept. Press Sign and collect to try again.
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
            {busy ? "Saving collection" : "Sign and collect"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}
