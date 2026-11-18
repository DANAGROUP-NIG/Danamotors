import { jobWorkUpdate } from "./requisition-work";
import { assertPartsRequested } from "../service/jobcard-parts-request.logic";
import { notifyWorkshopEvent } from "../notification/workshop-notifications";
import { enqueueWorkshopNotification } from "../notification/workshop-notification-outbox";
import { ChargeType, PartStatus, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/appError";
import { nextSequenceNumber } from "../../shared/db/documentSequence";
import { assertChargeChange } from "../job-card-line/jobCardLine.logic";
import { assertApprovedOperation } from "../service/estimate-approval";
import { lineAmount } from "../finance/money";
import {
  assertRequisitionBranch,
  assertRequisitionJob,
  RequisitionActor,
  requisitionAmounts,
  requisitionFooter,
} from "./requisition.logic";
import {
  RequisitionInput,
  RequisitionQuery,
  requisitionBody,
} from "./requisition.validation";
import {
  assertPartSubstitution,
  requisitionPartRate,
} from "./part-substitution";

const include = {
  lines: {
    include: {
      sparePart: { select: { partNumber: true } },
      requestedSparePart: { select: { partNumber: true } },
      returns: { select: { quantity: true, status: true } },
      jobCardLines: true,
    },
  },
  jobCard: {
    select: {
      jobNumber: true,
      createdAt: true,
      mileage: true,
      vehicle: {
        select: {
          registrationNumber: true,
          vin: true,
          model: true,
          trim: true,
        },
      },
    },
  },
  branch: { select: { id: true, name: true } },
  engineer: { select: { id: true, firstName: true, lastName: true } },
  group: { select: { id: true, code: true, description: true } },
} satisfies Prisma.PartRequisitionInclude;

export class RequisitionService {
  /** List requisitions within the actor's branch and requested page. */
  async list(query: RequisitionQuery, actor: RequisitionActor) {
    assertRequisitionBranch(actor, query.branchId);
    if (query.jobCardId) {
      const job = await prisma.jobCard.findUnique({
        where: { id: query.jobCardId },
        select: { branchId: true },
      });
      if (!job) throw new NotFoundError("Job card not found");
      assertRequisitionBranch(actor, job.branchId);
    }
    return prisma.partRequisition.findMany({
      where: {
        branchId: actor.allBranches ? query.branchId : actor.branchId!,
        jobCardId: query.jobCardId,
        chargeType: query.chargeType,
      },
      include: {
        branch: { select: { name: true } },
        jobCard: { select: { jobNumber: true } },
      },
      orderBy: [{ requisitionDate: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
  }

  /** Read saved document snapshots after checking branch ownership. */
  async get(
    id: string,
    actor: RequisitionActor,
    db: Prisma.TransactionClient | typeof prisma = prisma,
  ) {
    const document = await db.partRequisition.findUnique({
      where: { id },
      include,
    });
    if (!document) throw new NotFoundError("Requisition not found");
    assertRequisitionBranch(actor, document.branchId);
    return {
      ...document,
      lines: document.lines.map((line) => ({
        ...line,
        partNumber: line.sparePart.partNumber,
        requestedPartNumber: line.requestedSparePart?.partNumber ?? null,
      })),
      totals: requisitionFooter(document.lines),
    };
  }

  /** Atomically issue stock, snapshot charges and audit one requisition. */
  async create(input: RequisitionInput, actor: RequisitionActor) {
    assertRequisitionBranch(actor, input.branchId);
    const validated = requisitionBody.safeParse(input);
    if (!validated.success)
      throw new BadRequestError(
        validated.error.issues.map((issue) => issue.message).join("; "),
      );
    input = validated.data;
    if (input.chargeType === ChargeType.GOODWILL) {
      if (!actor.goodwill)
        throw new ForbiddenError("Goodwill requires requisition:goodwill");
      if (!input.goodwillReason?.trim())
        throw new BadRequestError("Goodwill requires a reason");
    }
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${input.jobCardId} FOR UPDATE`;
        const job = await tx.jobCard.findUnique({
          where: { id: input.jobCardId },
          include: {
            invoices: { select: { status: true } },
            warrantyCase: { select: { id: true } },
            campaigns: { select: { campaignId: true } },
          },
        });
        if (!job) throw new NotFoundError("Job card not found");
        assertRequisitionBranch(actor, job.branchId);
        if (job.branchId !== input.branchId)
          throw new BadRequestError(
            "Job card must belong to the requisition branch",
          );
        assertRequisitionJob(job);
        if (input.lines.some((line) => line.quantityIssued > 0))
          assertPartsRequested(job);
        if (
          input.groupId &&
          !(await tx.workshopMaster.findFirst({
            where: { id: input.groupId, kind: "TEAM", active: true },
          }))
        )
          throw new BadRequestError("Choose an active workshop group");
        if (
          input.engineerId &&
          !(await tx.user.findFirst({
            where: {
              id: input.engineerId,
              branchId: input.branchId,
              isActive: true,
            },
          }))
        )
          throw new BadRequestError("Engineer must be active in this branch");
        const ids = [
          ...new Set(
            input.lines.flatMap((line) => [
              line.sparePartId,
              ...(line.requestedSparePartId ? [line.requestedSparePartId] : []),
            ]),
          ),
        ];
        const parts = await tx.sparePart.findMany({
          where: { id: { in: ids } },
        });
        const partsById = new Map(parts.map((part) => [part.id, part]));
        const resolved = input.lines.map((line) => {
          const part = partsById.get(line.sparePartId);
          if (!part || part.partStatus !== PartStatus.ACTIVE)
            throw new BadRequestError("Choose an active part source record");
          const requested = line.requestedSparePartId
            ? partsById.get(line.requestedSparePartId)
            : undefined;
          if (line.requestedSparePartId && !requested)
            throw new BadRequestError("Requested part not found");
          assertPartSubstitution(part, requested, line.substitutionReason);
          const { campaignId } = assertChargeChange({
            to: input.chargeType,
            campaignId: input.campaignId,
            kind: "PART",
            coverageAtCreation: job.warrantyStatusAtCreation,
            hasWarrantyCase: !!job.warrantyCase,
            partWarrantyApplicable: part.warrantyApplicable,
            linkedCampaignIds: job.campaigns.map((row) => row.campaignId),
            canChargeGoodwill: actor.goodwill,
          });
          const rate = requisitionPartRate(part, input.chargeType);
          return {
            line,
            part,
            rate,
            campaignId,
            amounts: requisitionAmounts(
              input.chargeType,
              line.quantityIssued,
              rate,
              line.approvalPercent,
              line.customerPercent,
            ),
          };
        });
        // Lock stock records in a stable order; reserved transfer stock is unavailable.
        for (const item of [...resolved].sort((a, b) =>
          a.part.id.localeCompare(b.part.id),
        )) {
          await tx.$queryRaw`SELECT id FROM "InventoryStock" WHERE "branchId" = ${input.branchId} AND "partId" = ${item.part.id} FOR UPDATE`;
        }
        const stocks = await tx.inventoryStock.findMany({
          where: {
            branchId: input.branchId,
            partId: { in: resolved.map((item) => item.part.id) },
          },
          select: {
            partId: true,
            quantity: true,
            reservedQuantity: true,
            rackLocation: true,
            binCard: true,
          },
        });
        const stockByPartId = new Map(
          stocks.map((stock) => [stock.partId, stock]),
        );
        for (const item of resolved) {
          const stock = stockByPartId.get(item.part.id);
          if (
            item.line.quantityIssued >
            (stock ? stock.quantity - stock.reservedQuantity : 0)
          )
            throw new BadRequestError(
              "Insufficient available stock at this branch",
            );
        }
        const issued = resolved.filter((item) => item.line.quantityIssued > 0);
        if (issued.length) {
          const previous = await tx.partIssuance.findMany({
            where: {
              jobCardId: job.id,
              OR: [
                { requisitionLine: null },
                { requisitionLine: { requisition: { status: "ISSUED" } } },
              ],
            },
            include: { sparePart: true, returns: true, requisitionLine: true },
          });
          await assertApprovedOperation(tx, job.id, job.customerId, [
            ...previous
              .map((row) => {
                const quantity =
                  row.quantity -
                  row.returns
                    .filter(
                      (ret) =>
                        !["REJECTED", "CANCELLED"].includes(
                          ret.status.toUpperCase(),
                        ),
                    )
                    .reduce((sum, ret) => sum + ret.quantity, 0);
                const rate =
                  row.requisitionLine?.rate.toNumber() ??
                  row.sparePart.retailRate ??
                  row.sparePart.unitPrice;
                return {
                  type: "PART",
                  referenceId: row.sparePartId,
                  partSource: row.partSource,
                  description: row.sparePart.name,
                  quantity,
                  rate,
                  amount: quantity > 0 ? lineAmount(quantity, rate) : 0,
                };
              })
              .filter((line) => line.quantity > 0),
            ...issued.map((item) => ({
              type: "PART",
              referenceId: item.part.id,
              partSource: item.part.partFlag,
              description: item.part.name,
              quantity: item.line.quantityIssued,
              rate: item.rate,
              amount: item.amounts.amount,
            })),
          ]);
        }
        const now = new Date();
        const requisitionNumber = await nextSequenceNumber(
          tx,
          `REQUISITION_${input.branchId}`,
          now,
        );
        const document = await tx.partRequisition.create({
          data: {
            branchId: input.branchId,
            jobCardId: job.id,
            chargeType: input.chargeType,
            groupId: input.groupId,
            engineerId: input.engineerId,
            goodwillReason: input.goodwillReason,
            createdById: actor.userId,
            requisitionNumber,
            requisitionDate: now,
          },
        });
        for (const { line, part, rate, amounts, campaignId } of resolved) {
          const stock = stockByPartId.get(part.id);
          const issuance =
            line.quantityIssued === 0
              ? null
              : await tx.partIssuance.create({
                  data: {
                    branchId: input.branchId,
                    jobCardId: job.id,
                    sparePartId: part.id,
                    issuedById: actor.userId,
                    quantity: line.quantityIssued,
                    partSource: part.partFlag,
                  },
                });
          const { charges, ...snapshots } = amounts;
          const row = await tx.partRequisitionLine.create({
            data: {
              requisitionId: document.id,
              sparePartId: part.id,
              requestedSparePartId: line.requestedSparePartId,
              substitutionReason: line.substitutionReason,
              partIssuanceId: issuance?.id,
              partSource: part.partFlag,
              description: part.name,
              uom: part.uom,
              location: stock?.rackLocation,
              binCard: stock?.binCard,
              quantityRequired: line.quantityRequired,
              quantityIssued: line.quantityIssued,
              rate,
              warrantyRate: part.warrantyRate,
              ...snapshots,
            },
          });
          if (issuance) {
            await tx.inventoryStock.update({
              where: {
                branchId_partId: { branchId: input.branchId, partId: part.id },
              },
              data: { quantity: { decrement: line.quantityIssued } },
            });
            await tx.stockTransaction.create({
              data: {
                branchId: input.branchId,
                partId: part.id,
                type: "ISSUED",
                quantity: -line.quantityIssued,
                referenceId: issuance.id,
                recordedById: actor.userId,
                notes: `Requisition ${requisitionNumber}`,
              },
            });
            for (const [index, charge] of charges.entries()) {
              await tx.jobCardLine.create({
                data: {
                  jobCardId: job.id,
                  kind: "PART",
                  sparePartId: part.id,
                  partIssuanceId: index === 0 ? issuance.id : null,
                  requisitionLineId: row.id,
                  partSource: part.partFlag,
                  description: part.name,
                  taxable: part.taxable,
                  campaignId:
                    charge.chargeType === ChargeType.FREE ? campaignId : null,
                  createdById: actor.userId,
                  chargeTypeReason: input.goodwillReason,
                  ...charge,
                },
              });
            }
          }
        }
        if (issued.length)
          await tx.jobCard.update({
            where: { id: job.id },
            data: await jobWorkUpdate(tx, job, actor.userId),
          });
        await tx.auditLog.create({
          data: {
            userId: actor.userId,
            action: "REQUISITION_CREATED",
            details: JSON.stringify({
              requisitionId: document.id,
              requisitionNumber,
              branchId: input.branchId,
              jobCardId: job.id,
              chargeType: input.chargeType,
              goodwillReason: input.goodwillReason,
              substitutions: input.lines
                .filter(
                  (line) =>
                    line.requestedSparePartId &&
                    line.requestedSparePartId !== line.sparePartId,
                )
                .map((line) => ({
                  requestedSparePartId: line.requestedSparePartId,
                  actualSparePartId: line.sparePartId,
                  reason: line.substitutionReason,
                })),
            }),
          },
        });
        await enqueueWorkshopNotification(
          tx,
          "PART_REQUESTED",
          job,
          document.id,
          actor.userId,
        );
        if (input.lines.some((line) => line.quantityIssued > 0))
          await enqueueWorkshopNotification(
            tx,
            "PARTS_ISSUED",
            job,
            document.id,
            actor.userId,
          );
        if (
          input.lines.some(
            (line) => line.quantityIssued < line.quantityRequired,
          )
        )
          await enqueueWorkshopNotification(
            tx,
            "PARTS_UNAVAILABLE",
            job,
            document.id,
            actor.userId,
          );
        return this.get(document.id, actor, tx);
      },
      { maxWait: 5000, timeout: 20000 },
    );
    await notifyWorkshopEvent("PART_REQUESTED", input.jobCardId, result.id);
    return result;
  }

  /** Reverse an unbilled issue once, preserving its document and audit history. */
  async cancel(id: string, reason: string, actor: RequisitionActor) {
    if (!reason.trim())
      throw new BadRequestError("Cancellation requires a reason");
    return prisma.$transaction(
      async (tx) => {
        const initial = await tx.partRequisition.findUnique({ where: { id } });
        if (!initial) throw new NotFoundError("Requisition not found");
        assertRequisitionBranch(actor, initial.branchId);
        await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${initial.jobCardId} FOR UPDATE`;
        const job = await tx.jobCard.findUniqueOrThrow({
          where: { id: initial.jobCardId },
          include: { invoices: { select: { status: true } } },
        });
        assertRequisitionJob(job);
        const document = await tx.partRequisition.findUniqueOrThrow({
          where: { id },
          include: {
            lines: {
              include: {
                partIssuance: { include: { returns: true } },
                jobCardLines: {
                  include: { warrantyCaseLines: true, invoiceLines: true },
                },
              },
            },
          },
        });
        if (document.status === "CANCELLED")
          throw new ConflictError("Requisition is already cancelled");
        // TODO(confirm): require returns to be cancelled first; this preserves their audit/stock history.
        if (
          document.lines.some((line) =>
            line.partIssuance?.returns.some(
              (row) =>
                !["REJECTED", "CANCELLED"].includes(row.status.toUpperCase()),
            ),
          )
        )
          throw new ConflictError(
            "Cancel the requisition returns before cancelling the requisition",
          );
        if (
          document.lines.some((line) =>
            line.jobCardLines.some(
              (charge) =>
                charge.warrantyCaseLines.length || charge.invoiceLines.length,
            ),
          )
        )
          throw new ConflictError(
            "Remove the requisition charges from claims or bills before cancelling",
          );
        for (const line of [...document.lines].sort((a, b) =>
          a.sparePartId.localeCompare(b.sparePartId),
        )) {
          if (line.quantityIssued === 0) continue;
          await tx.inventoryStock.upsert({
            where: {
              branchId_partId: {
                branchId: document.branchId,
                partId: line.sparePartId,
              },
            },
            create: {
              branchId: document.branchId,
              partId: line.sparePartId,
              quantity: line.quantityIssued,
            },
            update: { quantity: { increment: line.quantityIssued } },
          });
          await tx.stockTransaction.create({
            data: {
              branchId: document.branchId,
              partId: line.sparePartId,
              type: "RETURNED",
              quantity: line.quantityIssued,
              referenceId: line.partIssuanceId,
              recordedById: actor.userId,
              notes: `Cancel requisition ${document.requisitionNumber}: ${reason.trim()}`,
            },
          });
        }
        await tx.jobCardLine.deleteMany({
          where: { requisitionLine: { requisitionId: id } },
        });
        await tx.partRequisition.update({
          where: { id },
          data: {
            status: "CANCELLED",
            cancelReason: reason.trim(),
            cancelledById: actor.userId,
            cancelledAt: new Date(),
          },
        });
        if (document.lines.some((line) => line.quantityIssued > 0))
          await tx.jobCard.update({
            where: { id: job.id },
            data: await jobWorkUpdate(tx, job, actor.userId),
          });
        await tx.auditLog.create({
          data: {
            userId: actor.userId,
            action: "REQUISITION_CANCELLED",
            details: JSON.stringify({
              requisitionId: id,
              branchId: document.branchId,
              jobCardId: job.id,
              oldStatus: document.status,
              reason: reason.trim(),
              lines: document.lines.map((line) => ({
                id: line.id,
                quantity: line.quantityIssued,
                amount: line.amount.toString(),
              })),
            }),
          },
        });
        return this.get(id, actor, tx);
      },
      { maxWait: 5000, timeout: 20000 },
    );
  }
}
