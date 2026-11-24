import { ClipboardList } from "lucide-react";
import { fmtNumber } from '../lib/report-format';
import type { ReportColumn, ReportConfig, OptionDef } from "../types";

const text = (key: string, label: string): ReportColumn => ({
  key,
  label,
  text: (row) =>
    typeof row[key] === "string" && row[key]
      ? String(row[key])
      : "Not provided",
});
const date = (key: string, label: string): ReportColumn => ({
  key,
  label,
  format: "date",
});
const options: OptionDef[] = [
  {
    kind: "range",
    key: "responseDates",
    label: "Response dates",
    fromKey: "from",
    toKey: "to",
    valueType: "date",
  },
  {
    kind: "lookup",
    key: "cardId",
    label: "CSI card",
    source: "csiCard",
    all: "All cards",
  },
];
const formula: OptionDef = {
  kind: "checkbox",
  key: "withFormula",
  label: "With formula",
};
const columns: Record<string, ReportColumn[]> = {
  csi: [
    text("jobNumber", "Job number"),
    date("jobDate", "Job date"),
    text("registration", "Registration"),
    text("model", "Model"),
    text("service", "Service type"),
    text("card", "CSI card"),
    date("responseDate", "Response date"),
    { key: "score", label: "Weighted score", format: "number", totalKey: 'averageScore' },
    { key: "percentage", label: "Score %", format: "percent", totalKey: 'averagePercent' },
  ],
  "csi-attribute": [
    text("attribute", "Attribute"),
    text("response", "Customer response"),
    { key: "count", label: "Responses", format: "integer" },
    { key: "percentage", label: "Response %", format: "percent" },
    text("averageMarks", "Average marks"),
    text("averageWeight", "Average weight"),
    text("weightedScore", "Weighted contribution"),
  ],
  "csi-checklist": [
    text("customer", "Customer"),
    text("phone", "Phone"),
    text("registration", "Registration"),
    text("jobNumber", "Job number"),
    date("responseDate", "Response date"),
    text("attribute", "Attribute"),
    text("response", "Customer response"),
    text("comments", "Comments"),
  ],
};
export const CSI_CONFIGS: ReportConfig[] = [
  {
    slug: "csi",
    title: "CSI report",
    description: "Weighted satisfaction scores from completed questionnaires.",
    permission: "report:csi",
    noun: ["survey", "surveys"] as [string, string],
  },
  {
    slug: "csi-attribute",
    title: "Attribute-wise CSI analysis",
    description:
      "Response counts, percentages and weighted contribution for each question.",
    permission: "report:csi-attribute",
    noun: ["attribute response", "attribute responses"] as [string, string],
  },
  {
    slug: "csi-checklist",
    title: "CSI customer checklist",
    description:
      "Customer contact details and feedback for the selected questions and responses.",
    permission: "report:csi-checklist",
    noun: ["customer answer", "customer answers"] as [string, string],
  },
].map((config) => ({
  ...config,
  category: "Workshop",
  subgroup: "Customer satisfaction",
  icon: ClipboardList,
  width: 80,
  period: {
    kind: "none",
    label: "Response dates",
    presets: [],
    defaultPreset: "thisMonth",
  },
  filters: config.slug === "csi" ? ["model", "variant", "serviceType"] : [],
  options: [
    ...options,
    ...(config.slug === "csi"
      ? ([
          {
            kind: "text",
            key: "jobFrom",
            label: "First job number",
            maxLength: 40,
          },
          {
            kind: "text",
            key: "jobTo",
            label: "Last job number",
            maxLength: 40,
          },
          {
            kind: "text",
            key: "registration",
            label: "Registration number",
            maxLength: 40,
          },
        ] as OptionDef[])
      : ([
          {
            kind: "lookup",
            key: "attributeId",
            label: "Attribute",
            source: "csiAttribute",
            all: "All attributes",
          },
        ] as OptionDef[])),
    ...(config.slug === "csi-checklist"
      ? ([
          {
            kind: "lookup",
            key: "responseId",
            label: "Customer response",
            source: "csiResponse",
            all: "All responses",
          },
        ] as OptionDef[])
      : [formula]),
  ],
  columns: columns[config.slug],
  totalLabel: data => config.slug === 'csi' ? `Average for ${fmtNumber(data.totals.surveys ?? 0, 'integer')} ${(data.totals.surveys ?? 0) === 1 ? 'survey' : 'surveys'}` : `${fmtNumber(data.totals[config.slug === 'csi-attribute' ? 'attributes' : 'answers'] ?? 0, 'integer')} ${config.slug === 'csi-attribute' ? 'attributes' : 'customer answers'}`,
  summaryCards: (data) => [
    {
      label: "Surveys included",
      value: String(data.summary?.surveys ?? 0),
      tone: "gray",
    },
    ...(config.slug === 'csi' ? [
      { label: 'Average weighted score', value: fmtNumber(data.totals.averageScore ?? 0, 'number'), tone: 'gray' as const },
      { label: 'Average score', value: `${fmtNumber(data.totals.averagePercent ?? 0, 'number')}%`, tone: 'gray' as const },
    ] : [
      { label: config.slug === 'csi-attribute' ? 'Attributes included' : 'Customer answers', value: fmtNumber(data.totals[config.slug === 'csi-attribute' ? 'attributes' : 'answers'] ?? 0, 'integer'), tone: 'gray' as const },
    ]),
  ],
  footnote:
    "Only completed questionnaires are included. Weighted score is the sum of stored weight x marks. Percentage uses the issued card maximum. All questions are required. The proposed legacy formula awaits business confirmation; satisfaction bands are not assigned without approved thresholds.",
  emptyMessage:
    "No completed CSI questionnaires match. Review the filters or record the issued questionnaire responses.",
}));
