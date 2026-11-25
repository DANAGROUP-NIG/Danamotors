import { Prisma } from "@prisma/client";
import { z } from "zod";

const id = z.string().uuid("Select a valid record");
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{1,20}$/, "Use 1 to 20 letters, digits or hyphens");
const description = z.string().trim().min(1, "Enter a description").max(300);
const decimal = (digits: number) =>
  z
    .string()
    .regex(
      new RegExp("^\\d{1," + digits + "}(?:\\.\\d{1,6})?$"),
      "Enter a number with up to six decimal places",
    );
const weightage = decimal(1).pipe(
  z
    .string()
    .refine(
      (value) => new Prisma.Decimal(value).lte(1),
      "Enter a weight between 0 and 1",
    ),
);
const marks = decimal(6).pipe(
  z
    .string()
    .refine(
      (value) => new Prisma.Decimal(value).gt(0),
      "Enter marks greater than 0",
    ),
);
const date = z.string().date("Enter a valid date");
const base = z.object({ code, description, active: z.boolean() });
export const attributeBody = base
  .extend({
    shortDescription: z
      .string()
      .trim()
      .min(1, "Enter a short description")
      .max(120),
    weightage,
  })
  .strict();
export const responseBody = base.extend({ marks }).strict();
export const cardBody = base
  .extend({
    cardDate: date,
    effectiveDate: date,
    appliesTo: z.enum(["NON_ACCIDENTAL", "ACCIDENTAL", "BOTH"]),
    attributes: z
      .array(z.object({ attributeId: id, weightage }).strict())
      .min(1, "Add at least one attribute")
      .max(100),
    responses: z
      .array(z.object({ responseId: id, marks }).strict())
      .min(2, "Add at least two responses")
      .max(20),
  })
  .strict();
export const cardUpdateBody = cardBody
  .extend({ version: z.number().int().positive() })
  .superRefine(checkCard);
export const cardCreateBody = cardBody.superRefine(checkCard);

function checkCard(card: z.infer<typeof cardBody>, ctx: z.RefinementCtx) {
  if (
    new Set(card.attributes.map((row) => row.attributeId)).size !==
    card.attributes.length
  )
    ctx.addIssue({
      code: "custom",
      path: ["attributes"],
      message: "Use each attribute once",
    });
  if (
    new Set(card.responses.map((row) => row.responseId)).size !==
    card.responses.length
  )
    ctx.addIssue({
      code: "custom",
      path: ["responses"],
      message: "Use each response once",
    });
  if (
    card.attributes.every((row) => weightage.safeParse(row.weightage).success)
  ) {
    const total = card.attributes.reduce(
      (sum, row) => sum.plus(row.weightage),
      new Prisma.Decimal(0),
    );
    if (!total.eq(1))
      ctx.addIssue({
        code: "custom",
        path: ["attributes"],
        message:
          "Adjust the weights to total 1.0. Current total is " +
          total.toString(),
      });
  }
}

export const masterQuery = z.object({ branchId: id.optional() }).strict();
export const masterListQuery = masterQuery.extend({
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export const masterParams = z.object({ id }).strict();
