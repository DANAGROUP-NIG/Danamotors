"use client";
import { useId, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { inputCls } from "@/components/forms/FormField";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { failProblems, type FailForm, type QcForm } from "../../lib/quality-check.logic";
import type { QcWorkLine } from "../../types/job-quality-check.types";

/**
 * "Fail and return to technician": which work failed (ticked from the lines marked Fail) and what
 * the technician must fix. It closes only on Cancel, the close icon or success; the text is kept on
 * a failed save.
 */
export function FailReturnDialog({
  jobNumber,
  workLines,
  form,
  initial,
  pending,
  failure,
  onConfirm,
  onClose,
}: {
  jobNumber: string;
  workLines: QcWorkLine[];
  form: QcForm;
  initial: FailForm;
  pending: boolean;
  failure: string | null;
  onConfirm: (fail: FailForm) => void;
  onClose: () => void;
}) {
  const [fail, setFail] = useState<FailForm>(initial);
  const [tried, setTried] = useState(false);
  const ids = useId();
  const problems = failProblems(fail, workLines.length > 0, form);
  const shown = tried ? problems : {};
  const toggle = (lineId: string, checked: boolean) =>
    setFail((current) => ({ ...current, failed: checked ? [...current.failed, lineId] : current.failed.filter((id) => id !== lineId) }));

  return (
    <ModalFame
      isOpen
      onClose={pending ? () => undefined : onClose}
      title="Fail and return to technician"
      description={`Job ${jobNumber} goes back to the technician with your note. The work you tick is reopened.`}
      placement="sheet"
      preventAccidentalClose
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setTried(true);
          if (!pending && !problems.notes && !problems.lines && !problems.form) onConfirm(fail);
        }}
      >
        {workLines.length > 0 && (
          <fieldset className="space-y-2" aria-describedby={shown.lines ? `${ids}-lines-error` : undefined}>
            <legend className="text-sm font-semibold">
              Work that failed<span className="text-red-500" aria-hidden="true"> *</span>
            </legend>
            {workLines.map((line) => (
              <div key={line.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3">
                <Checkbox
                  id={`${ids}-${line.id}`}
                  checked={fail.failed.includes(line.id)}
                  disabled={pending}
                  onCheckedChange={(checked) => toggle(line.id, checked)}
                />
                <label htmlFor={`${ids}-${line.id}`} className="flex-1 cursor-pointer py-2 font-medium">
                  {line.description}
                </label>
              </div>
            ))}
            {shown.lines && (
              <p id={`${ids}-lines-error`} className="text-sm text-destructive">
                {shown.lines}
              </p>
            )}
          </fieldset>
        )}
        <div>
          <label htmlFor={`${ids}-notes`} className="text-sm font-semibold">
            What must the technician fix<span className="text-red-500" aria-hidden="true"> *</span>
          </label>
          <textarea
            id={`${ids}-notes`}
            className={`${inputCls} mt-1 h-28 py-2`}
            maxLength={2000}
            value={fail.notes}
            disabled={pending}
            aria-invalid={!!shown.notes}
            aria-describedby={`${ids}-notes-help${shown.notes ? ` ${ids}-notes-error` : ""}`}
            onChange={(event) => setFail((current) => ({ ...current, notes: event.target.value }))}
          />
          <p id={`${ids}-notes-help`} className="mt-1 text-sm text-muted-foreground">
            The technician sees this note on the job and in My jobs.
          </p>
          {shown.notes && (
            <p id={`${ids}-notes-error`} className="mt-1 text-sm text-destructive">
              {shown.notes}
            </p>
          )}
        </div>
        {shown.form && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {shown.form}
          </p>
        )}
        {failure && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {failure}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="lg" variant="destructive" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
            {pending ? "Returning the job" : "Return to technician"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}
