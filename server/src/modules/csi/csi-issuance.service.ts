import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../../prisma/client";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/appError";
import { dateBounds } from "../reports/report.logic";
import { lagosDay } from "../finance/credit-terms";
import { cardRevisionInclude } from "./csi.service";
import { csiJobApplicability, selectCsiRevision } from "./csi-issuance.logic";
import { issuanceQuery } from "./csi-issuance.validation";

type Scope = { branchId: string; actorId: string };
const jobInclude = {
  branch: { select: { name: true } },
  customer: {
    select: {
      companyName: true,
      firstName: true,
      lastName: true,
      address: true,
      phoneNumber: true,
      mobile2: true,
      residencePhone: true,
      office1: true,
    },
  },
  vehicle: { include: { catalogue: { include: { parent: true } } } },
  serviceType: { select: { code: true, description: true, category: true } },
  csiSurvey: {
    select: {
      id: true,
      revision: { select: { code: true, description: true, version: true } },
    },
  },
} satisfies Prisma.JobCardInclude;
type Job = Prisma.JobCardGetPayload<{ include: typeof jobInclude }>;

function snapshot(job: Job) {
  return {
    branch: job.branch.name,
    jobNumber: job.jobNumber,
    jobDate: lagosDay(job.createdAt),
    customerId: job.customerId,
    serviceTypeId: job.serviceTypeId,
    modelId:
      job.vehicle?.catalogue?.parentId ?? job.vehicle?.catalogueId ?? null,
    variantId:
      job.vehicle?.catalogue?.kind === "VARIANT"
        ? job.vehicle.catalogueId
        : null,
    deliveredDate: job.deliveredAt ? lagosDay(job.deliveredAt) : null,
    customer:
      job.customer?.companyName ||
      [job.customer?.firstName, job.customer?.lastName]
        .filter(Boolean)
        .join(" "),
    address: job.customer?.address ?? null,
    mobile: job.customer?.phoneNumber ?? job.customer?.mobile2 ?? null,
    residencePhone: job.customer?.residencePhone ?? null,
    officePhone: job.customer?.office1 ?? null,
    registration: job.vehicle?.registrationNumber ?? null,
    vin: job.vehicle?.vin ?? null,
    model:
      job.vehicle?.catalogue?.parent?.description ??
      job.vehicle?.model ??
      job.vehicle?.customModel ??
      null,
    variant: job.vehicle?.catalogue?.description ?? job.vehicle?.trim ?? null,
    saleDate: job.vehicle?.saleDate ? lagosDay(job.vehicle.saleDate) : null,
    mileage: job.mileage,
    service: job.serviceType?.description ?? null,
  } satisfies Prisma.InputJsonObject;
}

async function revisions(db: Prisma.TransactionClient, branchId: string) {
  const rows = await db.csiCardRevision.findMany({
    where: { branchId, card: { active: true } },
    include: cardRevisionInclude,
    orderBy: [{ effectiveDate: "desc" }, { id: "asc" }],
    take: 5001,
  });
  if (rows.length > 5000)
    throw new BadRequestError(
      "Too many active CSI card revisions. Deactivate obsolete cards before generating.",
    );
  return rows;
}

export class CsiIssuanceService {
  async options(branchId: string) {
    const rows = await prisma.workshopMaster.findMany({
      where: {
        active: true,
        kind: { in: ["SERVICE_TYPE", "MODEL", "VARIANT"] },
      },
      select: { id: true, kind: true, description: true, parentId: true },
      orderBy: [{ description: "asc" }, { id: "asc" }],
      take: 2001,
    });
    if (rows.length > 2000)
      throw new BadRequestError(
        "Too many workshop filter options. Contact the workshop administrator to review active masters.",
      );
    // The requested branch is already authorized by the route. Master catalogue is shared.
    return {
      branchId,
      serviceTypes: rows.filter((row) => row.kind === "SERVICE_TYPE"),
      models: rows.filter((row) => row.kind === "MODEL"),
      variants: rows.filter((row) => row.kind === "VARIANT"),
    };
  }

  async candidates(branchId: string, input: z.infer<typeof issuanceQuery>) {
    if (
      input.variantId &&
      !(await prisma.workshopMaster.findFirst({
        where: {
          id: input.variantId,
          kind: "VARIANT",
          parentId: input.modelId,
        },
        select: { id: true },
      }))
    )
      throw new BadRequestError(
        "Select a variant belonging to the selected model",
      );
    const where: Prisma.JobCardWhereInput = {
      branchId,
      status: { in: ["DELIVERED", "Delivered"] },
      deliveredAt: { not: null },
      ...(input.from && input.to
        ? { createdAt: dateBounds(input.from, input.to) }
        : {}),
      ...(input.jobFrom || input.jobTo
        ? { jobNumber: { gte: input.jobFrom, lte: input.jobTo } }
        : {}),
      ...(input.serviceTypeId ? { serviceTypeId: input.serviceTypeId } : {}),
      ...(input.modelId || input.variantId || input.registration
        ? {
            vehicle: {
              ...(input.variantId
                ? { catalogueId: input.variantId }
                : input.modelId
                  ? {
                      OR: [
                        { catalogueId: input.modelId },
                        { catalogue: { parentId: input.modelId } },
                      ],
                    }
                  : {}),
              ...(input.registration
                ? {
                    registrationNumber: {
                      equals: input.registration,
                      mode: "insensitive" as const,
                    },
                  }
                : {}),
            },
          }
        : {}),
    };
    const [jobs, cards] = await Promise.all([
      prisma.jobCard.findMany({
        where,
        include: jobInclude,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 1001,
      }),
      revisions(prisma, branchId),
    ]);
    if (jobs.length > 1000)
      throw new BadRequestError(
        "More than 1,000 delivered jobs match. Narrow the job dates or other filters before loading cards.",
      );
    const rows = jobs.map((job) => {
      let reason: string | null = null;
      let card = null;
      try {
        if (!job.csiSurvey)
          card = selectCsiRevision(
            cards,
            job.createdAt,
            csiJobApplicability(job.serviceType),
          );
      } catch (error) {
        if (error instanceof ConflictError) reason = error.message;
        else throw error;
      }
      if (!job.csiSurvey && !reason && !card)
        reason =
          "No active CSI card matches the job date and type. Configure the card master.";
      if (!job.csiSurvey && (!job.customer || !job.vehicle))
        reason =
          "Link the customer and vehicle to the job before generating a card.";
      return {
        jobCardId: job.id,
        ...snapshot(job),
        surveyId: job.csiSurvey?.id ?? null,
        card: job.csiSurvey?.revision.code ?? card?.code ?? null,
        cardDescription:
          job.csiSurvey?.revision.description ?? card?.description ?? null,
        reason,
        canGenerate: !job.csiSurvey && !reason,
      };
    });
    const key = {
      CARD: "card",
      JOB: "jobNumber",
      MODEL: "model",
      REGISTRATION: "registration",
    } as const;
    rows.sort(
      (a, b) =>
        (a[key[input.order]] ?? "").localeCompare(
          b[key[input.order]] ?? "",
          "en",
          { numeric: true },
        ) ||
        a.jobNumber.localeCompare(b.jobNumber) ||
        a.jobCardId.localeCompare(b.jobCardId),
    );
    const start = (input.page - 1) * 25;
    return {
      items: rows.slice(start, start + 25),
      total: rows.length,
      page: input.page,
      totalPages: Math.max(1, Math.ceil(rows.length / 25)),
    };
  }

  generate(scope: Scope, jobCardIds: string[]) {
    return prisma.$transaction(
      async (tx) => {
        const result = new Map<string, string>();
        let created = 0;
        // Stable locking serializes retries and avoids deadlocks across overlapping batches.
        for (const id of [...jobCardIds].sort()) {
          await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${id} AND "branchId" = ${scope.branchId} FOR UPDATE`;
          const job = await tx.jobCard.findFirst({
            where: { id, branchId: scope.branchId },
            include: jobInclude,
          });
          if (!job)
            throw new NotFoundError(
              "The selected job was not found in this branch",
            );
          if (
            !["DELIVERED", "Delivered"].includes(job.status) ||
            !job.deliveredAt
          )
            throw new BadRequestError(
              "Deliver the selected job before generating its CSI card",
            );
          if (job.csiSurvey) {
            result.set(id, job.csiSurvey.id);
            continue;
          }
          if (!job.customer || !job.vehicle)
            throw new BadRequestError(
              "Link the customer and vehicle to the job before generating its CSI card",
            );
          await tx.$queryRaw`SELECT id FROM "CsiCard" WHERE "branchId" = ${scope.branchId} ORDER BY id FOR SHARE`;
          const card = selectCsiRevision(
            await revisions(tx, scope.branchId),
            job.createdAt,
            csiJobApplicability(job.serviceType),
          );
          if (!card)
            throw new BadRequestError(
              "No active CSI card matches the job date and type. Configure the card master before generating.",
            );
          const survey = await tx.csiSurvey.create({
            data: {
              branchId: scope.branchId,
              jobCardId: id,
              revisionId: card.id,
              generatedById: scope.actorId,
              jobSnapshot: snapshot(job),
            },
          });
          result.set(id, survey.id);
          created++;
        }
        const surveyIds = jobCardIds.map((id) => result.get(id)!);
        await tx.auditLog.create({
          data: {
            userId: scope.actorId,
            action: "CSI_CARDS_GENERATED",
            details: JSON.stringify({
              branchId: scope.branchId,
              surveyIds,
              created,
              reused: surveyIds.length - created,
            }),
          },
        });
        return { surveyIds, created, reused: surveyIds.length - created };
      },
      { timeout: 30000 },
    );
  }

  print(scope: Scope, surveyIds: string[]) {
    return prisma.$transaction(async (tx) => {
      const surveys = await tx.csiSurvey.findMany({
        where: { branchId: scope.branchId, id: { in: surveyIds } },
        include: { revision: { include: cardRevisionInclude } },
      });
      if (surveys.length !== surveyIds.length)
        throw new NotFoundError(
          "One or more CSI cards were not found in the selected branch",
        );
      await tx.auditLog.create({
        data: {
          userId: scope.actorId,
          action: "CSI_CARDS_PRINTED",
          details: JSON.stringify({ branchId: scope.branchId, surveyIds }),
        },
      });
      return {
        surveys: surveyIds.map(
          (id) => surveys.find((survey) => survey.id === id)!,
        ),
      };
    });
  }
}
