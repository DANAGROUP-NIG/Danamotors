import { z } from "zod";
import { HandheldDocumentStatus, HandheldDocumentType, HandheldShortReason } from "@prisma/client";
import { countEntrySchema } from "../stock-take/stockTake.validation";
import { printerSchema } from "../labels/labels.validation";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const count = z.number().int("Quantities must be whole numbers").nonnegative("Quantities cannot be below zero");

export const idParamSchema = z.object({ params: z.object({ id: uuid("ID") }) });

export const listSourcesSchema = z.object({
  query: z.object({ type: z.nativeEnum(HandheldDocumentType), branchId: uuid("branch ID").optional() }),
});

export const listPickersSchema = z.object({ query: z.object({ branchId: uuid("branch ID").optional() }) });

export const listDocumentsSchema = z.object({
  query: z.object({
    type: z.nativeEnum(HandheldDocumentType).optional(),
    status: z.nativeEnum(HandheldDocumentStatus).optional(),
    branchId: uuid("branch ID").optional(),
    sourceId: uuid("source ID").optional(),
    indentId: uuid("indent ID").optional(),
    stockTakeId: uuid("stock taking ID").optional(),
  }),
});

export const createDocumentSchema = z.object({
  body: z
    .object({
      type: z.nativeEnum(HandheldDocumentType),
      sourceId: uuid("source ID"),
      // Documents: the picker (employee). Count sheets: the checker (user), if it changes.
      pickerId: uuid("picker ID").optional(),
      checkerId: uuid("checker ID").optional(),
      // IT tool only: HHDC Link writes it to the device itself.
      manual: z.boolean().optional(),
    })
    .refine((b) => b.type === HandheldDocumentType.COUNT_SHEET || b.pickerId, { message: "Choose the picker", path: ["pickerId"] }),
});

// The device result of a picking or MIT document, as the station or HHDC Link reads it.
const documentResult = z.object({
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
});

export const uploadDocumentSchema = z.object({
  params: z.object({ id: uuid("ID") }),
  body: documentResult.extend({
    // Picking: reason given to lines the picker never saved (counted as not picked).
    unreportedReason: z.nativeEnum(HandheldShortReason).optional(),
  }),
});

export const postDocumentSchema = z.object({
  params: z.object({ id: uuid("ID") }),
  body: z.object({
    unreportedReason: z.nativeEnum(HandheldShortReason).optional(),
    uncounted: z.enum(["ZERO", "RELEASE"]).optional(),
  }),
});

export const branchQuerySchema = z.object({ query: z.object({ branchId: uuid("branch ID").optional() }) });

// ── Station admin (handheld:stations) ──

const pcName = z.string().trim().min(1, "Enter the PC name").max(40).regex(/^[A-Za-z0-9._ -]+$/, "Use letters, digits, dot, dash or space");

export const createStationSchema = z.object({ body: z.object({ branchId: uuid("branch ID"), name: pcName }) });

export const renameDeviceSchema = z.object({ params: z.object({ id: uuid("ID") }), body: z.object({ name: pcName }) });

// ── Station protocol ──

const deviceId = uuid("handheld ID");
const shortText = (max: number) => z.string().trim().max(max).optional();

export const heartbeatSchema = z.object({
  body: z.object({
    linkVersion: shortText(40),
    error: shortText(500),
    // The USB label printer; null = none attached, absent = an HHDC Link without printing (left as it was).
    printer: printerSchema.nullable().optional(),
    docked: z
      .object({
        deviceId: deviceId.optional(),
        appVersion: shortText(40),
        appStatus: z.enum(["OK", "UPDATED", "INSTALL_FAILED", "MISSING"]).optional(),
        appError: shortText(500),
        files: z
          // Any id: files written by test or older tools are reported too, and kept (KEEP).
          .array(z.object({ kind: z.enum(["DOC", "SHEET"]), id: z.string().trim().min(1).max(64), started: z.boolean(), finished: z.boolean() }))
          .max(200)
          .optional(),
      })
      .nullable()
      .optional(),
  }),
});

export const claimSchema = z.object({ body: z.object({ deviceId }) });

export const confirmSchema = z.object({ params: z.object({ id: uuid("ID") }), body: z.object({ deviceId }) });

export const releaseSchema = z.object({ params: z.object({ id: uuid("ID") }), body: z.object({ reason: z.string().trim().min(1).max(500) }) });

export const resultSchema = z.object({
  body: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("DOC"), deviceId, id: uuid("job ID"), result: documentResult }),
    z.object({ kind: z.literal("SHEET"), deviceId, id: uuid("sheet ID"), result: z.object({ entries: z.array(countEntrySchema).max(50_000) }) }),
  ]),
});

export const clearedSchema = z.object({
  params: z.object({ deviceId }),
  body: z.object({ removed: z.array(uuid("job ID")).max(200), kept: z.array(uuid("job ID")).max(200) }),
});

export const cancelDocumentSchema = z.object({
  params: z.object({ id: uuid("ID") }),
  body: z.object({ remark: z.string().trim().min(1, "A cancellation remark is required").max(500) }),
});
