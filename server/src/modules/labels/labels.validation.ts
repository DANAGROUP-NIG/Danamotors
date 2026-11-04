import { z } from "zod";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);

export const idParamSchema = z.object({ params: z.object({ id: uuid("ID") }) });

export const branchQuerySchema = z.object({ query: z.object({ branchId: uuid("branch ID").optional() }) });

export const searchPartsSchema = z.object({
  query: z.object({ search: z.string().trim().min(2, "Type at least 2 characters").max(60), branchId: uuid("branch ID").optional() }),
});

export const createJobSchema = z.object({
  body: z.object({
    branchId: uuid("branch ID").optional(),
    labels: z
      .array(
        z.object({
          partId: uuid("part ID"),
          copies: z.number().int("Copies must be a whole number").min(1, "At least 1 copy").max(100, "At most 100 copies of one label"),
        }),
      )
      .min(1, "Add at least one part")
      .max(200, "At most 200 parts in one print"),
  }),
});

// ── Station protocol ──

export const printerSchema = z.object({
  model: z.string().trim().min(1).max(80),
  status: z.enum(["READY", "PAUSED", "PAPER_OUT", "HEAD_OPEN", "ERROR"]),
  detail: z.string().trim().max(200).optional(),
});

export const claimPrintsSchema = z.object({ body: z.object({ printer: printerSchema }) });

export const printDoneSchema = z.object({
  params: z.object({ id: uuid("ID") }),
  body: z.object({ ok: z.boolean(), error: z.string().trim().max(500).optional() }),
});
