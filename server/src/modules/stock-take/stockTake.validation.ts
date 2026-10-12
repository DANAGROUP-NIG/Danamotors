import { z } from "zod";
import { StockAuditLevel, StockTakeStatus, StockTakeType } from "@prisma/client";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const count = z.number().int("Quantities must be whole numbers").nonnegative("Quantities cannot be negative");
const basis = z.enum(["PART", "BIN"]);

export const idParamSchema = z.object({ params: z.object({ id: uuid("stock taking ID") }) });
const sheetParams = z.object({ id: uuid("stock taking ID"), sheetId: uuid("sheet ID") });
const lineParams = z.object({ id: uuid("stock taking ID"), lineId: uuid("line ID") });

export const branchQuerySchema = z.object({ query: z.object({ branchId: uuid("branch ID") }) });

export const partSearchSchema = z.object({
  query: z.object({ search: z.string().trim().min(2).max(50), branchId: uuid("branch ID") }),
});

const selection = z
  .object({
    basis: basis.optional(),
    from: optionalText(40),
    to: optionalText(40),
    partFlag: optionalText(2),
    category: optionalText(60),
    priceCategoryCode: optionalText(10),
    dealerRateFrom: z.number().nonnegative().optional(),
    dealerRateTo: z.number().nonnegative().optional(),
    onlyWithStock: z.boolean().optional(),
    topConsumed: z
      .object({
        count: z.number().int().positive("Enter how many consumed parts to take"),
        months: z.number().int().min(1).max(12, "Months cannot be greater than 12"),
        includeStn: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((s) => s.dealerRateFrom == null || s.dealerRateTo == null || s.dealerRateFrom <= s.dealerRateTo, {
    message: "The dealer rate 'to' cannot be less than 'from'",
    path: ["dealerRateTo"],
  });

/** Physical counts (annual, perpetual) or stock audits; each has its own permissions. */
const kind = z.enum(["COUNT", "AUDIT"]);

export const previewSchema = z.object({
  body: z.object({ branchId: uuid("branch ID"), selection, kind: kind.optional() }),
});

export const createStockTakeSchema = z.object({
  body: z
    .object({
      branchId: uuid("branch ID"),
      type: z.nativeEnum(StockTakeType),
      remarks: optionalText(500),
      auditLevel: z.nativeEnum(StockAuditLevel).optional(),
      auditors: optionalText(200),
      selection,
      excludePartIds: z.array(uuid("part ID")).max(100_000).optional(),
    })
    .refine((b) => b.type !== StockTakeType.AUDIT || b.auditLevel, { message: "Select the audit type", path: ["auditLevel"] })
    .refine((b) => b.type !== StockTakeType.AUDIT || b.auditors, { message: "Enter the auditor(s)", path: ["auditors"] })
    .refine((b) => b.type === StockTakeType.AUDIT || (!b.auditLevel && !b.auditors), {
      message: "Audit type and auditors apply to stock audits only",
      path: ["auditLevel"],
    }),
});

export const listStockTakesSchema = z.object({
  query: z.object({
    kind: kind.optional(),
    status: z.nativeEnum(StockTakeStatus).optional(),
    type: z.nativeEnum(StockTakeType).optional(),
    search: z.string().trim().max(50).optional(),
  }),
});

export const listLinesSchema = z.object({
  params: z.object({ id: uuid("stock taking ID") }),
  query: z.object({
    search: z.string().trim().max(50).optional(),
    filter: z.enum(["ALL", "UNCOUNTED", "DISCREPANCY", "DAMAGED", "UNKNOWN"]).optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

export const remarkSchema = z.object({
  params: z.object({ id: uuid("stock taking ID") }),
  body: z.object({ remark: z.string().trim().min(1, "A cancellation remark is required").max(500) }),
});

export const createSheetSchema = z.object({
  params: z.object({ id: uuid("stock taking ID") }),
  body: z.object({
    checkerId: uuid("checker ID").optional(),
    basis: basis.optional(),
    from: optionalText(40),
    to: optionalText(40),
    lineIds: z.array(uuid("line ID")).min(1).max(5000).optional(),
    uncountedOnly: z.boolean().optional(),
    showSystemStock: z.boolean().optional(),
  }),
});

export const sheetParamSchema = z.object({ params: sheetParams });

export const cancelSheetSchema = z.object({
  params: sheetParams,
  body: z.object({ remark: z.string().trim().min(1, "A cancellation remark is required").max(500) }),
});

const entry = z
  .object({
    partId: uuid("part ID").optional(),
    partNumber: z.string().trim().min(1).max(40).optional(),
    binLocation: optionalText(40),
    quantity: count,
    damagedQuantity: count.optional(),
    remarks: optionalText(200),
    countedAt: z.coerce.date().optional(),
  })
  .refine((e) => e.partId || e.partNumber, { message: "Each count needs a part", path: ["partNumber"] });

/** The handheld (HHDC) will post its scans here too: one entry per part per bin. */
export const uploadSheetSchema = z.object({
  params: sheetParams,
  body: z.object({
    entries: z.array(entry).max(50_000),
    uncounted: z.enum(["ZERO", "RELEASE"]),
  }),
});

export const recordCountsSchema = z.object({
  params: z.object({ id: uuid("stock taking ID") }),
  body: z.object({ entries: z.array(entry).min(1, "Enter at least one count").max(500) }),
});

export const correctLineSchema = z.object({
  params: lineParams,
  body: z.object({ countedQuantity: count, damagedQuantity: count, remarks: optionalText(200) }),
});

export const notRequiredSchema = z.object({
  params: lineParams,
  body: z.object({ notRequired: z.boolean() }),
});

export const completeSchema = z.object({
  params: z.object({ id: uuid("stock taking ID") }),
  body: z.object({ uncounted: z.enum(["ZERO", "REMOVE"]).optional() }).default({}),
});

export const updateBinsSchema = z.object({
  params: z.object({ id: uuid("stock taking ID") }),
  body: z.object({
    lines: z
      .array(z.object({ lineId: uuid("line ID"), binLocation: z.string().trim().min(1, "Enter the bin location").max(40) }))
      .min(1, "Select at least one part")
      .max(50_000)
      .refine((lines) => new Set(lines.map((l) => l.lineId)).size === lines.length, "Each part can appear only once"),
  }),
});
