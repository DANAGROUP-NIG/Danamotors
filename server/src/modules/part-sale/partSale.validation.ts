import { z } from "zod";
import { CustomerOrderStatus, TransportMode } from "@prisma/client";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const quantity = z.number().int("Quantity must be a whole number").positive("Quantity must be above zero");

export const idParamSchema = z.object({ params: z.object({ id: uuid("ID") }) });

export const customerSearchSchema = z.object({
  query: z.object({ search: z.string().trim().min(1).max(60) }),
});

export const partSearchSchema = z.object({
  query: z.object({ search: z.string().trim().min(2).max(50), branchId: uuid("branch ID") }),
});

// ── Customer purchase orders ────────────────────────────────────────────────

export const createOrderSchema = z.object({
  body: z.object({
    branchId: uuid("selling branch ID"),
    customerId: uuid("customer ID"),
    customerRefNo: optionalText(60),
    customerRefDate: z.coerce.date().optional(),
    validTill: z.coerce.date().optional(),
    remarks: optionalText(500),
    // Pick available stock straight away (legacy HHDC CPO download).
    pick: z.boolean().optional(),
    lines: z
      .array(z.object({ partId: uuid("part ID"), quantity }))
      .min(1, "Add at least one part")
      .max(500, "An order can have at most 500 lines")
      .refine((lines) => new Set(lines.map((l) => l.partId)).size === lines.length, "Each part can appear only once"),
  }),
});

export const listOrdersSchema = z.object({
  query: z.object({
    status: z.nativeEnum(CustomerOrderStatus).optional(),
    customerId: uuid("customer ID").optional(),
    billable: z.enum(["true", "false"]).optional(),
    search: z.string().trim().max(50).optional(),
  }),
});

export const pickOrderSchema = z.object({
  params: z.object({ id: uuid("CPO ID") }),
  body: z
    .object({
      lines: z.array(z.object({ lineId: uuid("CPO line ID"), quantity: z.number().int().nonnegative() })).optional(),
    })
    .default({}),
});

export const cancelSchema = z.object({
  params: z.object({ id: uuid("ID") }),
  body: z.object({ remark: z.string().trim().min(1, "A cancellation remark is required").max(500) }),
});

// ── Counter sales ───────────────────────────────────────────────────────────

export const createCounterSaleSchema = z.object({
  body: z
    .object({
      branchId: uuid("selling branch ID"),
      customerId: uuid("customer ID"),
      cashDiscountPercent: z.number().min(0).max(100).optional(),
      cashDiscountAmount: z.number().nonnegative().optional(),
      salesExecutiveId: uuid("sales executive ID").optional(),
      transportMode: z.nativeEnum(TransportMode).optional(),
      transporter: optionalText(100),
      grNumber: optionalText(40),
      grDate: z.coerce.date().optional(),
      numberOfCases: z.number().int().nonnegative().optional(),
      notes: optionalText(500),
      lines: z
        .array(z.object({ orderLineId: uuid("CPO line ID"), quantity }))
        .min(1, "Select at least one order line to bill")
        .max(500)
        .refine((lines) => new Set(lines.map((l) => l.orderLineId)).size === lines.length, "Each order line can appear only once"),
    })
    .refine((b) => b.cashDiscountPercent === undefined || b.cashDiscountAmount === undefined, {
      message: "Enter the cash discount as a percentage or an amount, not both",
      path: ["cashDiscountAmount"],
    }),
});

export const listCounterSalesSchema = z.object({
  query: z.object({
    customerId: uuid("customer ID").optional(),
    search: z.string().trim().max(50).optional(),
  }),
});

// ── Sale returns ────────────────────────────────────────────────────────────

export const createReturnSchema = z.object({
  params: z.object({ id: uuid("counter sale ID") }),
  body: z.object({
    reason: optionalText(500),
    lines: z
      .array(z.object({ invoiceLineId: uuid("bill line ID"), quantity }))
      .min(1, "Select at least one line to return")
      .refine((lines) => new Set(lines.map((l) => l.invoiceLineId)).size === lines.length, "Each bill line can appear only once"),
  }),
});
