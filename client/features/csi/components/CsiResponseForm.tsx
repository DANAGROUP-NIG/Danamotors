"use client";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import { fmtDate, fmtNumber } from "@/features/reports/lib/report-format";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import {
  useCsiResponse,
  useSaveCsiResponse,
  type CsiSurveyDetail,
} from "../hooks/use-csi-responses";

export function CsiResponseForm({
  branchId,
  id,
  canEdit,
  onClose,
}: {
  branchId: string;
  id: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const query = useCsiResponse(branchId, id);
  const save = useSaveCsiResponse(branchId, id);
  return (
    <ModalFame
      isOpen
      preventAccidentalClose
      size="wide"
      title="CSI questionnaire response"
      description="Record the customer's answers from the issued questionnaire."
      onClose={() => {
        if (!save.isPending) onClose();
      }}
    >
      {query.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading the issued questionnaire
        </p>
      ) : query.isError ? (
        <div role="alert" className="space-y-3">
          <p>
            {apiErrorMessage(
              query.error,
              "The CSI questionnaire could not be loaded. Retry or check the selected branch.",
            )}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry questionnaire
          </Button>
        </div>
      ) : (
        <ResponseFields
          key={query.data.id + ":" + query.data.version}
          survey={query.data}
          canEdit={canEdit}
          pending={save.isPending}
          failure={
            save.error
              ? apiErrorMessage(
                  save.error,
                  "The response could not be saved. Review the fields and retry.",
                )
              : null
          }
          onReload={() => void query.refetch()}
          onClose={onClose}
          onSave={(input) =>
            save.mutate(input, {
              onSuccess: () =>
                toast.success(
                  "CSI response saved. The weighted score has been updated.",
                ),
              onError: (error) =>
                toast.error(
                  apiErrorMessage(
                    error,
                    "The CSI response could not be saved. Review the fields and retry.",
                  ),
                ),
            })
          }
        />
      )}
    </ModalFame>
  );
}
function ResponseFields({
  survey,
  canEdit,
  pending,
  failure,
  onReload,
  onClose,
  onSave,
}: {
  survey: CsiSurveyDetail;
  canEdit: boolean;
  pending: boolean;
  failure: string | null;
  onReload: () => void;
  onClose: () => void;
  onSave: (value: {
    version: number;
    responseDate: string;
    comments: string;
    answers: { attributeId: string; responseId: string }[];
  }) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      survey.answers.map((row) => [row.attributeId, row.responseId]),
    ),
  );
  const [date, setDate] = useState(
    survey.responseDate?.slice(0, 10) ?? survey.responseDateMax,
  );
  const [comments, setComments] = useState(survey.comments ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const job = survey.jobSnapshot;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    for (const row of survey.revision.attributes)
      if (!answers[row.attributeId])
        errors[row.attributeId] = "Select a response for this question.";
    if (!date || date < survey.responseDateMin || date > survey.responseDateMax)
      errors.date =
        "Select a response date from the questionnaire generation date through today.";
    setErrors(errors);
    if (!canEdit || pending || Object.keys(errors).length) return;
    onSave({
      version: survey.version,
      responseDate: date,
      comments,
      answers: survey.revision.attributes.map((row) => ({
        attributeId: row.attributeId,
        responseId: answers[row.attributeId],
      })),
    });
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {[
          ["Job number", job.jobNumber],
          ["Job date", fmtDate(job.jobDate)],
          ["Registration", job.registration],
          ["Sale date", fmtDate(job.saleDate)],
          ["Model", job.model],
          ["Variant", job.variant],
          [
            "Mileage",
            job.mileage === null ? null : fmtNumber(job.mileage, "integer"),
          ],
          [
            "CSI card",
            `${survey.revision.code}, version ${survey.revision.version}`,
          ],
          ["Card description", survey.revision.description],
          ["Card date", fmtDate(survey.revision.cardDate)],
          ["Customer", job.customer],
          ["Address", job.address],
          ["Mobile", job.mobile],
          ["Residence phone", job.residencePhone],
          ["Office phone", job.officePhone],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words">{value || "Not provided"}</dd>
          </div>
        ))}
      </dl>
      {survey.score !== null && (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted p-3 text-sm"
        >
          <p className="font-medium">
            Saved weighted score: {fmtNumber(Number(survey.score), "number")} (
            {fmtNumber(Number(survey.scorePercent), "number")}%)
          </p>
          <p>
            Revision {survey.version}. Corrections retain an audit of the
            previous answers.
          </p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Every question requires a response. Score is the sum of the stored
        weight x marks; percentage uses the issued card maximum. The proposed
        legacy formula awaits business confirmation.
      </p>
      {failure && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-border p-3 text-sm text-destructive"
        >
          <p>{failure}</p>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onReload}
          >
            Reload saved response
          </Button>
        </div>
      )}
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <Field label="Response date" required error={errors.date}>
          <DateInput
            value={date}
            onChange={setDate}
            min={survey.responseDateMin}
            max={survey.responseDateMax}
            invalid={!!errors.date}
            disabled={!canEdit || pending}
          />
        </Field>
        <div className="space-y-4">
          {survey.revision.attributes.map((row, index) => (
            <Field
              key={row.attributeId}
              label={`${index + 1}. ${row.description}`}
              required
              error={errors[row.attributeId]}
            >
              <select
                className={inputCls}
                value={answers[row.attributeId] ?? ""}
                aria-invalid={!!errors[row.attributeId]}
                onChange={(event) =>
                  setAnswers((old) => ({
                    ...old,
                    [row.attributeId]: event.target.value,
                  }))
                }
              >
                <option value="">Select customer response</option>
                {survey.revision.responses.map((response) => (
                  <option key={response.responseId} value={response.responseId}>
                    {response.description}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <Field label="Comments and suggestions">
          <textarea
            className={`${inputCls} h-24 py-2`}
            value={comments}
            maxLength={2000}
            onChange={(event) => setComments(event.target.value)}
          />
        </Field>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onClose}
        >
          Close response
        </Button>
        {canEdit && (
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving response"
              : survey.version
                ? "Save correction"
                : "Save response"}
          </Button>
        )}
      </div>
    </form>
  );
}
