import { Prisma } from "@prisma/client";
import { BadRequestError } from "../../shared/errors/appError";

export type Questionnaire = {
  attributes: {
    attributeId: string;
    description: string;
    weightage: Prisma.Decimal;
  }[];
  responses: {
    responseId: string;
    description: string;
    marks: Prisma.Decimal;
  }[];
};
export function scoreCsiResponse(
  card: Questionnaire,
  submitted: { attributeId: string; responseId: string }[],
) {
  if (
    submitted.length !== card.attributes.length ||
    new Set(submitted.map((row) => row.attributeId)).size !== submitted.length
  )
    throw new BadRequestError(
      "Select one response for every questionnaire attribute",
    );
  if (!card.attributes.length || !card.responses.length)
    throw new BadRequestError(
      "The issued questionnaire has no valid questions or responses. Ask the service manager to review it.",
    );
  const answers = submitted.map((row) => {
    const attribute = card.attributes.find(
      (item) => item.attributeId === row.attributeId,
    );
    const response = card.responses.find(
      (item) => item.responseId === row.responseId,
    );
    if (!attribute || !response)
      throw new BadRequestError(
        "Use only the questions and responses on the issued questionnaire",
      );
    return {
      attributeId: row.attributeId,
      responseId: row.responseId,
      attributeDescription: attribute.description,
      weightage: attribute.weightage,
      responseDescription: response.description,
      marks: response.marks,
    };
  });
  // TODO(confirm): proposed legacy formula; no unconfirmed satisfaction bands are assigned.
  // Require every answer, avoiding silent reweighting of blanks. The card maximum is
  // used instead of assuming that every branch uses a five-mark scale.
  const weight = card.attributes.reduce(
    (sum, row) => sum.plus(row.weightage),
    new Prisma.Decimal(0),
  );
  const maximum = card.responses.reduce(
    (max, row) => Prisma.Decimal.max(max, row.marks),
    new Prisma.Decimal(0),
  );
  if (!weight.eq(1) || maximum.lte(0))
    throw new BadRequestError(
      "The issued questionnaire weights must total 1 and response marks must be positive",
    );
  const score = answers.reduce(
    (sum, row) => sum.plus(row.weightage.times(row.marks)),
    new Prisma.Decimal(0),
  );
  return {
    answers,
    score: score.toDecimalPlaces(6),
    scorePercent: score.div(maximum).times(100).toDecimalPlaces(6),
  };
}
