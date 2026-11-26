"use client";
import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, CircleCheck, FileText, Fuel, Gauge, Loader2, Printer, ShieldAlert, TriangleAlert, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { formatDateTime, formatKm, NOT_PROVIDED } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useJobOpeningConsent, useSignJobOpening } from "../../hooks/use-job-opening-consent";
import { checklistFromSigned, consentFormProblems, damageSentence, fuelLabel, itemsInState, signedLine } from "../../lib/check-in.logic";
import type { CheckInStepKey, JobCheckIn } from "../../types/job-check-in.types";
import type { JobOpeningConsent, OpeningSignature } from "../../types/job-opening-consent.types";
import { SignaturePad } from "../SignaturePad";
import { StageCard } from "../workspace/StageCard";

const fieldCls =
  "h-12 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/**
 * Customer consent. The advisor hands the tablet to the customer: larger text, no prices and no
 * staff notes. Signing saves a version 2 job-opening signature that covers the walk-around.
 */
export function ConsentStep({
  jobCardId,
  checkIn,
  editable,
  onGoTo,
}: {
  jobCardId: string;
  checkIn: Pick<JobCheckIn, "gates" | "consentState">;
  editable: boolean;
  /** Opens another check-in step; absent outside check-in. */
  onGoTo?: (step: CheckInStepKey) => void;
}) {
  const { hasPermission } = useAuth();
  const consent = useJobOpeningConsent(jobCardId, hasPermission("jobcard:read"));
  const canSign = hasPermission("estimate:sign");
  const canPrint = hasPermission("estimate:print");

  if (consent.isLoading) return <LoadingSkeleton label="Loading the customer consent" />;
  if (consent.isError || !consent.data)
    return (
      <StageCard title="Customer consent">
        <p role="alert" className="text-sm">
          The customer consent could not be loaded. Check your connection and try again.
        </p>
        <Button type="button" variant="outline" onClick={() => void consent.refetch()}>
          Try again
        </Button>
      </StageCard>
    );

  const data = consent.data;
  if (data.state === "signed" && data.signature)
    return <SignedPanel jobCardId={jobCardId} signature={data.signature} canPrint={canPrint} />;

  if (!editable)
    return (
      <StageCard title="Customer consent">
        <p className="text-sm text-muted-foreground">
          {data.state === "legacy"
            ? "This job was opened before customer signatures were recorded on screen."
            : "The customer has not signed yet. The service advisor collects the signature."}
        </p>
      </StageCard>
    );

  const unfinished = [...checkIn.gates.details, ...checkIn.gates.walkAround];
  if (unfinished.length)
    return (
      <StageCard title="Customer consent" description="The customer signs once Details and Walk-around are complete.">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {unfinished.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {onGoTo && checkIn.gates.details.length > 0 && (
            <Button type="button" variant="outline" onClick={() => onGoTo("DETAILS")}>
              Go to Details
            </Button>
          )}
          {onGoTo && checkIn.gates.walkAround.length > 0 && (
            <Button type="button" variant="outline" onClick={() => onGoTo("WALK_AROUND")}>
              Go to Walk-around
            </Button>
          )}
        </div>
      </StageCard>
    );

  if (!canSign)
    return (
      <StageCard title="Customer consent">
        <p role="status" className="flex items-start gap-2 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Your account cannot collect customer signatures. Ask a service advisor or service manager to collect it.
        </p>
      </StageCard>
    );

  return (
    <div className="space-y-4">
      {(data.state === "stale" || data.state === "invalid") && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            {data.state === "stale"
              ? "The details changed after the customer signed. Ask the customer to check them and sign again."
              : "The saved signature could not be verified. Ask the customer to sign again."}
          </p>
        </div>
      )}
      {/* A new document (for example after a change) starts a fresh form, so no old ink or tick carries over. */}
      <CustomerConsentForm key={data.expectedHash} jobCardId={jobCardId} consent={data} />
    </div>
  );
}

function SummaryRow({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="break-words text-base font-semibold">{value}</dd>
      </div>
    </div>
  );
}

function CustomerConsentForm({ jobCardId, consent }: { jobCardId: string; consent: JobOpeningConsent }) {
  const sign = useSignJobOpening(jobCardId);
  const { document } = consent;
  const scope = document.scope;
  const walkAround = document.version === 2 ? document.scope.checkIn : null;
  const checklist = walkAround ? checklistFromSigned(walkAround.checklist) : {};
  const items = walkAround?.checklist ?? [];
  const [accepted, setAccepted] = useState(false);
  const [signer, setSigner] = useState<"OWNER" | "REPRESENTATIVE">("OWNER");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof consentFormProblems>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const termsId = useId();
  const noTerms = document.terms.length === 0;

  function submit() {
    if (sign.isPending) return;
    const problems = consentFormProblems({ accepted, signer, name, phone, relationship, signature });
    setErrors(problems);
    if (Object.keys(problems).length || !signature) return;
    setFailure(null);
    sign.mutate(
      {
        accepted: true,
        expectedHash: consent.expectedHash,
        idempotencyKey: key,
        signerName: signer === "OWNER" ? scope.customerName : name.trim(),
        ...(signer === "REPRESENTATIVE" ? { relationship: relationship.trim(), signerPhone: phone.trim() } : {}),
        signatureImage: signature,
      },
      {
        onSuccess: () => toast.success(`Customer consent signed for job ${scope.jobNumber}`),
        // Everything entered stays on screen, including the signature, so Sign and accept can be pressed again.
        onError: (error) => setFailure(apiErrorMessage(error, "The signature was not saved. Check your connection and press Sign and accept again.")),
      },
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 text-base">
      <div>
        <h3 className="text-xl font-semibold">Please confirm your vehicle details</h3>
        <p className="text-muted-foreground">Review the information below, read the terms and conditions, and sign to proceed with the service.</p>
      </div>

      <section aria-label="Your vehicle" className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <p className="text-lg font-semibold">
          {scope.registration ?? NOT_PROVIDED}
          <span className="block text-base font-normal text-muted-foreground">{scope.service}</span>
        </p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <SummaryRow icon={Gauge} label="Mileage" value={formatKm(scope.mileage)} />
          <SummaryRow icon={Fuel} label="Fuel level" value={walkAround ? fuelLabel(walkAround.fuelLevel) : NOT_PROVIDED} />
          <SummaryRow icon={Wrench} label="Damage noted" value={walkAround ? damageSentence(walkAround.damageMarks) : NOT_PROVIDED} />
          <SummaryRow icon={TriangleAlert} label="Missing" value={walkAround ? itemsInState(checklist, items, "MISSING") : NOT_PROVIDED} />
          <SummaryRow icon={TriangleAlert} label="Not working" value={walkAround ? itemsInState(checklist, items, "NOT_WORKING") : NOT_PROVIDED} />
          <SummaryRow icon={CalendarDays} label="Promised delivery" value={formatDateTime(scope.promisedAt)} />
        </dl>
        <div>
          <h4 className="font-semibold">Your requests</h4>
          <ol className="mt-2 space-y-2">
            {scope.requests.map((request, index) => (
              <li key={request.id} className="flex gap-3 rounded-lg bg-muted/50 px-3 py-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-sm font-semibold" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="min-w-0 break-words">{request.description}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby={termsId} className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h4 id={termsId} className="font-semibold">
          Terms and conditions
        </h4>
        <p className="text-sm text-muted-foreground">{document.statement}</p>
        {noTerms ? (
          <p role="alert" className="text-sm text-destructive">
            No job card terms are set up for this branch. Ask an administrator to add them under Settings, then reload this page.
          </p>
        ) : (
          <div tabIndex={0} aria-label="Terms and conditions, scroll to read all" className="max-h-64 overflow-y-auto rounded-lg border border-border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ol className="list-decimal space-y-2 pl-6">
              {document.terms.map((term, index) => (
                <li key={index} className="whitespace-pre-wrap break-words">
                  {term}
                </li>
              ))}
            </ol>
            {document.footer && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{document.footer}</p>}
          </div>
        )}
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-primary"
            checked={accepted}
            disabled={sign.isPending || noTerms}
            aria-invalid={!!errors.accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          I have read and accept the terms and conditions.
        </label>
        {errors.accepted && (
          <p role="alert" className="text-sm text-destructive">
            {errors.accepted}
          </p>
        )}
      </section>

      <section aria-label="Who is signing" className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <fieldset disabled={sign.isPending} className="space-y-3">
          <legend className="font-semibold">Who is signing</legend>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border">
            {(["OWNER", "REPRESENTATIVE"] as const).map((value, index) => (
              <label
                key={value}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center justify-center font-medium focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring",
                  index > 0 && "border-l border-border",
                  signer === value ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                <input type="radio" name="signer" value={value} checked={signer === value} onChange={() => setSigner(value)} className="sr-only" />
                {value === "OWNER" ? "Owner" : "Representative"}
              </label>
            ))}
          </div>
          {signer === "OWNER" ? (
            <p>
              Signing as <span className="font-semibold">{scope.customerName}</span>
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <SignerField label="Name" error={errors.name}>
                <input className={fieldCls} maxLength={200} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
              </SignerField>
              <SignerField label="Phone" error={errors.phone}>
                <input className={fieldCls} type="tel" inputMode="tel" maxLength={20} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </SignerField>
              <SignerField label="Relationship" error={errors.relationship}>
                <input className={fieldCls} maxLength={200} placeholder="For example: driver" value={relationship} onChange={(event) => setRelationship(event.target.value)} />
              </SignerField>
            </div>
          )}
        </fieldset>
      </section>

      <section aria-label="Signature" className="space-y-2 rounded-xl border border-border bg-card p-4 sm:p-5">
        <p className="font-semibold">
          Signature <span className="text-destructive" aria-hidden="true">*</span>
        </p>
        <SignaturePad label="Customer signature. Sign with a finger or stylus." onChange={setSignature} disabled={sign.isPending} />
        {errors.signature && (
          <p role="alert" className="text-sm text-destructive">
            {errors.signature}
          </p>
        )}
      </section>

      {failure && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {failure}
        </p>
      )}
      <Button type="button" size="lg" className="h-12 w-full text-base" disabled={sign.isPending || noTerms} onClick={submit}>
        {sign.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {sign.isPending ? "Saving signature" : "Sign and accept"}
      </Button>
    </div>
  );
}

function SignerField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 content-start gap-1.5">
      <span className="font-medium">
        {label}
        <span className="ml-1 text-destructive" aria-hidden="true">
          *
        </span>
      </span>
      {children}
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}

/** After signing: who signed and when, with the signed copy. Shown read-only from then on. */
export function SignedPanel({ jobCardId, signature, canPrint }: { jobCardId: string; signature: OpeningSignature; canPrint: boolean }) {
  const href = `/job-cards/${jobCardId}/opening-consent/${signature.id}/print`;
  const when = formatDateTime(signature.signedAt);
  return (
    <div className="space-y-4">
      <div role="status" className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-emerald-900">
        <CircleCheck className="size-8" aria-hidden="true" />
        <p className="text-lg font-semibold">{signedLine(signature, when)}</p>
        {canPrint && (
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold">
            <Link href={href} className="inline-flex items-center gap-1.5 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <FileText className="size-4" aria-hidden="true" />
              View signed copy
            </Link>
            <Link href={`${href}?print=1`} className="inline-flex items-center gap-1.5 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Printer className="size-4" aria-hidden="true" />
              Print
            </Link>
          </div>
        )}
      </div>
      <StageCard title="Consent summary">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Signed by</dt>
            <dd className="font-medium">
              {signature.signerName} ({signature.relationship ? "Representative" : "Owner"})
            </dd>
          </div>
          {signature.relationship && (
            <div>
              <dt className="text-muted-foreground">Relationship and phone</dt>
              <dd className="font-medium">
                {signature.relationship}, {signature.signerPhone || NOT_PROVIDED}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">Date and time</dt>
            <dd className="font-medium">{when}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Method</dt>
            <dd className="font-medium">Signed on screen</dd>
          </div>
        </dl>
      </StageCard>
    </div>
  );
}
