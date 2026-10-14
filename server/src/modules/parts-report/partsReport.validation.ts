import { z } from "zod";
import { ageLimitsSchema } from "../finance/party-report.validation";

const day = z.string().date("Use a YYYY-MM-DD date");
const uuid = (label: string) => z.string().uuid(`Invalid ${label}`).optional();
const flag = z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true"));
const mileageLimitsSchema = z
  .array(z.number().int().min(1).max(2_000_000))
  .length(5)
  .refine((v) => v.every((n, i) => i === 0 || n > v[i - 1]), "Enter five increasing mileage limits");

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
      partType: z.enum(["S", "O", "A"]).optional(),
      partFlag: z.string().trim().max(2).optional(),
      priceCategory: z.string().trim().max(5).optional(),
      search: z.string().trim().max(40).optional(),
      status: z.enum(["PENDING", "CANCELLED", "EXECUTED"]).optional(),
      option: z.string().trim().max(20).optional(),
      fullyExecuted: flag,
      includeReturns: flag,
      includeCancelled: flag,
      includeAlternates: flag,
      onlyTransacted: flag,
      summary: flag,
      countType: z.enum(["ANNUAL", "PERPETUAL", "INTERNAL", "AUDIT_HEAD", "VISITING_MANAGEMENT"]).optional(),
      onlyRemarks: flag,
      includeNotRequired: flag,
      full: flag,
      topN: z.coerce.number().int().min(1, "List at least 1 part").max(1000).optional(),
      days: z.coerce.number().int().min(1, "Enter at least 1 day").max(3650).optional(),
      ageLimits: z
        .string()
        .transform((v) => v.split(",").map(Number))
        .pipe(ageLimitsSchema)
        .optional(),
      mileageLimits: z
        .string()
        .transform((v) => v.split(",").map(Number))
        .pipe(mileageLimitsSchema)
        .optional(),
    })
    .refine((q) => q.from <= q.to, { path: ["to"], message: "The end date must be on or after the start date" }),
});
