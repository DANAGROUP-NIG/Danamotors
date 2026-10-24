"use client";
import Image from "next/image";
import { Printer, PenLine } from "lucide-react";
import { EstimateApprovalCard } from "./EstimateApprovalCard";
import { WORKSPACE_COPY as COPY } from "./repair-workspace-copy";
import {
  formatEstimateMoney,
  formatSignedDate,
  toEstimateViewModel,
} from "./repair-workspace-helpers";
import { EstimateSignatureDialog } from "./EstimateSignatureDialog";
import { useState } from "react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api/apiClient";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { EstimatePartPicker } from "./EstimatePartPicker";
import { PartSourceSelect } from "./PartSourceSelect";
import { DocumentTermsBlock } from "@/components/DocumentTermsBlock";
import { WorkshopPicker } from "./WorkshopPicker";
import { canonicalJobStatus, hasJobBill } from "../types/job-card-status";
import { jobCardKeys } from "../api/job-card.keys";
import type { CustomerApproval, JobCard } from "../types/job-card.types";

type Line = {
  type: "COMPLAINT" | "PART" | "LABOUR" | "SERVICE";
  referenceId?: string;
  description?: string;
  quantity: number;
  includedInService?: boolean;
};
function SignatureEvidence({
  signature,
}: {
  signature: NonNullable<CustomerApproval["signature"]>;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border p-4">
      <Image
        src={signature.imageReference}
        alt={COPY.signature}
        width={600}
        height={200}
        className="h-auto max-w-full"
      />
      <p className="text-sm text-muted-foreground">
        {COPY.signedBy(
          signature.signerName,
          formatSignedDate(signature.signedAt),
        )}
      </p>
    </div>
  );
}

export function JobCardEstimateSection({ jobCard }: { jobCard: JobCard }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const serviceReference = jobCard.serviceId ?? jobCard.serviceTypeId;
  const serviceDescription =
    jobCard.serviceType?.description ?? jobCard.service?.name ?? COPY.service;
  const estimates = jobCard.estimates ?? [];
  const latest = estimates[0];
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<Line[]>(
    serviceReference
      ? [
          {
            type: "SERVICE",
            referenceId: serviceReference,
            description: serviceDescription,
            quantity: 1,
          },
        ]
      : [],
  );
  const [type, setType] = useState<"PART" | "LABOUR">("PART");
  const [referenceId, setReferenceId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [includedInService, setIncluded] = useState(false);
  const [signing, setSigning] = useState(false);
  const [viewingSignature, setViewingSignature] = useState(false);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: jobCardKeys.all });
    await queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };
  const create = useMutation({
    mutationFn: () =>
      apiPost(
        latest
          ? `/service/estimates/${latest.id}/revisions`
          : `/service/job-cards/${jobCard.id}/estimates`,
        {
          description: COPY.editor.description(estimates.length + 1),
          lines,
        },
      ),
    onSuccess: async () => {
      toast.success(COPY.editor.submitted);
      setEditing(false);
      await refresh();
    },
  });
  const open =
    !hasJobBill(jobCard) &&
    !["BILLED", "DELIVERED", "CANCELLED"].includes(
      canonicalJobStatus(jobCard.status),
    );
  // Source variants use separate part records; prevent duplicate records in the draft.
  const partKeys = lines
    .filter((line) => line.type === "PART")
    .map((line) => line.referenceId);
  const duplicatePart = new Set(partKeys).size !== partKeys.length;
  const error = create.error;
  const busy = create.isPending;
  function revise() {
    const draft: Line[] =
      latest?.lines?.map((line) => ({
        type: line.type.replace("INCLUDED_", "") as Line["type"],
        referenceId: line.referenceId ?? undefined,
        description: line.description,
        quantity: line.quantity,
        includedInService: line.type.startsWith("INCLUDED_"),
      })) ?? [];
    if (serviceReference && !draft.some((line) => line.type === "SERVICE"))
      draft.unshift({
        type: "SERVICE",
        referenceId: serviceReference,
        description: serviceDescription,
        quantity: 1,
        includedInService: false,
      });
    setLines(draft);
    setEditing(true);
  }
  const view = latest ? toEstimateViewModel(latest) : undefined;
  const signature = view?.decision?.signature;
  const printAction =
    latest && hasPermission("estimate:print") ? (
      <Button asChild variant="outline" className="print:hidden">
        <a href={`/job-cards/${jobCard.id}/estimates/${latest.id}/print`}>
          <Printer aria-hidden="true" />
          {COPY.print}
        </a>
      </Button>
    ) : null;
  return (
    <div id="estimate-approval" className="min-w-0 space-y-5 print:hidden">
      <EstimateApprovalCard
        estimate={view}
        printAction={printAction}
        actions={
          <>
            {open &&
              !editing &&
              latest &&
              !latest.approvals?.length &&
              hasPermission("estimate:sign") && (
                <Button onClick={() => setSigning(true)}>
                  <PenLine aria-hidden="true" />
                  {COPY.sign}
                </Button>
              )}
            {view?.status === "approved" && signature && (
              <Button
                variant="outline"
                aria-expanded={viewingSignature}
                aria-controls={`signature-${view.id}`}
                onClick={() => setViewingSignature((value) => !value)}
              >
                <PenLine aria-hidden="true" />
                {COPY.viewSignature}
              </Button>
            )}
            {open && !editing && latest && hasPermission("estimate:revise") && (
              <Button variant="outline" onClick={revise}>
                {COPY.revise}
              </Button>
            )}
            {open &&
              !latest &&
              !editing &&
              hasPermission("estimate:create") && (
                <Button onClick={() => setEditing(true)}>{COPY.create}</Button>
              )}
          </>
        }
      >
        {open &&
          editing &&
          hasPermission(latest ? "estimate:revise" : "estimate:create") && (
            <div className="grid gap-3 print:hidden" inert={busy}>
              <p className="text-sm text-muted-foreground">
                {COPY.editor.help}
              </p>
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-center justify-between gap-3 border-b py-2 text-sm"
                >
                  <span>
                    {line.description || line.type}
                    {COPY.separator}
                    {line.quantity}
                    {line.includedInService
                      ? `${COPY.separator}${COPY.included}`
                      : ""}
                    {line.type === "SERVICE"
                      ? `${COPY.separator}${formatEstimateMoney(jobCard.serviceCharge ?? 0, latest?.currency ?? "NGN")}`
                      : ""}
                  </span>
                  {line.type === "PART" && line.referenceId && (
                    <PartSourceSelect
                      partId={line.referenceId}
                      branchId={jobCard.branchId}
                      onChange={(record) =>
                        setLines((current) =>
                          current.map((row, i) =>
                            i === index
                              ? {
                                  ...row,
                                  referenceId: record.id,
                                  description: record.name,
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  )}
                  {line.type !== "SERVICE" && (
                    <button
                      type="button"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      {COPY.editor.remove}
                    </button>
                  )}
                </div>
              ))}
              <Field label={COPY.editor.addWork}>
                <select
                  className={inputCls}
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value as typeof type);
                    setReferenceId("");
                  }}
                >
                  <option value="PART">{COPY.editor.part}</option>
                  <option value="LABOUR">{COPY.editor.operation}</option>
                </select>
              </Field>
              {type === "PART" ? (
                <EstimatePartPicker
                  key={jobCard.branchId}
                  branchId={jobCard.branchId}
                  value={referenceId}
                  onChange={(id, name) => {
                    setReferenceId(id);
                    setDescription(name);
                  }}
                />
              ) : (
                <WorkshopPicker
                  label={COPY.editor.operation}
                  endpoint="/service/labour-items"
                  collection="labourItems"
                  value={referenceId}
                  onChange={setReferenceId}
                  onSelect={(row) =>
                    setDescription(row.name ?? row.description ?? "")
                  }
                />
              )}
              <Field label={COPY.editor.quantity}>
                <input
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  className={inputCls}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includedInService}
                  disabled={!serviceReference}
                  onChange={(event) => setIncluded(event.target.checked)}
                />
                {COPY.editor.included}
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={
                  !referenceId ||
                  !Number.isFinite(quantity) ||
                  quantity <= 0 ||
                  lines.length >= 200 ||
                  lines.some(
                    (line) =>
                      line.type === type && line.referenceId === referenceId,
                  )
                }
                onClick={() => {
                  setLines((current) => [
                    ...current,
                    {
                      type,
                      referenceId,
                      description,
                      quantity,
                      includedInService,
                    },
                  ]);
                  setReferenceId("");
                }}
              >
                {COPY.editor.add}
              </Button>
              {duplicatePart && (
                <p role="alert" className="text-sm text-destructive">
                  The same part record is listed twice. Change a source or
                  remove the extra line.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={!lines.length || busy || duplicatePart}
                  onClick={() => create.mutate()}
                >
                  {COPY.editor.submit}
                </Button>
                {latest && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(false)}
                  >
                    {COPY.editor.discard}
                  </Button>
                )}
              </div>
            </div>
          )}

        {viewingSignature && signature && (
          <div id={`signature-${view!.id}`}>
            <SignatureEvidence signature={signature} />
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 text-sm text-destructive"
          >
            <p>
              {isAxiosError(error)
                ? error.response?.data?.message || COPY.saveError
                : COPY.saveError}
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => create.mutate()}
            >
              {COPY.retry}
            </Button>
          </div>
        )}
        <DocumentTermsBlock
          documentType="JOB_ESTIMATE"
          branchId={jobCard.branchId}
        />
      </EstimateApprovalCard>
      {estimates.length > 1 && (
        <details className="min-w-0 ">
          <summary className="cursor-pointer rounded-lg py-3 text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {COPY.history}
          </summary>
          <div className="space-y-4">
            {estimates.slice(1).map((estimate) => (
              <EstimateApprovalCard
                key={estimate.id}
                estimate={toEstimateViewModel(estimate)}
                latest={false}
                printAction={
                  hasPermission("estimate:print") ? (
                    <Button asChild variant="outline">
                      <a
                        href={`/job-cards/${jobCard.id}/estimates/${estimate.id}/print`}
                      >
                        <Printer aria-hidden="true" />
                        {COPY.print}
                      </a>
                    </Button>
                  ) : null
                }
              >
                {estimate.approvals?.map(
                  (approval) =>
                    approval.signature && (
                      <details key={approval.id}>
                        <summary className="cursor-pointer rounded-lg py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {COPY.viewSignature}
                        </summary>
                        <SignatureEvidence signature={approval.signature} />
                      </details>
                    ),
                )}
              </EstimateApprovalCard>
            ))}
          </div>
        </details>
      )}
      {signing && latest && (
        <EstimateSignatureDialog
          estimate={latest}
          customerId={jobCard.customerId}
          customerName={`${jobCard.customer.firstName} ${jobCard.customer.lastName}`}
          onSaved={refresh}
          onClose={() => setSigning(false)}
        />
      )}
    </div>
  );
}
