import { z } from "zod";

export const issuanceScope = z
  .object({ branchId: z.string().uuid().optional() })
  .strict();
export const issuanceQuery = issuanceScope
  .extend({
    from: z.string().date("Select a valid job start date").optional(),
    to: z.string().date("Select a valid job end date").optional(),
    jobFrom: z.string().trim().max(40).optional(),
    jobTo: z.string().trim().max(40).optional(),
    serviceTypeId: z.string().uuid().optional(),
    modelId: z.string().uuid().optional(),
    variantId: z.string().uuid().optional(),
    registration: z.string().trim().min(1).max(40).optional(),
    order: z.enum(["CARD", "JOB", "MODEL", "REGISTRATION"]).default("JOB"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .superRefine((value, ctx) => {
    if (
      !!value.from !== !!value.to ||
      (value.from && value.to && value.from > value.to)
    )
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message:
          "Select both job dates, with the end date on or after the start date",
      });
    if (value.jobFrom && value.jobTo && value.jobFrom > value.jobTo)
      ctx.addIssue({
        code: "custom",
        path: ["jobTo"],
        message: "Select a last job number on or after the first job number",
      });
    if (value.variantId && !value.modelId)
      ctx.addIssue({
        code: "custom",
        path: ["modelId"],
        message: "Select the model before selecting a variant",
      });
  });
export const generationBody = z
  .object({
    jobCardIds: z
      .array(z.string().uuid())
      .min(1, "Select at least one delivered job")
      .max(25, "Generate up to 25 cards at a time"),
  })
  .strict()
  .refine(
    (value) => new Set(value.jobCardIds).size === value.jobCardIds.length,
    "Select each job once",
  );
export const printBody = z
  .object({ surveyIds: z.array(z.string().uuid()).min(1).max(25) })
  .strict()
  .refine(
    (value) => new Set(value.surveyIds).size === value.surveyIds.length,
    "Select each card once",
  );
