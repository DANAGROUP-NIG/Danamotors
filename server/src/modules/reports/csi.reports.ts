import { z } from "zod";
import {
  branchParam,
  dateString,
  flag,
  idList,
  modeParam,
} from "./core/filters";
import {
  defineReport,
  type FilterKey,
  type ReportDb,
  type ReportScope,
} from "./core/types";
import { PERMISSIONS } from "../../shared/constants/roles";
import { BadRequestError } from "../../shared/errors/appError";
import { dateBounds } from "./report.logic";
import { lagosDay } from "../finance/credit-terms";
import {
  buildCsiReport,
  type CsiReportKind,
  type CsiReportSurvey,
} from "../csi/csi-report.logic";
import type { Prisma } from "@prisma/client";

export const csiReportQuery = z
  .object({
    branchId: branchParam,
    mode: modeParam,
    from: dateString.optional(),
    to: dateString.optional(),
    withFormula: flag,
    cardId: z.string().uuid().optional(),
    attributeId: z.string().uuid().optional(),
    responseId: z.string().uuid().optional(),
    model: idList,
    variant: idList,
    serviceType: idList,
    jobFrom: z.string().trim().max(40).optional(),
    jobTo: z.string().trim().max(40).optional(),
    registration: z.string().trim().max(40).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      !!value.from !== !!value.to ||
      (value.from && value.to && value.from > value.to)
    )
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message:
          "Select both response dates, with the end date on or after the start date",
      });
    if (value.jobFrom && value.jobTo && value.jobFrom > value.jobTo)
      ctx.addIssue({
        code: "custom",
        path: ["jobTo"],
        message: "Enter a last job number on or after the first job number",
      });
  });
type Query = z.infer<typeof csiReportQuery>;
async function load(db: ReportDb, scope: ReportScope, query: Query) {
  const rows = await db.csiSurvey.findMany({
    where: {
      status: "RESPONDED",
      ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}),
      ...(query.from && query.to
        ? { responseDate: dateBounds(query.from, query.to) }
        : {}),
      ...(query.cardId ? { revision: { cardId: query.cardId } } : {}),
    },
    include: { answers: true, revision: { include: { responses: true } } },
    orderBy: [{ responseDate: "asc" }, { id: "asc" }],
    take: 2001,
  });
  if (rows.length > 2000)
    throw new BadRequestError(
      "More than 2,000 CSI responses match. Narrow the response dates or CSI card before running the report.",
    );
  const surveys: CsiReportSurvey[] = [];
  for (const survey of rows) {
    const snapshot = survey.jobSnapshot as Prisma.JsonObject;
    const text = (key: string) =>
      typeof snapshot[key] === "string" ? String(snapshot[key]) : "";
    if (
      (query.jobFrom && text("jobNumber") < query.jobFrom) ||
      (query.jobTo && text("jobNumber") > query.jobTo)
    )
      continue;
    if (
      query.registration &&
      text("registration").toUpperCase() !== query.registration.toUpperCase()
    )
      continue;
    if (query.model?.length && !query.model.includes(text("modelId"))) continue;
    if (query.variant?.length && !query.variant.includes(text("variantId")))
      continue;
    if (
      query.serviceType?.length &&
      !query.serviceType.includes(text("serviceTypeId"))
    )
      continue;
    if (!survey.score || !survey.scorePercent || !survey.responseDate)
      throw new BadRequestError(
        "A responded CSI survey has incomplete scoring data. Open the response and save a correction before running this report.",
      );
    surveys.push({
      id: survey.id,
      jobNumber: text("jobNumber"),
      jobDate: text("jobDate"),
      registration: text("registration"),
      model: text("model"),
      variant: text("variant"),
      service: text("service"),
      customer: text("customer"),
      phone: text("mobile") || text("residencePhone") || text("officePhone"),
      comments: survey.comments ?? "",
      responseDate: lagosDay(survey.responseDate),
      card: survey.revision.code,
      score: survey.score,
      scorePercent: survey.scorePercent,
      answers: survey.answers,
      responses: survey.revision.responses,
    });
  }
  return surveys;
}
const definitions = [
  ["csi", "CSI report", PERMISSIONS.CSI_REPORT],
  [
    "csi-attribute",
    "Attribute-wise CSI analysis",
    PERMISSIONS.CSI_ATTRIBUTE_REPORT,
  ],
  ["csi-checklist", "CSI customer checklist", PERMISSIONS.CSI_CHECKLIST_REPORT],
] as const;
export const CSI_REPORTS = definitions.map(([slug, title, permission]) =>
  defineReport({
    slug,
    title,
    permission,
    width: 80,
    period: "none",
    query: csiReportQuery,
    summary:
      "Responded surveys only, using immutable job and answer snapshots. All answers are required. Proposed weighted formula awaits business confirmation; satisfaction bands are not assigned without approved thresholds. Report limits reject oversize results rather than truncate averages.",
    filterKeys: (slug === "csi"
      ? ["model", "variant", "serviceType"]
      : []) as FilterKey[],
    params: [
      ...["from", "to"].map((name) => ({
        name,
        description:
          "Optional response-date range, both dates or neither. Inclusive Lagos days.",
        schema: { type: "string", format: "date" },
      })),
      ...["cardId", "attributeId", "responseId"].map((name) => ({
        name,
        description:
          "Optional CSI master id. Attribute and response filters apply to analysis/checklist rows.",
        schema: { type: "string", format: "uuid" },
      })),
      ...["jobFrom", "jobTo", "registration"].map((name) => ({
        name,
        description:
          "Optional job-number bound or exact registration, using issuance snapshots.",
        schema: { type: "string" },
      })),
      {
        name: "withFormula",
        description:
          "Include stored attribute weights, marks and weighted products in screen, print and export sections.",
        schema: { type: "boolean" },
      },
    ],
    async run(db, scope, query) {
      return buildCsiReport(
        slug as CsiReportKind,
        await load(db, scope, query),
        query,
      );
    },
  }),
);
