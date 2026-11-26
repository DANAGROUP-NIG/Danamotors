import { z } from "zod";
import { MRN_TAX_FORM_CODES } from "./vendorReceipt.logic";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);
const optionalText = (max: number) => z.string().trim().max(max).optional();

const taxForm = z.enum(MRN_TAX_FORM_CODES, { errorMap: () => ({ message: `Tax form must be one of ${MRN_TAX_FORM_CODES.join(", ")}` }) });
const conversionRate = z.number().finite().positive("The conversion rate must be above zero").max(100000);

const receiptLine = z
  .object({
    partId: uuid("part ID"),
    quantity: z.number().int("Quantity must be a whole number").positive("Quantity must be above zero"),
    // Price on the vendor invoice, in the invoice currency (naira unless a conversion rate is given).
    unitPrice: z.number().finite().positive("Unit price must be greater than zero"),
    remarks: optionalText(200),
  })
  .strict();

const receiptLines = z.array(receiptLine).min(1, "Add at least one part to the receipt").max(500, "A receipt can have at most 500 lines");

export const createVendorReceiptSchema = z.object({
  body: z
    .object({
      receivingBranchId: uuid("receiving branch ID"),
      vendorId: uuid("vendor ID"),
      invoiceNumber: z.string().trim().min(1, "Vendor invoice number is required").max(40),
      invoiceDate: z.coerce.date({ errorMap: () => ({ message: "Vendor invoice date is required" }) }),
      receiptDate: z.coerce.date().optional(),
      taxForm: taxForm.optional(),
      conversionRate: conversionRate.optional(),
      duplicateReason: optionalText(300),
      remarks: optionalText(500),
      lines: receiptLines,
    })
    .strict(),
});

export const editVendorReceiptSchema = z.object({
  params: z.object({ id: uuid("ID") }),
  body: z
    .object({
      reason: z.string().trim().min(3, "Give a reason for the change").max(300),
      invoiceNumber: z.string().trim().min(1).max(40).optional(),
      invoiceDate: z.coerce.date().optional(),
      taxForm: taxForm.optional(),
      conversionRate: conversionRate.optional(),
      remarks: z.string().trim().max(500).optional(),
      lines: receiptLines.optional(),
    })
    .strict(),
});

export const createVendorReturnSchema = z.object({
  params: z.object({ id: uuid("MRN ID") }),
  body: z
    .object({
      vendorId: uuid("vendor ID").optional(),
      returnDate: z.coerce.date().optional(),
      fullReturn: z.boolean().optional(),
      remarks: optionalText(500),
      lines: z
        .array(z.object({ mrnLineId: uuid("MRN line ID"), quantity: z.number().int("Quantity must be a whole number").nonnegative() }).strict())
        .max(500)
        .optional(),
    })
    .strict()
    .refine((b) => b.fullReturn || (b.lines ?? []).some((l) => l.quantity > 0), { message: "Enter a quantity to return, or choose Full return" }),
});

export const listVendorReturnsSchema = z.object({
  query: z.object({ search: z.string().trim().max(50).optional(), branchId: z.string().uuid().optional() }),
});

export const branchSettingsSchema = z.object({ query: z.object({ branchId: uuid("branch ID") }) });

export const listVendorReceiptsSchema = z.object({
  query: z.object({ search: z.string().trim().max(50).optional(), branchId: z.string().uuid().optional() }),
});

export const vendorSearchSchema = z.object({
  query: z.object({ search: z.string().trim().max(50).optional() }),
});

export const receiptPartSearchSchema = z.object({
  query: z.object({
    branchId: uuid("branch ID"),
    search: z.string().trim().min(2, "Type at least 2 characters").max(50),
  }),
});

export const idParamSchema = z.object({ params: z.object({ id: uuid("ID") }) });
