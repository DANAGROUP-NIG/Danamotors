"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Loader2, Pencil, ShieldCheck, UserCheck } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { NOT_PROVIDED } from "@/lib/format";
import { useFindingAutosave } from "../../hooks/use-job-diagnosis";
import { RETURN_NOTE_MAX, itemLine, returnNoteSchema, reviewRows, routingView, type ReturnNoteValues } from "../../lib/diagnosis.logic";
import type { CustomerRequest, DiagnosisRouting, JobDiagnosis, JobFinding } from "../../types/job-diagnosis.types";
import { PhotoThumb } from "../check-in/PhotoSlots";
import { StageCard } from "../workspace/StageCard";
import { FindingEditor } from "./FindingEditor";

/** The customer's requests, numbered as at check-in. */
export function CustomerRequests({ requests }: { requests: CustomerRequest[] }) {
  return (
    <StageCard title="What the customer asked for">
      {requests.length ? (
        <ol className="grid gap-2">
          {requests.map((request) => (
            <li key={request.id} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold" aria-hidden="true">
                {request.number}
              </span>
              <span className="min-w-0 break-words">{request.description}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No customer requests were recorded at check-in.</p>
      )}
    </StageCard>
  );
}

const ItemList = ({ items, empty }: { items: string[]; empty: string }) =>
  items.length ? (
    <ul className="grid gap-1">
      {items.map((line, index) => (
        <li key={index} className="break-words">
          {line}
        </li>
      ))}
    </ul>
  ) : (
    <span className="text-muted-foreground">{empty}</span>
  );

function Photos({ jobCardId, finding }: { jobCardId: string; finding: JobFinding | null }) {
  const photos = finding?.photos ?? [];
  if (!photos.length) return <span className="text-muted-foreground">None</span>;
  return (
    <div className="flex items-center gap-1.5">
      {photos.slice(0, 1).map((photo, index) => (
        <PhotoThumb key={photo.id} jobCardId={jobCardId} photoId={photo.id} alt={`Finding photo ${index + 1}`} className="size-12 rounded-md border border-border" />
      ))}
      {photos.length > 1 && <span className="text-xs text-muted-foreground">and {photos.length - 1} more</span>}
    </div>
  );
}

const warrantyBadge = (finding: JobFinding | null) =>
  finding?.possibleWarranty ? (
    <StatusBadge status="Possible warranty" tone="purple" className="text-xs normal-case" />
  ) : (
    <StatusBadge status="No" tone="gray" className="text-xs normal-case" />
  );

/**
 * The findings grouped by customer request: a table on larger screens, cards on phones. The engineer
 * gets an edit button per finding while reviewing; everyone else sees it read-only.
 */
export function ReviewTable({
  diagnosis,
  title,
  onEdit,
}: {
  diagnosis: JobDiagnosis;
  title: string;
  onEdit?: (finding: JobFinding, label: string) => void;
}) {
  const rows = reviewRows(diagnosis);
  const label = (request: CustomerRequest | null) => (request ? `request ${request.number}` : "the finding the customer did not mention");
  const work = (finding: JobFinding | null) => (finding?.items ?? []).filter((item) => item.kind === "LABOUR").map(itemLine);
  const parts = (finding: JobFinding | null) => (finding?.items ?? []).filter((item) => item.kind !== "LABOUR").map(itemLine);
  const text = (finding: JobFinding | null) => finding?.causeAndDefect.trim() || NOT_PROVIDED;
  return (
    <StageCard title={title} description="Findings from the workshop, grouped by what the customer asked for. No prices are shown here.">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] table-fixed text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="bg-muted/60 text-xs font-semibold text-muted-foreground">
            <tr>
              <th scope="col" className="w-[19%] p-3">Customer request</th>
              <th scope="col" className="w-[25%] p-3">Finding (cause and nature of defect)</th>
              <th scope="col" className="w-[16%] p-3">Work needed</th>
              <th scope="col" className="w-[16%] p-3">Parts needed</th>
              <th scope="col" className="w-28 p-3">Photos</th>
              <th scope="col" className="w-28 p-3">Possible warranty</th>
              {onEdit && (
                <th scope="col" className="w-16 p-3">
                  <span className="sr-only">Edit</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, request, finding }) => (
              <tr key={key} className="border-t border-border align-top">
                <th scope="row" className="p-3 font-semibold">
                  {request ? (
                    <span className="flex gap-2">
                      <span className="text-muted-foreground">{request.number}</span>
                      <span className="break-words">{request.description}</span>
                    </span>
                  ) : (
                    <span>Not mentioned by the customer</span>
                  )}
                </th>
                <td className="p-3 break-words">{text(finding)}</td>
                <td className="p-3">
                  <ItemList items={work(finding)} empty="None" />
                </td>
                <td className="p-3">
                  <ItemList items={parts(finding)} empty="None" />
                </td>
                <td className="p-3">
                  <Photos jobCardId={diagnosis.jobCardId} finding={finding} />
                </td>
                <td className="p-3">{warrantyBadge(finding)}</td>
                {onEdit && (
                  <td className="p-3 text-right">
                    {finding && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Edit the finding for ${label(request)}`}
                        title="Edit finding"
                        onClick={() => onEdit(finding, request ? `Request ${request.number}: ${request.description}` : "Finding the customer did not mention")}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {rows.map(({ key, request, finding }) => (
          <li key={key} className="grid gap-2 rounded-lg border border-border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{request ? `${request.number}. ${request.description}` : "Not mentioned by the customer"}</p>
              {onEdit && finding && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11 shrink-0"
                  aria-label={`Edit the finding for ${label(request)}`}
                  title="Edit finding"
                  onClick={() => onEdit(finding, request ? `Request ${request.number}: ${request.description}` : "Finding the customer did not mention")}
                >
                  <Pencil aria-hidden="true" />
                </Button>
              )}
            </div>
            <p className="break-words">{text(finding)}</p>
            <dl className="grid gap-1">
              <dt className="text-xs font-semibold text-muted-foreground">Work needed</dt>
              <dd>
                <ItemList items={work(finding)} empty="None" />
              </dd>
              <dt className="text-xs font-semibold text-muted-foreground">Parts needed</dt>
              <dd>
                <ItemList items={parts(finding)} empty="None" />
              </dd>
              <dt className="text-xs font-semibold text-muted-foreground">Photos</dt>
              <dd>
                <Photos jobCardId={diagnosis.jobCardId} finding={finding} />
              </dd>
            </dl>
            <div>{warrantyBadge(finding)}</div>
          </li>
        ))}
      </ul>
    </StageCard>
  );
}

/** Where the job goes when the engineer confirms, and why. */
export function RoutingCard({ routing }: { routing: DiagnosisRouting }) {
  const view = routingView(routing);
  const warranty = view.route === "WARRANTY";
  return (
    <StageCard title="Routing">
      <div className={warranty ? "flex gap-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-purple-900" : "flex gap-3 rounded-lg border border-border bg-muted/50 p-3"}>
        {warranty ? <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> : <UserCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <div className="grid gap-1 text-sm">
          {view.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
      {view.note && (
        <p className="flex gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {view.note}
        </p>
      )}
    </StageCard>
  );
}

/** "Return to technician" needs a note saying what to check again. Closes only on Cancel, Close or success. */
export function ReturnDialog({
  open,
  technician,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  technician: string | null;
  pending: boolean;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const form = useForm<ReturnNoteValues>({ resolver: zodResolver(returnNoteSchema), defaultValues: { note: "" } });
  const close = () => {
    if (pending) return;
    form.reset();
    onClose();
  };
  return (
    <ModalFame
      isOpen={open}
      onClose={close}
      preventAccidentalClose
      title="Return to technician"
      description={`${technician ?? "The technician"} gets a notification and sees your note at the top of the job.`}
    >
      <form className="grid gap-4" noValidate onSubmit={form.handleSubmit((values) => !pending && onConfirm(values.note))}>
        <Field label="Note to the technician" required error={form.formState.errors.note?.message}>
          <textarea className={`${inputCls} h-28 py-2`} maxLength={RETURN_NOTE_MAX} disabled={pending} autoFocus {...form.register("note")} />
          <span className="text-xs text-muted-foreground">Say what to check again or what is missing.</span>
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending ? "Returning" : "Return to technician"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}

/** The engineer corrects a finding. It saves as they type; Save and close waits for the last save. */
export function EditFindingDialog({ diagnosis, finding, label, onClose }: { diagnosis: JobDiagnosis; finding: JobFinding; label: string; onClose: () => void }) {
  const autosave = useFindingAutosave(diagnosis.jobCardId, finding.complaintId, finding, diagnosis.editable);
  const [closing, setClosing] = useState(false);
  const close = async () => {
    setClosing(true);
    const saved = await autosave.flush();
    setClosing(false);
    if (saved) onClose();
  };
  return (
    <ModalFame isOpen onClose={() => void close()} preventAccidentalClose title="Edit finding" description={label}>
      <div className="grid gap-4">
        <FindingEditor jobCardId={diagnosis.jobCardId} autosave={autosave} photos={finding.photos} editable={diagnosis.editable} textLabel="Finding (cause and nature of defect)" />
        <div className="flex justify-end">
          <Button type="button" onClick={() => void close()} disabled={closing}>
            {closing && <Loader2 className="animate-spin" aria-hidden="true" />}
            {closing ? "Saving" : "Save and close"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
