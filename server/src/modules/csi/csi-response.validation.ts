import { z } from "zod";
export const responseListQuery = z
  .object({
    branchId: z.string().uuid().optional(),
    search: z.string().trim().max(40).default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
export const surveyParams = z.object({
  id: z.string().uuid("Select a valid CSI survey"),
});
export const responseBody = z
  .object({
    version: z.number().int().nonnegative(),
    responseDate: z.string().date("Select a valid response date"),
    comments: z
      .string()
      .trim()
      .max(2000, "Keep comments within 2,000 characters")
      .default(""),
    answers: z
      .array(
        z
          .object({
            attributeId: z.string().uuid(),
            responseId: z.string().uuid("Select a response for this question"),
          })
          .strict(),
      )
      .min(1, "Answer the questionnaire before saving")
      .max(100),
  })
  .strict();
