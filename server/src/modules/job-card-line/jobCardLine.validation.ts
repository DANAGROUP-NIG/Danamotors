import { z } from "zod";
import { ChargeType } from "@prisma/client";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);
const hours = z.number().positive("Hours must be greater than zero").max(1000);
const rate = z.number().nonnegative("Rate must be 0 or more").max(100_000_000);

export const jobCardParamSchema = z.object({ params: z.object({ id: uuid("job card ID") }) });

export const addLabourLineSchema = z.object({
  params: z.object({ id: uuid("job card ID") }),
  body: z.object({
    operationCode: z.string().trim().max(30).nullable().optional(),
    description: z.string().trim().min(1, "Describe the labour operation").max(200),
    hours,
    rate,
    taxable: z.boolean().optional(),
    chargeType: z.nativeEnum(ChargeType).optional(),
    campaignId: uuid("campaign ID").nullable().optional(),
    reason: z.string().trim().max(300).nullable().optional(),
  }),
});

export const updateLineSchema = z.object({
  params: z.object({ id: uuid("job card ID"), lineId: uuid("line ID") }),
  body: z
    .object({
      chargeType: z.nativeEnum(ChargeType).optional(),
      campaignId: uuid("campaign ID").nullable().optional(),
      reason: z.string().trim().max(300).nullable().optional(),
      operationCode: z.string().trim().max(30).nullable().optional(),
      description: z.string().trim().min(1).max(200).optional(),
      hours: hours.optional(),
      rate: rate.optional(),
      taxable: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});

export const lineParamSchema = z.object({ params: z.object({ id: uuid("job card ID"), lineId: uuid("line ID") }) });

export const generateInvoiceSchema = z.object({
  params: z.object({ jobCardId: uuid("job card ID") }),
  body: z
    .object({
      dueDate: z.coerce.date().nullable().optional(),
      notes: z.string().trim().max(1000).nullable().optional(),
    })
    .default({}),
});
