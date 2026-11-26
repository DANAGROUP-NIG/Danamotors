"use client";
import { useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import ModalFame from "@/components/modals/ModalFame";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { lagosDate } from "@/features/service-transactions/transaction.logic";
import {
  useJobOpeningConsent,
  useSignJobOpening,
} from "../hooks/use-job-opening-consent";
import type { JobOpeningConsent } from "../types/job-opening-consent.types";
import { JobOpeningDocument } from "./JobOpeningDocument";
import { SignaturePad } from "./SignaturePad";

const stateLabels = {
  legacy: "Historical job, opening signature not recorded",
  required: "Customer signature required before work starts",
  signed: "Job opening signed",
  stale: "Job details changed, obtain a new signature",
  invalid: "Signature evidence could not be verified, obtain a new signature",
};

export function JobOpeningConsentCard({
  jobCardId,
  closed,
  embedded = false,
}: {
  jobCardId: string;
  closed: boolean;
  embedded?: boolean;
}) {
  const { hasPermission } = useAuth();
  const allowed = hasPermission("jobcard:read");
  const query = useJobOpeningConsent(jobCardId, allowed);
  const [open, setOpen] = useState(false);
  if (!allowed) return null;
  if (query.isLoading)
    return <LoadingSkeleton label="Loading job-opening consent" />;
  if (query.isError || !query.data)
    return (
      <section className="space-y-2 rounded-xl border border-border p-4">
        <p role="alert">
          Job-opening consent could not be loaded. Reload to review it.
        </p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Reload consent
        </Button>
      </section>
    );
  const consent = query.data;
  const surface = embedded
    ? consent.state === "signed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-border bg-card"
    : "border-border";
  return (
    <section
      className={`space-y-3 rounded-xl border p-4 print:hidden ${surface}`}
      aria-label="Job-opening approval"
    >
      <h2 className="font-semibold">Job-opening approval</h2>
      <p role="status" className="text-sm">
        {stateLabels[consent.state] ?? "Consent status unavailable"}
      </p>
      <p className="text-sm text-muted-foreground">
        This customer signature is separate from estimate approval.
      </p>
      {consent.signature && (
        <p className="text-sm">
          Signed by {consent.signature.signerName} on{" "}
          {lagosDate(consent.signature.signedAt)}, revision{" "}
          {consent.signature.revision}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => query.refetch()}>
          Reload consent
        </Button>
        {!closed && hasPermission("estimate:sign") && (
          <Button type="button" onClick={() => setOpen(true)}>
            {consent.state === "signed"
              ? "Review and sign a new revision"
              : "Get job-opening signature"}
          </Button>
        )}
        {consent.signature &&
          consent.state !== "invalid" &&
          hasPermission("estimate:print") && (
            <Button asChild variant="outline">
              <Link
                href={`/job-cards/${jobCardId}/opening-consent/${consent.signature.id}/print`}
              >
                Print signed job opening
              </Link>
            </Button>
          )}
      </div>
      {open && (
        <SignOpeningModal
          key={consent.expectedHash}
          jobCardId={jobCardId}
          consent={consent}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

function SignOpeningModal({
  jobCardId,
  consent,
  onClose,
}: {
  jobCardId: string;
  consent: JobOpeningConsent;
  onClose: () => void;
}) {
  const mutation = useSignJobOpening(jobCardId);
  const [name, setName] = useState(consent.document.scope.customerName);
  const [relationship, setRelationship] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const normalize = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLowerCase();
  const representative =
    normalize(name) !== normalize(consent.document.scope.customerName);
  const valid =
    !!name.trim() &&
    accepted &&
    !!signature &&
    (!representative || !!relationship.trim());
  const error = mutation.error
    ? isAxiosError(mutation.error)
      ? mutation.error.response?.data?.message
      : "Signature could not be saved. Check the signer and reload if the job changed."
    : null;
  return (
    <ModalFame
      isOpen
      preventAccidentalClose
      title="Sign job-opening approval"
      description="Review the saved job details and terms with the customer."
      size="wide"
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <div className="space-y-4">
        <JobOpeningDocument document={consent.document} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Signer name"
            required
            error={
              !name.trim()
                ? "Enter the customer or representative name"
                : undefined
            }
          >
            <input
              className={inputCls}
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={mutation.isPending}
            />
          </Field>
          <Field
            label="Relationship or authority"
            required={representative}
            error={
              representative && !relationship.trim()
                ? "Explain who is signing for the customer"
                : undefined
            }
          >
            <input
              className={inputCls}
              maxLength={200}
              value={relationship}
              onChange={(event) => setRelationship(event.target.value)}
              disabled={mutation.isPending}
            />
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={accepted}
            disabled={mutation.isPending}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          I approve this job opening and accept the job card terms shown above.
          Repair costs require separate estimate approval.
        </label>
        <SignaturePad
          label="Draw customer job-opening signature"
          onChange={setSignature}
          disabled={mutation.isPending}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!valid || mutation.isPending}
            onClick={() => {
              if (!valid || !signature) return;
              mutation.mutate(
                {
                  accepted: true,
                  expectedHash: consent.expectedHash,
                  idempotencyKey: key,
                  signerName: name.trim(),
                  relationship: relationship.trim() || undefined,
                  signatureImage: signature,
                },
                {
                  onSuccess: () => {
                    toast.success("Job-opening approval signed");
                    onClose();
                  },
                },
              );
            }}
          >
            {mutation.isPending
              ? "Saving signature"
              : "Save signed job-opening approval"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
