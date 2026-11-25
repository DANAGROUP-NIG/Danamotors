import prisma from "../../prisma/client";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/appError";
import { lagosDay } from "../finance/credit-terms";
import { cardRevisionInclude } from "./csi.service";
import { scoreCsiResponse } from "./csi-response.logic";
import { responseBody } from "./csi-response.validation";
import { z } from "zod";

const details = {
  answers: { orderBy: { attributeId: "asc" as const } },
  revision: { include: cardRevisionInclude },
};
export class CsiResponseService {
  async list(branchId: string, search: string, page: number) {
    const surveys = await prisma.csiSurvey.findMany({
      where: {
        branchId,
        ...(search
          ? {
              jobCard: {
                jobNumber: { contains: search, mode: "insensitive" as const },
              },
            }
          : {}),
      },
      orderBy: [{ generatedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * 25,
      take: 26,
      select: {
        id: true,
        jobSnapshot: true,
        status: true,
        generatedAt: true,
        responseDate: true,
        score: true,
        scorePercent: true,
        version: true,
      },
    });
    return { items: surveys.slice(0, 25), hasNext: surveys.length > 25 };
  }
  async get(branchId: string, id: string) {
    const survey = await prisma.csiSurvey.findFirst({
      where: { branchId, id },
      include: details,
    });
    if (!survey)
      throw new NotFoundError(
        "The CSI questionnaire was not found in the selected branch",
      );
    return {
      ...survey,
      responseDateMin: lagosDay(survey.generatedAt),
      responseDateMax: lagosDay(new Date()),
    };
  }
  save(
    scope: { branchId: string; actorId: string },
    id: string,
    input: z.infer<typeof responseBody>,
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CsiSurvey" WHERE id = ${id} AND "branchId" = ${scope.branchId} FOR UPDATE`;
      const survey = await tx.csiSurvey.findFirst({
        where: { id, branchId: scope.branchId },
        include: details,
      });
      if (!survey)
        throw new NotFoundError(
          "The CSI questionnaire was not found in the selected branch",
        );
      if (input.version !== survey.version)
        throw new ConflictError(
          "This CSI response was changed by another staff member. Reload it before saving your correction.",
        );
      if (
        input.responseDate < lagosDay(survey.generatedAt) ||
        input.responseDate > lagosDay(new Date())
      )
        throw new BadRequestError(
          "Select a response date from the questionnaire generation date through today",
        );
      const scored = scoreCsiResponse(survey.revision, input.answers);
      await tx.csiSurveyAnswer.deleteMany({ where: { surveyId: id } });
      const updated = await tx.csiSurvey.update({
        where: { id },
        data: {
          status: "RESPONDED",
          version: { increment: 1 },
          responseDate: new Date(input.responseDate + "T00:00:00Z"),
          comments: input.comments,
          enteredById: scope.actorId,
          score: scored.score,
          scorePercent: scored.scorePercent,
          answers: { create: scored.answers },
        },
        include: details,
      });
      await tx.auditLog.create({
        data: {
          userId: scope.actorId,
          action: survey.version
            ? "CSI_RESPONSE_CORRECTED"
            : "CSI_RESPONSE_RECORDED",
          details: JSON.stringify({
            surveyId: id,
            branchId: scope.branchId,
            previous: {
              version: survey.version,
              responseDate: survey.responseDate,
              comments: survey.comments,
              score: survey.score,
              scorePercent: survey.scorePercent,
              answers: survey.answers,
            },
            current: {
              version: updated.version,
              responseDate: updated.responseDate,
              comments: updated.comments,
              score: updated.score,
              scorePercent: updated.scorePercent,
              answers: updated.answers,
            },
          }),
        },
      });
      return {
        ...updated,
        responseDateMin: lagosDay(updated.generatedAt),
        responseDateMax: lagosDay(new Date()),
      };
    });
  }
}
