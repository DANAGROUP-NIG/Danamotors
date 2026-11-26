import { Prisma } from "@prisma/client";
import type { ReportBody, ReportSection } from "../reports/core/types";
export type CsiReportSurvey = {
  id: string;
  jobNumber: string;
  jobDate: string;
  registration: string;
  model: string;
  variant: string;
  service: string;
  customer: string;
  phone: string;
  comments: string;
  responseDate: string;
  card: string;
  score: Prisma.Decimal;
  scorePercent: Prisma.Decimal;
  answers: {
    attributeId: string;
    attributeDescription: string;
    weightage: Prisma.Decimal;
    responseId: string;
    responseDescription: string;
    marks: Prisma.Decimal;
  }[];
  responses: {
    responseId: string;
    description: string;
    marks: Prisma.Decimal;
  }[];
};
export type CsiReportKind = "csi" | "csi-attribute" | "csi-checklist";
const mean = (values: Prisma.Decimal[]) =>
  values.length
    ? values
        .reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0))
        .div(values.length)
        .toDecimalPlaces(6)
    : new Prisma.Decimal(0);
const average = (values: Prisma.Decimal[]) => mean(values).toNumber();

export function buildCsiReport(
  kind: CsiReportKind,
  surveys: CsiReportSurvey[],
  filters: { attributeId?: string; responseId?: string; withFormula?: boolean },
): ReportBody {
  const totals = {
    surveys: surveys.length,
    averageScore: average(surveys.map((row) => row.score)),
    averagePercent: average(surveys.map((row) => row.scorePercent)),
  };
  const formula: ReportSection = {
    key: "formula",
    title: "Stored questionnaire formula",
    columns: [
      { key: "jobNumber", label: "Job number" },
      { key: "attribute", label: "Attribute" },
      { key: "weight", label: "Weight" },
      { key: "marks", label: "Marks" },
      { key: "weightedMarks", label: "Weight x marks" },
    ],
    rows: surveys.flatMap((survey) =>
      survey.answers
        .filter(
          (answer) =>
            !filters.attributeId || answer.attributeId === filters.attributeId,
        )
        .map((answer) => ({
          jobNumber: survey.jobNumber,
          attribute: answer.attributeDescription,
          weight: answer.weightage.toString(),
          marks: answer.marks.toString(),
          weightedMarks: answer.weightage.times(answer.marks).toFixed(6),
        })),
    ),
  };
  if (kind === "csi")
    return {
      rows: surveys.map((row) => ({
        id: row.id,
        jobNumber: row.jobNumber,
        jobDate: row.jobDate,
        registration: row.registration,
        model: row.model,
        variant: row.variant,
        service: row.service,
        card: row.card,
        responseDate: row.responseDate,
        score: row.score.toNumber(),
        percentage: row.scorePercent.toNumber(),
      })),
      groups: [],
      totals,
      summary: totals,
      ...(filters.withFormula ? { sections: [formula] } : {}),
    };
  if (kind === "csi-checklist") {
    const rows = surveys.flatMap((survey) =>
      survey.answers
        .filter(
          (answer) =>
            (!filters.attributeId ||
              answer.attributeId === filters.attributeId) &&
            (!filters.responseId || answer.responseId === filters.responseId),
        )
        .map((answer) => ({
          id: survey.id + answer.attributeId,
          jobNumber: survey.jobNumber,
          customer: survey.customer,
          phone: survey.phone,
          registration: survey.registration,
          responseDate: survey.responseDate,
          attribute: answer.attributeDescription,
          response: answer.responseDescription,
          comments: survey.comments,
        })),
    );
    return {
      rows,
      groups: [],
      totals: { ...totals, answers: rows.length },
      summary: { surveys: surveys.length, answers: rows.length },
    };
  }
  const attributes = new Map<
    string,
    {
      description: string;
      answers: CsiReportSurvey["answers"];
      ratings: Map<
        string,
        { description: string; count: number; marks: string }
      >;
      count: number;
    }
  >();
  for (const survey of surveys)
    for (const answer of survey.answers) {
      if (filters.attributeId && filters.attributeId !== answer.attributeId)
        continue;
      const key = answer.attributeId + ":" + answer.attributeDescription;
      const attribute: NonNullable<ReturnType<typeof attributes.get>> =
        attributes.get(key) ?? {
          description: answer.attributeDescription,
          answers: [],
          ratings: new Map(),
          count: 0,
        };
      for (const rating of survey.responses) {
        const ratingKey =
          rating.responseId +
          ":" +
          rating.description +
          ":" +
          rating.marks.toString();
        if (!attribute.ratings.has(ratingKey))
          attribute.ratings.set(ratingKey, {
            description: rating.description,
            count: 0,
            marks: rating.marks.toString(),
          });
      }
      const ratingKey =
        answer.responseId +
        ":" +
        answer.responseDescription +
        ":" +
        answer.marks.toString();
      const rating = attribute.ratings.get(ratingKey) ?? {
        description: answer.responseDescription,
        count: 0,
        marks: answer.marks.toString(),
      };
      rating.count++;
      attribute.ratings.set(ratingKey, rating);
      attribute.answers.push(answer);
      attribute.count++;
      attributes.set(key, attribute);
    }
  const rows = [...attributes]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([key, attribute]) => {
      const averageMarks = mean(
        attribute.answers.map((row) => row.marks),
      ).toFixed(6);
      const averageWeight = mean(
        attribute.answers.map((row) => row.weightage),
      ).toFixed(6);
      const weightedScore = attribute.answers
        .reduce(
          (sum, row) => sum.plus(row.weightage.times(row.marks)),
          new Prisma.Decimal(0),
        )
        .div(attribute.count)
        .toFixed(6);
      return [...attribute.ratings]
        .sort(
          ([, a], [, b]) =>
            new Prisma.Decimal(b.marks).cmp(a.marks) ||
            a.description.localeCompare(b.description),
        )
        .map(([ratingKey, rating]) => ({
          id: key + ratingKey,
          attribute: attribute.description,
          response: rating.description,
          count: rating.count,
          percentage: new Prisma.Decimal(rating.count)
            .div(attribute.count)
            .times(100)
            .toDecimalPlaces(6)
            .toNumber(),
          averageMarks,
          averageWeight,
          weightedScore,
        }));
    });
  return {
    rows,
    groups: [],
    totals: { ...totals, attributes: attributes.size },
    summary: { surveys: surveys.length, attributes: attributes.size },
    ...(filters.withFormula ? { sections: [formula] } : {}),
  };
}
