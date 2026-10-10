import { z } from "zod";

const day = z.string().date("Use a YYYY-MM-DD date");
const uuid = (label: string) => z.string().uuid(`Invalid ${label}`).optional();
const flag = z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true"));

export const partSearchSchema = z.object({
  query: z.object({ search: z.string().trim().max(40).optional(), limit: z.coerce.number().optional() }),
});

export const runReportSchema = z.object({
  params: z.object({ kind: z.string().trim().min(1).max(60) }),
  query: z
    .object({
      from: day,
      to: day,
      branchId: uuid("branch ID"),
      customerId: uuid("customer ID"),
      vendor: z.string().trim().max(100).optional(),
      executiveId: uuid("sales executive ID"),
      otherBranchId: uuid("branch ID"),
      partId: uuid("part ID"),
      partFlag: z.string().trim().max(2).optional(),
      priceCategory: z.string().trim().max(5).optional(),
      search: z.string().trim().max(40).optional(),
      status: z.enum(["PENDING", "CANCELLED", "EXECUTED"]).optional(),
      option: z.string().trim().max(20).optional(),
      fullyExecuted: flag,
      includeReturns: flag,
      includeCancelled: flag,
    })
    .refine((q) => q.from <= q.to, { path: ["to"], message: "The end date must be on or after the start date" }),
});
