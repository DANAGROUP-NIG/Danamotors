/** OpenAPI operations for the branch-scoped CSI masters. */
const uuid = { type: "string", format: "uuid" };
const base = {
  code: "A1",
  description: "Ease in making a service appointment",
  shortDescription: "Appointment booking",
  active: true,
  weightage: "0.035",
};
const response = {
  code: "01",
  description: "Excellent",
  active: true,
  marks: "5",
};
const id = "61616161-6161-4161-8161-616161616161";
const card = {
  code: "C1",
  description: "Regular service CSI card",
  active: true,
  cardDate: "2026-11-23",
  effectiveDate: "2026-12-01",
  appliesTo: "NON_ACCIDENTAL",
  attributes: [{ attributeId: id, weightage: "1" }],
  responses: [
    { responseId: id, marks: "5" },
    { responseId: "62626262-6262-4262-8262-626262626262", marks: "1" },
  ],
};
const branch = {
  in: "query",
  name: "branchId",
  schema: uuid,
  description:
    "Defaults to your branch. Cross-branch selection requires branch:all.",
};
const target = { in: "path", name: "id", required: true, schema: uuid };
const json = (example: unknown) => ({ "application/json": { example } });
const ok = (statusCode: number, data: unknown) => ({
  description: "Success",
  content: json({ status: "success", statusCode, data }),
});
const errors = {
  400: { description: "Invalid input or missing branch" },
  401: { description: "Authentication required" },
  403: { description: "CSI permission or branch access denied" },
  404: { description: "Record not found in the selected branch" },
  409: { description: "Duplicate code or stale card revision" },
};

export const csiPaths = Object.fromEntries(
  (
    [
      ["attributes", base],
      ["responses", response],
      ["cards", card],
    ] as const
  ).flatMap(([kind, example]) => {
    const item =
      kind === "cards"
        ? {
            id,
            branchId: id,
            code: card.code,
            active: card.active,
            version: 1,
            revisions: [
              {
                id,
                cardId: id,
                branchId: id,
                version: 1,
                code: card.code,
                description: card.description,
                appliesTo: card.appliesTo,
                cardDate: card.cardDate + "T00:00:00.000Z",
                effectiveDate: card.effectiveDate + "T00:00:00.000Z",
                attributes: card.attributes.map((row, index) => ({
                  ...row,
                  branchId: id,
                  revisionId: id,
                  sequence: index + 1,
                  description: base.description,
                })),
                responses: card.responses.map((row, index) => ({
                  ...row,
                  branchId: id,
                  revisionId: id,
                  sequence: index + 1,
                  description: index ? "Poor" : "Excellent",
                })),
              },
            ],
          }
        : { id, branchId: id, ...example };
    const common = { tags: ["CSI"], security: [{ bearerAuth: [] }] };
    const write = (editing: boolean) => ({
      ...common,
      summary: (editing ? "Update CSI " : "Create CSI ") + kind,
      description:
        "Requires csi:master:update. Send complete records. Card edits append an immutable revision and require the current version.",
      parameters: editing ? [branch, target] : [branch],
      requestBody: {
        required: true,
        content: json(
          editing && kind === "cards" ? { ...card, version: 1 } : example,
        ),
      },
      responses: {
        ...errors,
        [editing ? 200 : 201]: ok(editing ? 200 : 201, item),
      },
    });
    return [
      [
        "/csi/" + kind,
        {
          get: {
            ...common,
            summary: "List CSI " + kind,
            description:
              "Requires csi:master:read. Sorted by code, 25 records per page.",
            parameters: [
              branch,
              {
                in: "query",
                name: "page",
                schema: {
                  type: "integer",
                  minimum: 1,
                  maximum: 10000,
                  default: 1,
                },
              },
            ],
            responses: {
              ...errors,
              200: ok(200, { items: [item], page: 1, hasNext: false }),
            },
          },
          post: write(false),
        },
      ],
      ["/csi/" + kind + "/{id}", { patch: write(true) }],
    ];
  }),
);
