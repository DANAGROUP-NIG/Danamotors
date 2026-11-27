"use client";
import { useId, useState, type ReactNode } from "react";
import { AlertTriangle, CircleDot, Droplet, Gauge, ShieldCheck, Snowflake, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { inputCls } from "@/components/forms/FormField";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { cn } from "@/lib/utils";
import { useRecordQualityCheck } from "../../hooks/use-job-quality-check";
import { initialFailForm, initialQcForm, passBlockers, qcFieldErrors, qcPayload, type FailForm, type QcForm } from "../../lib/quality-check.logic";
import type { JobCard } from "../../types/job-card.types";
import type { JobQualityCheckStep, QcLineResult } from "../../types/job-quality-check.types";
import type { StageBarProps } from "../check-in/CheckInStep";
import { SignaturePad } from "../SignaturePad";
import { StageActionBar } from "../workspace/StageActionBar";
import { StageCard } from "../workspace/StageCard";
import { FailReturnDialog } from "./FailReturnDialog";
import { QcHistory } from "./QcHistory";

const GENERAL_ICONS: Record<string, typeof Gauge> = {
  NO_WARNING_LIGHTS: Gauge,
  FLUID_LEVELS: Droplet,
  WHEEL_NUTS: CircleDot,
  INTERIOR_CLEAN: Sparkles,
};

/**
 * Step 6: the supervisor's quality check, tablet first. Each approved work item is passed or failed,
 * then the general checks, the road test and the signed roadworthy certification. "Pass quality
 * check" hands the job to the service advisor; "Fail and return to technician" reopens the failed work.
 */
export function QualityCheckForm({ job, step, bar, children }: { job: JobCard; step: JobQualityCheckStep; bar: StageBarProps; children?: ReactNode }) {
  const { user } = useAuth();
  const record = useRecordQualityCheck(job.id);
  const [form, setForm] = useState<QcForm>(() => initialQcForm(step));
  const [failing, setFailing] = useState<FailForm | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<"PASS" | "FAIL" | null>(null);
  // A new pad on Clear, and after a failed save the signature is kept.
  const [padKey, setPadKey] = useState(0);
  const ids = useId();
  const fields = qcFieldErrors(form);
  const blockers = passBlockers(form, step);
  // The bar names the first thing to do and how many are left, so it stays short on a phone.
  const blockedReason = blockers.length > 1 ? `${blockers[0]} ${blockers.length - 1} more ${blockers.length === 2 ? "thing" : "things"} to do before you can pass.` : undefined;
  const busy = pending !== null;
  const set = <K extends keyof QcForm>(key: K, value: QcForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setLine = (lineId: string, result: QcLineResult) => setForm((current) => ({ ...current, lines: { ...current.lines, [lineId]: result } }));
  const setGeneral = (code: string, passed: boolean) => setForm((current) => ({ ...current, general: { ...current.general, [code]: passed } }));
  const signer = user ? `${user.firstName} ${user.lastName}`.trim() : null;

  function submit(outcome: "PASS" | "FAIL", fail?: FailForm) {
    if (busy) return;
    setFailure(null);
    setPending(outcome);
    record
      .mutateAsync(qcPayload(form, step, outcome, crypto.randomUUID(), fail))
      .then(() => {
        setFailing(null);
        toast.success(
          outcome === "PASS"
            ? `Quality check passed on job ${job.jobNumber}. The service advisor has the job.`
            : `Job ${job.jobNumber} returned to the technician.`,
        );
      })
      .catch((error: unknown) => {
        const message = apiErrorMessage(error, "The quality check was not saved. Check your connection and try again. Your entries are kept.");
        setFailure(message);
        if (outcome === "PASS") toast.error(message);
      })
      .finally(() => setPending(null));
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <StageCard title="Approved work" description="Check that each approved work item was done properly.">
            {step.workLines.length === 0 ? (
              <p className="text-sm">No approved work is listed for this job. It was released before work lists were kept. Check the work against the estimate in the job file.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {step.workLines.map((line) => (
                  <li key={line.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                    {/* On phones the Pass and Fail buttons sit under the work at full width. */}
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="break-words font-medium">{line.description}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {line.technician && <span className="text-xs text-muted-foreground">{line.technician}</span>}
                        {line.reopened && <StatusBadge status="Redone after a failed check" tone="amber" className="text-xs normal-case" />}
                        {line.supplementary && <StatusBadge status="Added during repair" tone="gray" className="text-xs normal-case" />}
                      </div>
                    </div>
                    <div role="group" aria-label={`${line.description}: pass or fail`} className="grid w-full grid-cols-2 overflow-hidden rounded-lg border border-border text-sm sm:w-auto">
                      {(["PASS", "FAIL"] as const).map((value, index) => {
                        const chosen = form.lines[line.id] === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            disabled={busy}
                            aria-pressed={chosen}
                            onClick={() => setLine(line.id, value)}
                            className={cn(
                              "min-h-11 min-w-20 px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                              index > 0 && "border-l border-border",
                              chosen ? (value === "PASS" ? "bg-emerald-600 text-white" : "bg-destructive text-destructive-foreground") : "bg-card text-foreground hover:bg-muted",
                            )}
                          >
                            {value === "PASS" ? "Pass" : "Fail"}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </StageCard>

          <StageCard title="General checks" description="Confirm each item before the vehicle leaves the workshop.">
            <ul className="divide-y divide-border rounded-xl border border-border">
              {step.generalChecks.map((check) => {
                const Icon = GENERAL_ICONS[check.code] ?? ShieldCheck;
                return (
                  <li key={check.code} className="flex min-h-12 items-center gap-3 px-3">
                    <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <label htmlFor={`${ids}-${check.code}`} className="flex-1 cursor-pointer py-3 text-sm font-medium">
                      {check.label}
                    </label>
                    <Checkbox id={`${ids}-${check.code}`} checked={!!form.general[check.code]} disabled={busy} onCheckedChange={(checked) => setGeneral(check.code, checked)} />
                  </li>
                );
              })}
              <li className="flex flex-wrap items-center gap-3 px-3 py-2">
                <Snowflake className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <label htmlFor={`${ids}-ac`} className="flex-1 text-sm font-medium">
                  AC outlet temperature
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={`${ids}-ac`}
                    className={`${inputCls} w-20 text-right tabular-nums`}
                    inputMode="decimal"
                    maxLength={4}
                    value={form.acOutletTempC}
                    disabled={busy}
                    aria-invalid={!!fields.acOutletTempC}
                    aria-describedby={`${ids}-ac-help`}
                    onChange={(event) => set("acOutletTempC", event.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">°C</span>
                </div>
                <p id={`${ids}-ac-help`} className={cn("basis-full text-sm", fields.acOutletTempC ? "text-destructive" : "text-muted-foreground")}>
                  {fields.acOutletTempC ?? "Optional. Leave it empty if the vehicle has no air conditioning."}
                </p>
              </li>
            </ul>
          </StageCard>
        </div>

        <div className="min-w-0 space-y-4">
          <StageCard title="Road test" description="Drive the vehicle to confirm the repair.">
            <div className="grid gap-3 sm:grid-cols-2">
              <KmField id={`${ids}-start`} label="Start km" value={form.startKm} error={fields.startKm} help="The check-in reading. Change it if the odometer shows another reading." disabled={busy} onChange={(value) => set("startKm", value)} />
              <KmField id={`${ids}-end`} label="End km" value={form.endKm} error={fields.endKm} disabled={busy} onChange={(value) => set("endKm", value)} />
            </div>
            <div>
              <label htmlFor={`${ids}-road-notes`} className="text-sm font-semibold">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id={`${ids}-road-notes`}
                className={`${inputCls} mt-1 h-24 py-2`}
                maxLength={2000}
                value={form.roadTestNotes}
                disabled={busy}
                onChange={(event) => set("roadTestNotes", event.target.value)}
              />
            </div>
          </StageCard>

          <StageCard title="Certification">
            <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-900">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              {step.statement}.
            </p>
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                Supervisor&apos;s signature<span className="text-red-500" aria-hidden="true"> *</span>
              </p>
              <SignaturePad key={padKey} label="Sign to certify the vehicle as roadworthy" onChange={(image) => set("signature", image)} disabled={busy} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{signer ? `Signing as ${signer}.` : "Sign in the box."} Needed to pass the check, not to fail it.</p>
                {form.signature && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      set("signature", null);
                      setPadKey((key) => key + 1);
                    }}
                  >
                    Clear signature
                  </Button>
                )}
              </div>
            </div>
          </StageCard>
        </div>
      </div>

      {children}
      <QcHistory history={step.history} />

      {failure && !failing && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {failure}
        </p>
      )}

      <StageActionBar
        primary={{ action: "QC_PASSED_TO_ADVISOR", kind: "primary", enabled: blockers.length === 0, reasons: blockers, requiresNote: false }}
        secondary={[]}
        danger={bar.danger}
        pending={pending === "PASS" ? "QC_PASSED_TO_ADVISOR" : pending === "FAIL" ? "RETURN_TO_REPAIR" : null}
        onAction={() => submit("PASS")}
        onDangerAction={bar.onDangerAction}
        note="The service advisor takes the job for billing."
        blockedReason={blockedReason}
        extra={
          <Button
            type="button"
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10"
            disabled={busy}
            onClick={() => {
              setFailure(null);
              setFailing(initialFailForm(form, step));
            }}
          >
            <AlertTriangle aria-hidden="true" />
            Fail and return to technician
          </Button>
        }
      />

      {failing && (
        <FailReturnDialog
          jobNumber={job.jobNumber}
          workLines={step.workLines}
          form={form}
          initial={failing}
          pending={pending === "FAIL"}
          failure={failure}
          onConfirm={(fail) => submit("FAIL", fail)}
          onClose={() => {
            setFailing(null);
            setFailure(null);
          }}
        />
      )}
    </>
  );
}

function KmField({
  id,
  label,
  value,
  error,
  help,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  help?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const described = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        <span className="text-red-500" aria-hidden="true"> *</span>
      </label>
      <input
        id={id}
        className={`${inputCls} mt-1 tabular-nums`}
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        value={value}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={described}
        onChange={(event) => onChange(event.target.value)}
      />
      {help && (
        <p id={`${id}-help`} className="mt-1 text-xs text-muted-foreground">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
