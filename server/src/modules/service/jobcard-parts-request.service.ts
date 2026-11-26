import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { ROLES } from "../../shared/constants/roles";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/appError";
import { enqueueWorkshopNotification } from "../notification/workshop-notification-outbox";
import { canonicalNotificationStatus } from "../notification/jobcard-notification-policy";
import { requireServiceJobAction } from "./service-job-policy";
import { assertApprovedOperation } from "./estimate-approval";

/** Notification only: no requisition, part issuance or lifecycle mutation. */
export async function requestJobcardParts(
  jobCardId: string,
  branchId: string,
  actorId: string,
  requestId: string,
  workflowVersion?: number,
) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobCardId} AND "branchId" = ${branchId} FOR UPDATE`,
    );
    const card = await tx.jobCard.findFirst({
      where: { id: jobCardId, branchId },
      include: {
        customer: true,
        vehicle: true,
        serviceWorkflow: { include: { parts: true } },
      },
    });
    if (!card) throw new NotFoundError("Job card not found");
    if (
      card.billedAt ||
      ["BILLED", "DELIVERED", "CANCELLED"].includes(
        canonicalNotificationStatus(card.status),
      )
    ) {
      throw new BadRequestError(
        "Parts cannot be requested for a billed or closed job card",
      );
    }
    const workflow = card.serviceWorkflow;
    if (workflow) {
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        include: { role: true },
      });
      if (!actor?.isActive || actor.role.name !== ROLES.WORKSHOP_MANAGER)
        throw new ForbiddenError("Only the Workshop Manager can request parts");
      const requested =
        workflow.stage === "PARTS_REQUESTED" && card.partsRequestedAt;
      const noParts =
        workflow.stage === "PARTS_ISSUED" && workflow.noPartsRequired;
      if ((requested || noParts) && workflowVersion === workflow.version - 1)
        return;
      if (workflowVersion !== workflow.version)
        throw new ConflictError(
          "Refresh the job card before requesting parts",
        ).withCode("WORKFLOW_VERSION_CONFLICT");
      const stage = requireServiceJobAction("requestParts", {
        stage: workflow.stage,
        technicianId: card.technicianId,
        actorId,
        role: actor.role.name,
        warrantyBypassEnabled: false,
      });
      await assertApprovedOperation(tx, jobCardId, card.customerId, []);
      const nextStage = workflow.noPartsRequired ? "PARTS_ISSUED" : stage;
      await tx.serviceJobWorkflow.update({
        where: { jobCardId, version: workflow.version },
        data: { stage: nextStage, version: { increment: 1 } },
      });
      await tx.jobCardStatusHistory.create({
        data: {
          jobCardId,
          fromStatus: workflow.stage,
          toStatus: nextStage,
          actorId,
          remarks: workflow.noPartsRequired
            ? "No parts required"
            : "Parts requested",
        },
      });
      if (workflow.noPartsRequired) return;
      const detail = workflow.parts
        .map(
          (part) =>
            `${part.partNumber} ${part.name}, quantity ${part.quantity}`,
        )
        .join("; ");
      await enqueueWorkshopNotification(
        tx,
        "PART_REQUESTED",
        card,
        `workflow:${workflow.version + 1}`,
        actorId,
        true,
        detail,
      );
      await tx.jobCard.update({
        where: { id: jobCardId },
        data: { partsRequestedAt: new Date() },
      });
      return;
    }
    // This button targets this branch only; the separate requisition notification
    // retains its existing GeneralStoreManager recipients.
    const recipients = await tx.user.findMany({
      where: {
        branchId: card.branchId,
        isActive: true,
        role: { name: ROLES.BRANCH_STORE_MANAGER },
        id: { not: actorId },
      },
      select: { id: true },
    });
    if (!recipients.length)
      throw new BadRequestError(
        "No other active Store Manager is available in this branch",
      );
    await enqueueWorkshopNotification(
      tx,
      "PART_REQUESTED",
      card,
      `button:${requestId}`,
      actorId,
      true,
    );
    await tx.jobCard.update({
      where: { id: card.id },
      data: { partsRequestedAt: card.partsRequestedAt ?? new Date() },
    });
  });
}
