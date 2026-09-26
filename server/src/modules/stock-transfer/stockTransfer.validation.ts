import { z } from "zod";
import { IndentStatus, MitSourceType, MitStatus, PickingListStatus, StnStatus, TransportMode } from "@prisma/client";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);
const qty = z.number().int("Quantity must be a whole number");
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const idParamSchema = z.object({
  params: z.object({ id: uuid("ID") }),
});

const indentLineSchema = z
  .object({
    partId: uuid("part ID"),
    partFlag: optionalText(2),
    urgentQuantity: qty.nonnegative().optional(),
    stockQuantity: qty.nonnegative().optional(),
    jobCardId: uuid("job card ID").optional(),
    jobNumber: optionalText(20),
    jobDate: z.coerce.date().optional(),
    vin: optionalText(20),
    registrationNumber: optionalText(15),
    vehicleModel: optionalText(40),
    remarks: optionalText(200),
  })
  .refine((line) => (line.urgentQuantity ?? 0) + (line.stockQuantity ?? 0) > 0, {
    message: "Enter an urgent or a stock quantity greater than zero",
    path: ["urgentQuantity"],
  });

export const createIndentSchema = z.object({
  body: z.object({
    requestingBranchId: uuid("requesting branch ID"),
    sourceBranchId: uuid("supplying branch ID"),
    remarks: optionalText(500),
    authorisedBy: optionalText(60),
    authorisedAt: z.coerce.date().optional(),
    submit: z.boolean().optional(),
    lines: z.array(indentLineSchema).min(1, "Add at least one part").max(200),
  }),
});

export const approveIndentSchema = z.object({
  params: z.object({ id: uuid("indent ID") }),
  body: z
    .object({
      remarks: optionalText(500),
      lines: z
        .array(
          z.object({
            lineId: uuid("line ID"),
            approvedQuantity: qty.nonnegative().optional(),
            supplyPartId: uuid("supply part ID").optional(),
          }),
        )
        .optional(),
    })
    .default({}),
});

export const pickIndentSchema = z.object({
  params: z.object({ id: uuid("indent ID") }),
  body: z
    .object({
      lines: z
        .array(z.object({ lineId: uuid("line ID"), supplyPartId: uuid("supply part ID").optional() }))
        .optional(),
    })
    .default({}),
});

export const rejectIndentSchema = z.object({
  params: z.object({ id: uuid("indent ID") }),
  body: z.object({ reason: z.string().trim().min(3, "Give a reason for rejecting").max(500) }),
});

export const cancelIndentSchema = z.object({
  params: z.object({ id: uuid("indent ID") }),
  body: z.object({ reason: optionalText(500) }).default({}),
});

export const dispatchIndentSchema = z.object({
  params: z.object({ id: uuid("indent ID") }),
  body: z
    .object({
      taxForm: optionalText(2),
      transportMode: z.nativeEnum(TransportMode).optional(),
      remarks: optionalText(500),
      waybillNumber: optionalText(30),
      courierName: optionalText(60),
      consignmentWeight: z.number().nonnegative().optional(),
      packerName: optionalText(60),
      lines: z
        .array(z.object({ pickingLineId: uuid("picking line ID"), quantity: qty.nonnegative() }))
        .optional(),
      cases: z
        .array(
          z.object({
            packerName: optionalText(60),
            weight: z.number().nonnegative().optional(),
            lines: z
              .array(z.object({ pickingLineId: uuid("picking line ID"), quantity: qty.positive() }))
              .min(1, "A case must contain at least one part"),
          }),
        )
        .max(500)
        .optional(),
    })
    .default({}),
});

export const receiveIndentSchema = z.object({
  params: z.object({ id: uuid("indent ID") }),
  body: z
    .object({
      remarks: optionalText(500),
      taxForm: optionalText(2),
      closeShort: z.boolean().optional(),
      lines: z
        .array(
          z.object({
            mitLineId: uuid("transit line ID"),
            receivedQuantity: qty.nonnegative(),
            damagedQuantity: qty.nonnegative().optional(),
            remarks: optionalText(200),
          }),
        )
        .optional(),
    })
    .default({}),
});

const pagination = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};

export const listIndentsSchema = z.object({
  query: z.object({
    status: z.nativeEnum(IndentStatus).optional(),
    requestingBranchId: uuid("requesting branch ID").optional(),
    sourceBranchId: uuid("supplying branch ID").optional(),
    search: z.string().trim().max(50).optional(),
    ...pagination,
  }),
});

export const partLookupSchema = z.object({
  query: z
    .object({
      partId: uuid("part ID").optional(),
      partNumber: z.string().trim().max(40).optional(),
      requestingBranchId: uuid("requesting branch ID").optional(),
      sourceBranchId: uuid("supplying branch ID").optional(),
    })
    .refine((q) => q.partId || q.partNumber, { message: "Give a partId or a partNumber", path: ["partId"] }),
});

export const partSearchSchema = z.object({
  query: z.object({
    search: z.string().trim().min(2, "Type at least 2 characters").max(40),
    requestingBranchId: uuid("requesting branch ID").optional(),
    sourceBranchId: uuid("supplying branch ID").optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

export const listPickingListsSchema = z.object({
  query: z.object({ status: z.nativeEnum(PickingListStatus).optional() }),
});

export const listStnsSchema = z.object({
  query: z.object({ status: z.nativeEnum(StnStatus).optional() }),
});

export const listMitsSchema = z.object({
  query: z.object({
    status: z.nativeEnum(MitStatus).optional(),
    sourceType: z.nativeEnum(MitSourceType).optional(),
  }),
});

export const emptyQuerySchema = z.object({ query: z.object({}).passthrough() });
