const json = (schema: object) => ({ "application/json": { schema } });
const query = (name: string, schema: object, description: string) => ({
  name,
  in: "query",
  required: false,
  schema,
  description,
});
const branch = query(
  "branchId",
  { type: "string", format: "uuid" },
  "Defaults to the signed-in branch. Cross-branch access requires branch:all.",
);
const response = {
  200: { description: "Success" },
  400: {
    description:
      "Invalid filters, non-delivered job, missing card or ambiguous card selection",
  },
  401: { description: "Sign in required" },
  403: { description: "CSI generation permission or branch access denied" },
  404: { description: "A selected job or survey was not found in this branch" },
  409: {
    description: "Equally applicable card revisions require master correction",
  },
};
const operation = (
  summary: string,
  description: string,
  extra: object = {},
) => ({
  tags: ["CSI"],
  security: [{ BearerAuth: [] }],
  summary,
  description,
  parameters: [branch],
  responses: response,
  ...extra,
});
const body = (key: string) => ({
  required: true,
  content: json({
    type: "object",
    additionalProperties: false,
    required: [key],
    properties: {
      [key]: {
        type: "array",
        minItems: 1,
        maxItems: 25,
        uniqueItems: true,
        items: { type: "string", format: "uuid" },
      },
    },
  }),
});
export const csiIssuancePaths = {
  "/csi/surveys/options": {
    get: operation(
      "CSI generation filter options",
      "Requires csi:card:generate. Returns active job types, models and variants; variants retain their parent model id.",
    ),
  },
  "/csi/surveys": {
    get: operation(
      "List delivered jobs for CSI generation",
      "Requires csi:card:generate. Job dates use Africa/Lagos opening days. Active card revisions are matched by applicability and effective date. Existing surveys retain their original revision. A bounded preview refuses more than 1,000 matches; narrow the filters. Page size is 25.",
      {
        parameters: [
          branch,
          ...["from", "to"].map((name) =>
            query(
              name,
              { type: "string", format: "date" },
              "Job opening date range, both dates or neither. Inclusive Lagos days.",
            ),
          ),
          ...["jobFrom", "jobTo", "registration"].map((name) =>
            query(
              name,
              { type: "string" },
              "Optional inclusive job-number bound or exact registration.",
            ),
          ),
          ...["serviceTypeId", "modelId", "variantId"].map((name) =>
            query(
              name,
              { type: "string", format: "uuid" },
              "Optional workshop master. Variant must belong to selected model.",
            ),
          ),
          query(
            "order",
            {
              type: "string",
              enum: ["CARD", "JOB", "MODEL", "REGISTRATION"],
              default: "JOB",
            },
            "Stable ordering before pagination.",
          ),
          query(
            "page",
            { type: "integer", minimum: 1, default: 1 },
            "Preview page.",
          ),
        ],
      },
    ),
  },
  "/csi/surveys/generate": {
    post: operation(
      "Issue CSI cards for selected delivered jobs",
      "Requires csi:card:generate. Atomic batch of up to 25 jobs. Locks jobs and card masters; repeated or concurrent requests reuse each job survey. Persists the immutable card revision and job/customer snapshot. No scoring or survey response is created.",
      {
        requestBody: body("jobCardIds"),
        responses: {
          ...response,
          201: {
            description: "Created or reused survey ids, in submitted order",
          },
        },
      },
    ),
  },
  "/csi/surveys/print": {
    post: operation(
      "Load issued CSI questionnaires for printing or reprinting",
      "Requires csi:card:generate. Loads only issued surveys from the authorized branch, in submitted order. Records an audit event. Reprinting never creates a survey or changes the stored job/card snapshot. The client prints one questionnaire per job or saves it as a PDF using the browser print dialog.",
      { requestBody: body("surveyIds") },
    ),
  },
};
