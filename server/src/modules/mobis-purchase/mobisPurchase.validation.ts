import { z } from "zod";
import { MitStatus, TransportMode } from "@prisma/client";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);
const optionalText = (max: number) => z.string().trim().max(max).optional();

// Legacy MIT received modes are air, ship and road.
const receivedMode = z.enum([TransportMode.AIR, TransportMode.SEA, TransportMode.ROAD], {
  errorMap: () => ({ message: "Received mode must be AIR, SEA (ship) or ROAD" }),
});

export const importMitSchema = z.object({
  body: z.object({
    destinationBranchId: uuid("receiving branch ID"),
    invoiceNumber: z.string().trim().min(1, "Invoice number is required").max(40),
    invoiceDate: z.coerce.date().optional(),
    conversionRate: z.number().positive("Conversion rate must be greater than zero").optional(),
    physicalReceiptDate: z.coerce.date().optional(),
    receivedMode,
    remarks: optionalText(500),
    sourceFileName: optionalText(200),
    createMissingParts: z.boolean().optional(),
    lines: z
      .array(
        z.object({
          orderNumber: optionalText(40),
          lineNumber: z.union([z.number().int(), z.string().trim().max(10)]).optional(),
          partNumber: z.string().trim().min(1, "Part number is required").max(40),
          partName: optionalText(200),
          quantity: z.number().int("Quantity must be a whole number").positive("Quantity must be above zero"),
          unitPrice: z.number().nonnegative("Unit price must be zero or more"),
          amount: z.number().nonnegative().optional(),
          caseNumber: optionalText(40),
          intRef: optionalText(40),
          weight: z.number().nonnegative().optional(),
          hsCode: optionalText(20),
        }),
      )
      .min(1, "The invoice has no lines")
      .max(5000, "An invoice can have at most 5000 lines"),
  }),
});

export const matchPartsSchema = z.object({
  body: z.object({
    partNumbers: z.array(z.string().trim().max(40)).min(1).max(5000),
  }),
});

export const createMrnSchema = z.object({
  params: z.object({ id: uuid("MIT ID") }),
  body: z
    .object({
      taxForm: optionalText(2),
      receiptDate: z.coerce.date().optional(),
      remarks: optionalText(500),
      lines: z
        .array(
          z.object({
            mitLineId: uuid("MIT line ID"),
            receivedQuantity: z.number().int().nonnegative(),
            damagedQuantity: z.number().int().nonnegative().optional(),
            remarks: optionalText(200),
          }),
        )
        .optional(),
    })
    .default({}),
});

export const cancelMitSchema = z.object({
  params: z.object({ id: uuid("MIT ID") }),
  body: z.object({ reason: optionalText(500) }).default({}),
});

export const idParamSchema = z.object({ params: z.object({ id: uuid("ID") }) });

export const listMobisMitsSchema = z.object({
  query: z.object({
    status: z.nativeEnum(MitStatus).optional(),
    search: z.string().trim().max(50).optional(),
  }),
});
