import type { Prisma, ServiceJobWorkflowPart } from "@prisma/client";
import { ConflictError, ForbiddenError } from "../../shared/errors/appError";
import { createHash } from "node:crypto";
import { requireServiceJobAction } from "./service-job-policy";

type IssuanceWorkflow = {
  jobCardId: string;
  stage: string;
  version: number;
  parts: ServiceJobWorkflowPart[];
};

export function serviceJobIssuanceFingerprint(actorId: string, input: object) {
  return createHash("sha256").update(JSON.stringify([actorId, input])).digest("hex");
}

export function assertServiceJobIssuanceReplay(storedHash: string | null, fingerprint: string) {
  if (storedHash !== fingerprint) {
    throw new ConflictError("This issuance request ID was already used for a different request").withCode("ISSUANCE_REQUEST_ID_CONFLICT");
  }
}

export function isServiceJobReplacementStage(stage: string) {
  return ["PARTS_ISSUED", "IN_PROGRESS", "REWORK"].includes(stage);
}

export async function authorizeServiceJobIssuance(
  tx: Prisma.TransactionClient,
  workflow: IssuanceWorkflow,
  technicianId: string | null,
  actorId: string,
) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, include: { role: true } });
  if (!actor?.isActive) throw new ForbiddenError("An active staff account is required to issue parts");
  const replacement = isServiceJobReplacementStage(workflow.stage);
  const stage = requireServiceJobAction("issueParts", {
    stage: replacement ? "PARTS_REQUESTED" : workflow.stage,
    technicianId,
    actorId,
    role: actor.role.name,
    warrantyBypassEnabled: false,
  });
  if (replacement && await hasServiceJobIssuedParts(tx, workflow)) {
    throw new ConflictError("The approved parts quantities have already been issued").withCode("WORKFLOW_PARTS_FULFILLED");
  }
  return replacement ? workflow.stage : stage;
}

export async function hasServiceJobIssuedParts(
  tx: Prisma.TransactionClient,
  workflow: IssuanceWorkflow,
) {
  if (!workflow.parts.length) return true;
  const issuances = await tx.partIssuance.findMany({
    where: {
      jobCardId: workflow.jobCardId,
      OR: [{ requisitionLine: null }, { requisitionLine: { requisition: { status: "ISSUED" } } }],
    },
    select: {
      sparePartId: true,
      quantity: true,
      returns: { select: { status: true, quantity: true } },
      requisitionLine: { select: { requestedSparePartId: true } },
    },
  });
  const issued = new Map<string, number>();
  for (const issuance of issuances) {
    const partId = issuance.requisitionLine?.requestedSparePartId ?? issuance.sparePartId;
    const returned = issuance.returns
      .filter(row => !["REJECTED", "CANCELLED"].includes(row.status.toUpperCase()))
      .reduce((sum, row) => sum + row.quantity, 0);
    issued.set(partId, (issued.get(partId) ?? 0) + issuance.quantity - returned);
  }
  return workflow.parts.every(part => (issued.get(part.sparePartId) ?? 0) >= part.quantity);
}

export async function completeServiceJobIssuance(
  tx: Prisma.TransactionClient,
  jobCardId: string,
  workflow: IssuanceWorkflow,
  nextStage: string,
  actorId: string,
) {
  if (nextStage === workflow.stage || !(await hasServiceJobIssuedParts(tx, workflow))) return;
  await tx.serviceJobWorkflow.update({
    where: { jobCardId, version: workflow.version },
    data: { stage: nextStage, version: { increment: 1 } },
  });
  await tx.jobCardStatusHistory.create({
    data: { jobCardId, fromStatus: workflow.stage, toStatus: nextStage, actorId, remarks: "Approved parts scope issued" },
  });
}
