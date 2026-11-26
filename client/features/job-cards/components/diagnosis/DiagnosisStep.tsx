"use client";
import { useId, useMemo, useState } from "react";
import { Loader2, RefreshCw, UserCog, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { useJobDiagnosis } from "../../hooks/use-job-diagnosis";
import { useWorkshopActions } from "../../hooks/use-workshop-actions";
import {
  assignButtonLabel,
  engineerLine,
  type AllocationValues,
} from "../../lib/diagnosis.logic";
import type { JobCard } from "../../types/job-card.types";
import type { JobDiagnosis } from "../../types/job-diagnosis.types";
import type { StageAction } from "../../types/job-workspace.types";
import type { StageBarProps } from "../check-in/CheckInStep";
import { StageActionBar } from "../workspace/StageActionBar";
import { StageCard } from "../workspace/StageCard";
import { AllocationStep } from "./AllocationStep";
import {
  CustomerRequests,
  EditFindingDialog,
  ReturnDialog,
  ReviewTable,
  RoutingCard,
} from "./DiagnosisParts";
import { FindingsStep, type FlushRegistry } from "./FindingsStep";

/** Diagnosis: the supervisor assigns, the technician records findings, the service engineer confirms. */
export function DiagnosisStep({ job, bar }: { job: JobCard; bar: StageBarProps }) {
  const query = useJobDiagnosis(job.id);
  if (query.isLoading)
    return (
      <>
        <LoadingSkeleton label="Loading diagnosis" />
        <StageActionBar {...bar} primary={null} secondary={[]} />
      </>
    );
  if (query.isError || !query.data)
    return (
      <>
        <StageCard title="Diagnosis">
          <p role="alert" className="text-sm">
            Diagnosis could not be loaded. Check your connection and try again.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {query.isFetching ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw aria-hidden="true" />
              )}
              Try again
            </Button>
          </div>
        </StageCard>
        <StageActionBar {...bar} />
      </>
    );
  return (
    <DiagnosisLoaded job={job} diagnosis={query.data} bar={bar} />
  );
}

function DiagnosisLoaded({ job, diagnosis, bar }: { job: JobCard; diagnosis: JobDiagnosis; bar: StageBarProps }) {
  const formId = useId();
  const registry: FlushRegistry = useMemo(() => new Map(), []);
  const { assign } = useWorkshopActions(job.id, job.jobNumber);
  const [reassigning, setReassigning] = useState(false);
  const [chosen, setChosen] = useState<string | null>(
    diagnosis.technician?.name ?? null,
  );
  const [returning, setReturning] = useState(false);
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(
    null,
  );
  const [flushing, setFlushing] = useState(false);
  const { subStep } = diagnosis;
  const allocating =
    diagnosis.canAllocate && (subStep === "ASSIGN_TECHNICIAN" || reassigning);

  const submitAllocation = (values: AllocationValues, name: string) => {
    if (assign.isPending) return;
    assign.mutate(
      {
        technicianId: values.technicianId,
        bayId: values.bayId,
        note: values.note.trim() || undefined,
        requestId: crypto.randomUUID(),
      },
      {
        onSuccess: () => {
          toast.success(`Job ${job.jobNumber} sent to ${name}`);
          setReassigning(false);
        },
        // Choices stay on screen; nothing is lost.
        onError: (error) =>
          toast.error(
            apiErrorMessage(
              error,
              "The technician was not assigned. Check your connection and try again.",
            ),
          ),
      },
    );
  };

  /** Every finding is saved before the job goes to the engineer. */
  const onAction = async (action: StageAction) => {
    if (action === "RETURN_TO_TECHNICIAN") {
      setReturning(true);
      return;
    }
    if (action === "SEND_TO_ENGINEER") {
      setFlushing(true);
      const results = await Promise.all(
        [...registry.values()].map((flush) => flush()),
      );
      setFlushing(false);
      if (results.some((ok) => !ok)) {
        toast.error(
          "Some findings are not saved. Press Retry on the finding marked Not saved, then send again.",
        );
        return;
      }
    }
    bar.onAction(action);
  };

  if (allocating)
    return (
      <>
        <AllocationStep
          diagnosis={diagnosis}
          branchId={job.branchId}
          formId={formId}
          onSubmit={submitAllocation}
          onChosen={setChosen}
          disabled={assign.isPending}
        />
        <StageActionBar
          {...bar}
          back={
            reassigning
              ? {
                  label: "Keep the current technician",
                  onClick: () => setReassigning(false),
                }
              : undefined
          }
          next={{
            label: assignButtonLabel(chosen),
            form: formId,
            pending: assign.isPending,
            pendingLabel: "Assigning",
          }}
        />
      </>
    );

  const editingFinding = editing
    ? (diagnosis.findings.find((finding) => finding.id === editing.id) ?? null)
    : null;
  const technician = diagnosis.technician?.name ?? "the technician";

  return (
    <>
      <div className="grid min-w-0 gap-4">
        {subStep === "ASSIGN_TECHNICIAN" ? (
          <>
            <CustomerRequests requests={diagnosis.requests} />
            <StageCard title="Instructions to the technician">
              <p className="whitespace-pre-wrap break-words text-sm">
                {diagnosis.instructions ??
                  "The service advisor left no instructions."}
              </p>
            </StageCard>
          </>
        ) : (
          <AllocationSummary
            diagnosis={diagnosis}
            onChange={
              diagnosis.canAllocate ? () => setReassigning(true) : undefined
            }
          />
        )}

        {subStep === "FINDINGS" && diagnosis.editable && (
          <FindingsStep diagnosis={diagnosis} registry={registry} />
        )}
        {subStep === "FINDINGS" && !diagnosis.editable && (
          <ReviewTable
            diagnosis={diagnosis}
            title={`Findings so far by ${technician}`}
          />
        )}

        {subStep === "ENGINEER_REVIEW" && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <ReviewTable
              diagnosis={diagnosis}
              title={`Diagnosis by ${technician}`}
              onEdit={
                diagnosis.editable
                  ? (finding, label) => setEditing({ id: finding.id, label })
                  : undefined
              }
            />
            <div className="xl:sticky xl:top-40 xl:self-start">
              <RoutingCard routing={diagnosis.routing} />
            </div>
          </div>
        )}
      </div>

      <StageActionBar
        {...bar}
        pending={flushing ? "SEND_TO_ENGINEER" : bar.pending}
        onAction={(action) => void onAction(action)}
        note={
          subStep === "FINDINGS" ? engineerLine(diagnosis.engineers) : undefined
        }
      />

      <ReturnDialog
        key={returning ? "open" : "closed"}
        open={returning}
        technician={diagnosis.technician?.name ?? null}
        pending={bar.pending === "RETURN_TO_TECHNICIAN"}
        onClose={() => setReturning(false)}
        onConfirm={(note) =>
          bar.onNoteAction("RETURN_TO_TECHNICIAN", note, () =>
            setReturning(false),
          )
        }
      />
      {editing && editingFinding && (
        <EditFindingDialog
          diagnosis={diagnosis}
          finding={editingFinding}
          label={editing.label}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/** "Technician assigned: Musa Abdullahi, Bay A2." with Change for the supervisor until the findings are sent. */
function AllocationSummary({
  diagnosis,
  onChange,
}: {
  diagnosis: JobDiagnosis;
  onChange?: () => void;
}) {
  const who = diagnosis.technician?.name ?? "Not assigned";
  const bay = diagnosis.bay?.description ?? diagnosis.bay?.code ?? "no bay";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <Wrench
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1">
        Technician assigned: <span className="font-semibold">{who}</span>, {bay}
        .
      </p>
      {onChange && (
        <Button type="button" variant="outline" size="sm" onClick={onChange}>
          <UserCog aria-hidden="true" />
          Change technician or bay
        </Button>
      )}
    </div>
  );
}
