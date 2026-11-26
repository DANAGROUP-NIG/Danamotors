import type { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../../prisma/client";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/appError";
import {
  requireServiceJobAction,
  SERVICE_JOB_ACTIONS,
  serviceJobActionAvailability,
  type ServiceJobAction,
} from "./service-job-policy";
import { enqueueWorkshopNotification } from "../notification/workshop-notification-outbox";

const partSchema = z
  .object({
    sparePartId: z.string().uuid(),
    quantity: z.number().int().positive().max(9999),
  })
  .strict();

export const serviceJobInspectionAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("submitInspection"),
      version: z.number().int().nonnegative(),
      remarks: z.string().trim().min(1).max(5000),
      noPartsRequired: z.boolean(),
      parts: z.array(partSchema).max(250),
    })
    .strict(),
  z
    .object({
      action: z.literal("bypassWarranty"),
      version: z.number().int().nonnegative(),
    })
    .strict(),
]);

type InspectionAction = z.infer<typeof serviceJobInspectionAction>;

export async function readServiceJobInspection(
  id: string,
  branchId: string,
  actor: { userId: string; role: string },
) {
  const card = await prisma.jobCard.findFirst({
    where: { id, branchId },
    select: {
      technicianId: true,
      serviceWorkflow: { include: { parts: true } },
      statusHistory: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
    },
  });
  if (!card) throw new NotFoundError("Job card not found");
  const workflow = card.serviceWorkflow;
  if (!workflow) return null;
  const context = {
    stage: workflow.stage,
    technicianId: card.technicianId,
    actorId: actor.userId,
    role: actor.role,
    warrantyBypassEnabled:
      process.env.SERVICE_JOB_WARRANTY_BYPASS_ENABLED === "true",
  };
  return {
    ...workflow,
    history: card.statusHistory,
    actions: Object.fromEntries(
      (Object.keys(SERVICE_JOB_ACTIONS) as ServiceJobAction[])
        .filter((action) => action !== "completeWarranty")
        .map((action) => [
          action,
          serviceJobActionAvailability(action, context),
        ]),
    ),
  };
}

async function inspectionParts(
  tx: Prisma.TransactionClient,
  input: Extract<InspectionAction, { action: "submitInspection" }>,
) {
  if (input.noPartsRequired !== (input.parts.length === 0)) {
    throw new BadRequestError(
      "Select the required parts or confirm that no parts are required",
    ).withCode("INSPECTION_PARTS_REQUIRED");
  }
  const quantities = new Map(
    input.parts.map((part) => [part.sparePartId, part.quantity]),
  );
  if (quantities.size !== input.parts.length) {
    throw new BadRequestError("Include each catalogue part only once").withCode(
      "DUPLICATE_INSPECTION_PART",
    );
  }
  const parts = await tx.sparePart.findMany({
    where: { id: { in: [...quantities.keys()] } },
    select: { id: true, name: true, partNumber: true },
  });
  if (parts.length !== quantities.size)
    throw new BadRequestError("Select existing catalogue parts").withCode(
      "INSPECTION_PART_NOT_FOUND",
    );
  return parts.map((part) => ({
    sparePartId: part.id,
    name: part.name,
    partNumber: part.partNumber,
    quantity: quantities.get(part.id)!,
  }));
}

export async function updateServiceJobInspection(
  id: string,
  branchId: string,
  actor: { userId: string; role: string },
  input: InspectionAction,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`;
    const card = await tx.jobCard.findFirst({
      where: { id, branchId },
      include: { serviceWorkflow: { include: { parts: true } } },
    });
    if (!card) throw new NotFoundError("Job card not found");
    const workflow = card.serviceWorkflow;
    if (!workflow)
      throw new ConflictError(
        "This job card uses the existing service process",
      ).withCode("SERVICE_WORKFLOW_UNAVAILABLE");
    const context = {
      stage: workflow.stage,
      technicianId: card.technicianId,
      actorId: actor.userId,
      role: actor.role,
      warrantyBypassEnabled:
        process.env.SERVICE_JOB_WARRANTY_BYPASS_ENABLED === "true",
    };
    if (workflow.version !== input.version) {
      const matchesInspection =
        input.action === "submitInspection" &&
        workflow.stage === "AWAITING_WARRANTY" &&
        workflow.inspectionSubmittedById === actor.userId &&
        workflow.inspectionRemarks === input.remarks &&
        workflow.noPartsRequired === input.noPartsRequired &&
        workflow.parts.length === input.parts.length &&
        workflow.parts.every((part) =>
          input.parts.some(
            (item) =>
              item.sparePartId === part.sparePartId &&
              item.quantity === part.quantity,
          ),
        );
      const matchesBypass =
        input.action === "bypassWarranty" &&
        workflow.stage === "WARRANTY_RESOLVED" &&
        workflow.warrantySource === "bypass" &&
        workflow.warrantyResolvedById === actor.userId;
      if (
        workflow.version === input.version + 1 &&
        (matchesInspection || matchesBypass)
      ) {
        requireServiceJobAction(input.action, {
          ...context,
          stage: matchesInspection
            ? "TECHNICIAN_ASSIGNED"
            : "AWAITING_WARRANTY",
        });
        return workflow;
      }
      throw new ConflictError(
        "Refresh the job card before trying again",
      ).withCode("WORKFLOW_VERSION_CONFLICT");
    }
    const stage = requireServiceJobAction(input.action, context);
    const now = new Date();
    const fields: Prisma.ServiceJobWorkflowUpdateInput =
      input.action === "submitInspection"
        ? {
            inspectionRemarks: input.remarks,
            inspectionSubmittedById: actor.userId,
            inspectionSubmittedAt: now,
            noPartsRequired: input.noPartsRequired,
            parts: { create: await inspectionParts(tx, input) },
          }
        : {
            warrantyResolvedById: actor.userId,
            warrantyResolvedAt: now,
            warrantySource: "bypass",
          };
    if (input.action === "bypassWarranty") {
      await tx.serviceJobWorkflowPart.updateMany({
        where: { jobCardId: id },
        data: { isUnderWarranty: false },
      });
    }
    const updated = await tx.serviceJobWorkflow.update({
      where: { jobCardId: id, version: input.version },
      data: { ...fields, stage, version: { increment: 1 } },
      include: { parts: true },
    });
    await tx.jobCardStatusHistory.create({
      data: {
        jobCardId: id,
        fromStatus: workflow.stage,
        toStatus: stage,
        actorId: actor.userId,
        remarks:
          input.action === "submitInspection"
            ? input.remarks
            : "Proceeded without warranty response",
      },
    });
    const submitted = input.action === "submitInspection";
    const detail = submitted
      ? updated.parts
          .map(
            (part) =>
              `${part.partNumber} ${part.name}, quantity ${part.quantity}`,
          )
          .join("; ") || "No parts required"
      : undefined;
    await enqueueWorkshopNotification(
      tx,
      submitted ? "INSPECTION_SUBMITTED" : "WARRANTY_RESOLVED",
      card,
      String(updated.version),
      actor.userId,
      false,
      detail,
    );
    return updated;
  });
}
