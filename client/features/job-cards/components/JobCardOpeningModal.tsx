"use client";
import { useRef, useState, useEffect } from "react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import type { CreateJobCardFormValues } from "../schemas/job-card.schema";
import { JobCardCreateForm } from "./JobCardCreateForm";

export function JobCardOpeningModal(
  {
    isOpen,
    onClose,
    defaultValues,
  }: {
    isOpen: boolean;
    onClose: () => void;
    defaultValues?: Partial<CreateJobCardFormValues>;
  },
) {
  return isOpen ? <OpeningSession onClose={onClose} defaultValues={defaultValues} /> : null;
}

function OpeningSession(
  {
    onClose,
    defaultValues,
  }: {
    onClose: () => void;
    defaultValues?: Partial<CreateJobCardFormValues>;
  },
) {
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (discard)
      keep.current?.focus();
  }, [discard]);

  const requestClose = () => {
    if (pending)
      return;

    if (discard) {
      setDiscard(false);
      return;
    }

    if (dirty)
      setDiscard(true);
    else
      onClose();
  };

  return (
    <ModalFame isOpen onClose={requestClose} title="Job Card Opening" size="wide" flush>
      <div hidden={discard}><JobCardCreateForm
          defaultValues={defaultValues}
          onSuccess={onClose}
          onClose={requestClose}
          onDirtyChange={setDirty}
          onPendingChange={setPending} /></div>
      {discard && <div
        role="alertdialog"
        aria-labelledby="discard-job-title"
        aria-describedby="discard-job-description"
        className="p-6"><h3 id="discard-job-title" className="font-semibold">Discard this job card?</h3><p id="discard-job-description" className="mt-2 text-sm text-muted-foreground">You have unsaved changes. Keep editing or discard them and close.</p><div className="mt-6 flex flex-wrap justify-end gap-2"><Button ref={keep} type="button" variant="outline" onClick={() => setDiscard(false)}>Keep editing</Button><Button type="button" variant="destructive" onClick={onClose}>Discard changes</Button></div></div>}
    </ModalFame>
  );
}
