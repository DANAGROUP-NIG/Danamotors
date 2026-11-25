import { Prisma } from "@prisma/client";
import { scoreCsiResponse } from "./csi-response.logic";
import { buildCsiReport, type CsiReportSurvey } from "./csi-report.logic";
import { csiReportQuery } from "../reports/csi.reports";
const decimal = (value: string) => new Prisma.Decimal(value);
const card = {
  attributes: [
    { attributeId: "a", description: "Reception", weightage: decimal("0.035") },
    {
      attributeId: "b",
      description: "Work quality",
      weightage: decimal("0.965"),
    },
  ],
  responses: [
    { responseId: "good", description: "Good", marks: decimal("3") },
    { responseId: "best", description: "Excellent", marks: decimal("5") },
  ],
};
const selected = [
  { attributeId: "a", responseId: "good" },
  { attributeId: "b", responseId: "best" },
];
it("calculates exact stored-weight scores and derives the card maximum without float accumulation", () => {
  const result = scoreCsiResponse(card, selected);
  expect(result.score.toString()).toBe("4.93");
  expect(result.scorePercent.toString()).toBe("98.6");
  expect(result.answers[0].weightage.toString()).toBe("0.035");
  expect(
    scoreCsiResponse(
      {
        ...card,
        responses: card.responses.map((row) => ({
          ...row,
          marks: row.marks.times(2),
        })),
      },
      selected,
    ).scorePercent.toString(),
  ).toBe("98.6");
});
it("refuses missing, duplicate or foreign answers and invalid questionnaire weights", () => {
  expect(() => scoreCsiResponse(card, selected.slice(0, 1))).toThrow("every");
  expect(() => scoreCsiResponse(card, [selected[0], selected[0]])).toThrow(
    "every",
  );
  expect(() =>
    scoreCsiResponse(card, [
      selected[0],
      { attributeId: "b", responseId: "foreign" },
    ]),
  ).toThrow("issued");
  expect(() =>
    scoreCsiResponse(
      {
        ...card,
        attributes: card.attributes.map((row) => ({
          ...row,
          weightage: decimal("0.5"),
        })),
      },
      selected,
    ),
  ).not.toThrow();
  expect(() =>
    scoreCsiResponse(
      {
        ...card,
        attributes: card.attributes.map((row) => ({
          ...row,
          weightage: decimal("0.1"),
        })),
      },
      selected,
    ),
  ).toThrow("total 1");
});
const survey = (id: string, answers = selected): CsiReportSurvey => {
  const scored = scoreCsiResponse(card, answers);
  return {
    id,
    jobNumber: id,
    jobDate: "2026-11-01",
    responseDate: "2026-11-03",
    registration: "TEST",
    model: "Test model",
    variant: "Test variant",
    service: "Test service",
    customer: "Test customer",
    phone: "Not provided",
    comments: "Test comment",
    card: "C1",
    ...scored,
    responses: card.responses,
  };
};
it("keeps summary averages, attribute counts and formula sections consistent with stored survey scores", () => {
  const surveys = [
    survey("one"),
    survey("two", [
      { attributeId: "a", responseId: "best" },
      { attributeId: "b", responseId: "best" },
    ]),
  ];
  const report = buildCsiReport("csi", surveys, { withFormula: true });
  expect(report.totals).toMatchObject({
    surveys: 2,
    averageScore: 4.965,
    averagePercent: 99.3,
  });
  expect(report.sections?.[0].rows[0]).toMatchObject({
    weight: "0.035",
    weightedMarks: "0.105000",
  });
  const attributes = buildCsiReport("csi-attribute", surveys, {
    attributeId: "a",
  });
  expect(attributes.rows).toHaveLength(2);
  expect(attributes.rows.map((row) => row.percentage)).toEqual([50, 50]);
  expect(attributes.rows[0]).toMatchObject({
    averageMarks: "4.000000",
    averageWeight: "0.035000",
    weightedScore: "0.140000",
  });
  expect(
    buildCsiReport("csi-checklist", surveys, {
      attributeId: "a",
      responseId: "good",
    }).rows,
  ).toHaveLength(1);
  expect(buildCsiReport("csi", [], {}).totals).toEqual({
    surveys: 0,
    averageScore: 0,
    averagePercent: 0,
  });
});
it("rejects partial or reversed report date ranges and job bounds", () => {
  expect(csiReportQuery.safeParse({ from: "2026-11-01" }).success).toBe(false);
  expect(csiReportQuery.safeParse({ jobFrom: "20", jobTo: "10" }).success).toBe(
    false,
  );
  expect(csiReportQuery.safeParse({}).success).toBe(true);
});
