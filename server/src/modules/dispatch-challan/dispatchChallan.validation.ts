import { z } from "zod";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);
const quantity = z.number().int("Quantity must be a whole number").positive("Quantity must be above zero");
const day = z.string().date("Use a YYYY-MM-DD date");

export const idParamSchema = z.object({ params: z.object({ id: uuid("challan ID") }) });

export const listSchema = z.object({
  query: z.object({
    branchId: uuid("branch ID").optional(),
    customerId: uuid("customer ID").optional(),
    search: z.string().trim().max(50).optional(),
    from: day.optional(),
    to: day.optional(),
  }),
});

export const createChallanSchema = z.object({
  body: z.object({
    branchId: uuid("branch ID"),
    customerId: uuid("cost centre ID"),
    remarks: z.string().trim().max(500).optional(),
    lines: z
      .array(z.object({ partId: uuid("part ID"), quantity }))
      .min(1, "Add at least one part")
      .max(200, "A challan can have at most 200 lines")
      .refine((lines) => new Set(lines.map((l) => l.partId)).size === lines.length, "Each part can appear only once"),
  }),
});

export const createReturnSchema = z.object({
  params: z.object({ id: uuid("challan ID") }),
  body: z
    .object({
      reason: z.string().trim().max(500).optional(),
      fullReturn: z.boolean().optional(),
      lines: z
        .array(z.object({ challanLineId: uuid("challan line ID"), quantity }))
        .max(200)
        .refine((lines) => new Set(lines.map((l) => l.challanLineId)).size === lines.length, "Each challan line can appear only once")
        .optional(),
    })
    .refine((b) => b.fullReturn || (b.lines?.length ?? 0) > 0, { message: "Select at least one line to return", path: ["lines"] }),
});
