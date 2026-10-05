import { z } from "zod";
import { ChargeType } from "@prisma/client";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);

export const jobCardParamSchema = z.object({ params: z.object({ id: uuid("job card ID") }) });

// Lines mirror stock issues and labour lines, so only who pays can change here.
export const updateLineSchema = z.object({
  params: z.object({ id: uuid("job card ID"), lineId: uuid("line ID") }),
  body: z
    .object({
      chargeType: z.nativeEnum(ChargeType).optional(),
      campaignId: uuid("campaign ID").nullable().optional(),
      reason: z.string().trim().max(300).nullable().optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});
