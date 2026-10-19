import { z } from "zod";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const createVendorReceiptSchema = z.object({
  body: z
    .object({
      receivingBranchId: uuid("receiving branch ID"),
      vendorId: uuid("vendor ID"),
      invoiceNumber: z.string().trim().min(1, "Vendor invoice number is required").max(40),
      invoiceDate: z.coerce.date({ errorMap: () => ({ message: "Vendor invoice date is required" }) }),
      receiptDate: z.coerce.date().optional(),
      remarks: optionalText(500),
      lines: z
        .array(
          z
            .object({
              partId: uuid("part ID"),
              quantity: z.number().int("Quantity must be a whole number").positive("Quantity must be above zero"),
              unitCost: z.number().finite().positive("Unit cost must be greater than zero"),
              remarks: optionalText(200),
            })
            .strict(),
        )
        .min(1, "Add at least one part to the receipt")
        .max(500, "A receipt can have at most 500 lines"),
    })
    .strict(),
});

export const listVendorReceiptsSchema = z.object({
  query: z.object({ search: z.string().trim().max(50).optional() }),
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
