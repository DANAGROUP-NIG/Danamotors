import { z } from "zod";
import { HandheldDocumentStatus, HandheldDocumentType, HandheldShortReason } from "@prisma/client";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const count = z.number().int("Quantities must be whole numbers").nonnegative("Quantities cannot be below zero");

export const idParamSchema = z.object({ params: z.object({ id: uuid("ID") }) });

export const listSourcesSchema = z.object({
  query: z.object({ type: z.nativeEnum(HandheldDocumentType), branchId: uuid("branch ID").optional() }),
});

export const listDocumentsSchema = z.object({
  query: z.object({
    type: z.nativeEnum(HandheldDocumentType).optional(),
    status: z.nativeEnum(HandheldDocumentStatus).optional(),
    branchId: uuid("branch ID").optional(),
    sourceId: uuid("source ID").optional(),
    indentId: uuid("indent ID").optional(),
  }),
});

export const createDocumentSchema = z.object({
  body: z.object({
    type: z.nativeEnum(HandheldDocumentType),
    sourceId: uuid("source ID"),
    pickerId: uuid("picker ID"),
  }),
});

export const uploadDocumentSchema = z.object({
  params: z.object({ id: uuid("ID") }),
  body: z.object({
    lines: z
      .array(
        z.object({
          lineId: uuid("line ID"),
          quantity: count,
          damagedQuantity: count.optional(),
          shortReason: z.nativeEnum(HandheldShortReason).optional(),
          scannedPartNumber: optionalText(40),
          note: optionalText(200),
        }),
      )
      .max(5_000),
    extras: z
      .array(z.object({ partNumber: z.string().trim().min(1).max(40), quantity: count, damagedQuantity: count.optional(), note: optionalText(200) }))
      .max(500)
      .optional(),
    // Picking: reason given to lines the picker never saved (counted as not picked).
    unreportedReason: z.nativeEnum(HandheldShortReason).optional(),
  }),
});

export const cancelDocumentSchema = z.object({
  params: z.object({ id: uuid("ID") }),
  body: z.object({ remark: z.string().trim().min(1, "A cancellation remark is required").max(500) }),
});
