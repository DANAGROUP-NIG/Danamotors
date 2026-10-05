import { z } from "zod";
import { JobCardLineKind, WarrantyCaseStatus, WarrantyLineRole, WarrantyOverrideType } from "@prisma/client";
import { MAX_MILEAGE } from "./warranty.logic";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional();
const nullableText = (max: number) => text(max).nullable().optional();
const mileage = z.coerce.number().int("Mileage must be a whole number").min(0).max(MAX_MILEAGE);
const money = z.number().nonnegative().max(1_000_000_000);
const positiveQty = z.number().positive("Quantity must be greater than zero").max(100_000);

export const CASE_ACTIONS = [
  "START_REVIEW",
  "SUBMIT",
  "APPROVE",
  "PARTIALLY_APPROVE",
  "REJECT",
  "RETURN",
  "RESUME",
  "SETTLE",
  "CLOSE",
] as const;

// ── Vehicle coverage ─────────────────────────────────────────────────────────

export const vehicleWarrantyQuerySchema = z.object({
  params: z.object({ id: uuid("vehicle ID") }),
  query: z.object({ mileage: mileage.optional() }),
});

export const updateVehicleWarrantySchema = z.object({
  params: z.object({ id: uuid("vehicle ID") }),
  body: z
    .object({
      vehicleModelId: uuid("vehicle model ID").nullable().optional(),
      saleDate: z.coerce.date().nullable().optional(),
      override: z
        .object({
          type: z.nativeEnum(WarrantyOverrideType),
          until: z.coerce.date().nullable().optional(),
          km: z.number().int().positive().max(MAX_MILEAGE).nullable().optional(),
          reason: text(300).min(3, "Give a reason for the extended warranty or goodwill"),
        })
        .nullable()
        .optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});

// ── Vehicle models ───────────────────────────────────────────────────────────

const modelFields = {
  code: text(20).min(1, "Code is required"),
  make: optionalText(40),
  name: text(60).min(1, "Model name is required"),
  warrantyDays: z.number().int().positive("Warranty days must be greater than zero").max(36_500).nullable().optional(),
  warrantyKm: z.number().int().positive("Warranty km must be greater than zero").max(MAX_MILEAGE).nullable().optional(),
  warrantyCovered: z.boolean().optional(),
};

export const listModelsSchema = z.object({
  query: z.object({ search: optionalText(60), includeInactive: z.enum(["true", "false"]).optional() }),
});

export const createModelSchema = z.object({ body: z.object(modelFields) });

export const updateModelSchema = z.object({
  params: z.object({ id: uuid("vehicle model ID") }),
  body: z.object({
    code: modelFields.code.optional(),
    make: modelFields.make,
    name: modelFields.name.optional(),
    warrantyDays: modelFields.warrantyDays,
    warrantyKm: modelFields.warrantyKm,
    warrantyCovered: modelFields.warrantyCovered,
    isActive: z.boolean().optional(),
  }),
});

// ── Claim codes ──────────────────────────────────────────────────────────────

const codeType = z.enum(["complaint", "defect", "position", "reject"]);

export const searchPartsSchema = z.object({
  query: z.object({
    search: text(60).min(2, "Type at least 2 characters"),
    applicableOnly: z.enum(["true", "false"]).optional(),
  }),
});

export const listCodesSchema = z.object({ query: z.object({ includeInactive: z.enum(["true", "false"]).optional() }) });

export const createCodeSchema = z.object({
  params: z.object({ type: codeType }),
  body: z.object({
    code: text(20).min(1, "Code is required"),
    description: text(200).min(1, "Description is required"),
    isActive: z.boolean().optional(),
  }),
});

export const updateCodeSchema = z.object({
  params: z.object({ type: codeType, id: uuid("code ID") }),
  body: z.object({
    code: text(20).min(1).optional(),
    description: text(200).min(1).optional(),
    isActive: z.boolean().optional(),
  }),
});

// ── Cases ────────────────────────────────────────────────────────────────────

export const caseIdSchema = z.object({ params: z.object({ id: uuid("case ID") }) });

export const listCasesSchema = z.object({
  query: z.object({
    status: z.nativeEnum(WarrantyCaseStatus).optional(),
    branchId: uuid("branch ID").optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    basedOn: z.enum(["CASE_DATE", "BILL_DATE"]).optional(),
    claimNo: z.enum(["GENERATED", "NOT_GENERATED"]).optional(),
    billing: z.enum(["BILLED", "UNBILLED"]).optional(),
    search: optionalText(80),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

export const openCaseSchema = z.object({
  body: z.object({ jobCardId: uuid("job card ID"), complaint: optionalText(1000) }),
});

export const updateCaseSchema = z.object({
  params: z.object({ id: uuid("case ID") }),
  body: z
    .object({
      complaintCodeId: uuid("complaint code").nullable().optional(),
      complaint: nullableText(1000),
      manufacturerClaimNo: nullableText(40),
      manufacturerClaimDate: z.coerce.date().nullable().optional(),
      assignedOfficerId: uuid("officer").nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});

export const addCaseLineSchema = z.object({
  params: z.object({ id: uuid("case ID") }),
  body: z
    .object({
      kind: z.nativeEnum(JobCardLineKind),
      role: z.nativeEnum(WarrantyLineRole).nullable().optional(),
      sparePartId: uuid("part").nullable().optional(),
      operationCode: nullableText(30),
      description: nullableText(200),
      defectCodeId: uuid("defect code").nullable().optional(),
      positionCodeId: uuid("position code").nullable().optional(),
      batchNo: nullableText(30),
      quantity: positiveQty,
      rate: money.nullable().optional(),
      jobCardLineId: uuid("job card line").nullable().optional(),
    })
    .refine((b) => b.kind !== "PART" || Boolean(b.sparePartId), { message: "Choose the part", path: ["sparePartId"] })
    .refine((b) => b.kind !== "PART" || Boolean(b.role), { message: "Choose causal or consequential", path: ["role"] })
    .refine((b) => b.kind !== "LABOUR" || Boolean(b.description?.trim()), { message: "Describe the labour operation", path: ["description"] })
    .refine((b) => b.kind !== "LABOUR" || b.rate != null, { message: "Enter the labour rate", path: ["rate"] }),
});

export const updateCaseLineSchema = z.object({
  params: z.object({ id: uuid("case ID"), lineId: uuid("line ID") }),
  body: z.object({
    role: z.nativeEnum(WarrantyLineRole).nullable().optional(),
    operationCode: nullableText(30),
    description: text(200).min(1).optional(),
    defectCodeId: uuid("defect code").nullable().optional(),
    positionCodeId: uuid("position code").nullable().optional(),
    batchNo: nullableText(30),
    quantity: positiveQty.optional(),
    rate: money.optional(),
  }),
});

export const caseLineParamsSchema = z.object({ params: z.object({ id: uuid("case ID"), lineId: uuid("line ID") }) });

export const transitionCaseSchema = z.object({
  params: z.object({ id: uuid("case ID") }),
  body: z.object({
    action: z.enum(CASE_ACTIONS),
    remarks: nullableText(1000),
    rejectReasonId: uuid("reject reason").nullable().optional(),
    settlementRef: nullableText(60),
    settledAmount: money.nullable().optional(),
    settledAt: z.coerce.date().nullable().optional(),
    decisionAt: z.coerce.date().nullable().optional(),
    manufacturerClaimNo: nullableText(40),
    manufacturerClaimDate: z.coerce.date().nullable().optional(),
    lineApprovals: z
      .array(z.object({ lineId: uuid("line ID"), approvalPercent: z.number().min(0).max(100) }))
      .max(500)
      .optional(),
  }),
});
