import { z } from "zod";

export const customerIdParamSchema = z.object({
  params: z.object({
    customerId: z.string().uuid("Invalid customer ID"),
  }),
});

export const applicationIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid credit application ID"),
  }),
});

export const adjustCreditSchema = z.object({
  params: z.object({
    customerId: z.string().uuid("Invalid customer ID"),
  }),
  body: z.object({
    amount: z.number().refine((v) => v !== 0, {
      message: "Amount must be non-zero",
    }),
    description: z.string().optional(),
  }),
});

export const createCreditApplicationSchema = z.object({
  body: z.object({
    customerId: z.string().uuid("Invalid customer ID"),
    invoiceId: z.string().uuid("Invalid invoice ID"),
    amount: z.number().positive("Amount must be positive"),
    comments: z.string().optional(),
  }),
});

export const listApplicationsQuerySchema = z.object({
  query: z.object({
    status: z.string().optional(),
    branchId: z.string().uuid("Invalid branch ID").optional(),
  }),
});
