import { z } from "zod";
import { CampaignStatus, CampaignType, CampaignVehicleStatus, ContactChannel, ContactOutcome, JobCardLineKind } from "@prisma/client";
import { NOT_ATTENDED_REASONS, type NotAttendedReason } from "./campaign.logic";

const uuid = (label: string) => z.string().uuid(`Invalid ${label}`);
const year = z.number().int().min(1980).max(2100);

const modelsField = z
  .array(
    z.object({
      vehicleModelId: uuid("vehicle model"),
      yearFrom: year.nullable().optional(),
      yearTo: year.nullable().optional(),
    }),
  )
  .max(100);

const coveredItemsField = z
  .array(
    z.object({
      kind: z.nativeEnum(JobCardLineKind),
      partNumber: z.string().trim().max(40).nullable().optional(),
      operationCode: z.string().trim().max(30).nullable().optional(),
      description: z.string().trim().min(1, "Describe the covered item").max(200),
      maxQuantity: z.number().positive().max(10_000).nullable().optional(),
    }),
  )
  .max(200);

const campaignFields = {
  code: z
    .string()
    .trim()
    .min(2, "Campaign code is required")
    .max(30)
    // Manufacturer bulletin numbers can contain a space (e.g. "Sorento XM11-15").
    .regex(/^[A-Za-z0-9][A-Za-z0-9 \-_/]*$/, "Use letters, digits, spaces, dashes, underscores and slashes"),
  title: z.string().trim().min(3, "Title is required").max(150),
  type: z.nativeEnum(CampaignType),
  description: z.string().trim().max(2000).nullable().optional(),
  defectDescription: z.string().trim().max(2000).nullable().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  bulletinDate: z.coerce.date().nullable().optional(),
  jobCardText: z.string().trim().max(100, "Keep the job card text to 100 characters").nullable().optional(),
  printOnJobCard: z.boolean().optional(),
  labourCovered: z.boolean().optional(),
  partsCovered: z.boolean().optional(),
  models: modelsField.optional(),
  coveredItems: coveredItemsField.optional(),
};

export const campaignIdSchema = z.object({ params: z.object({ id: uuid("campaign ID") }) });

export const listCampaignsSchema = z.object({
  query: z.object({
    type: z.nativeEnum(CampaignType).optional(),
    status: z.nativeEnum(CampaignStatus).optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const createCampaignSchema = z.object({
  body: z.object(campaignFields).refine((b) => !b.endDate || b.endDate >= b.startDate, {
    message: "The end date must be on or after the start date",
    path: ["endDate"],
  }),
});

export const updateCampaignSchema = z.object({
  params: z.object({ id: uuid("campaign ID") }),
  body: z
    .object({
      code: campaignFields.code.optional(),
      title: campaignFields.title.optional(),
      type: campaignFields.type.optional(),
      description: campaignFields.description,
      defectDescription: campaignFields.defectDescription,
      startDate: campaignFields.startDate.optional(),
      endDate: campaignFields.endDate,
      bulletinDate: campaignFields.bulletinDate,
      jobCardText: campaignFields.jobCardText,
      printOnJobCard: campaignFields.printOnJobCard,
      labourCovered: campaignFields.labourCovered,
      partsCovered: campaignFields.partsCovered,
      models: campaignFields.models,
      coveredItems: campaignFields.coveredItems,
    })
    .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});

export const addVehiclesSchema = z.object({
  params: z.object({ id: uuid("campaign ID") }),
  body: z.union([
    z.object({
      vins: z.array(z.string().max(200)).min(1, "Paste at least one VIN").max(25_000),
      dryRun: z.boolean().optional(),
    }),
    z.object({
      criteria: z.object({
        vehicleModelIds: z.array(uuid("vehicle model")).min(1, "Choose at least one model").max(50),
        yearFrom: year.nullable().optional(),
        yearTo: year.nullable().optional(),
      }),
      dryRun: z.boolean().optional(),
    }),
  ]),
});

export const addVinRangesSchema = z.object({
  params: z.object({ id: uuid("campaign ID") }),
  body: z
    .object({
      ranges: z
        .array(z.object({ vinFrom: z.string().trim().min(1, "Enter the from VIN").max(30), vinTo: z.string().trim().min(1, "Enter the to VIN").max(30) }))
        .min(1, "Add at least one VIN range")
        .max(2_000),
      dryRun: z.boolean().optional(),
    })
    .strict(),
});

export const vinRangeParamsSchema = z.object({
  params: z.object({ id: uuid("campaign ID"), rangeId: uuid("VIN range ID") }),
});

export const printedContactsSchema = z.object({
  body: z
    .object({
      campaignVehicleIds: z.array(uuid("campaign vehicle ID")).min(1).max(5_000),
      channel: z.enum(["LETTER", "PHONE"]),
      notes: z.string().trim().max(500).nullable().optional(),
    })
    .strict(),
});

export const listCampaignVehiclesSchema = z.object({
  params: z.object({ id: uuid("campaign ID") }),
  query: z.object({
    status: z.nativeEnum(CampaignVehicleStatus).optional(),
    branchId: uuid("branch ID").optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const campaignVehicleParamsSchema = z.object({
  params: z.object({ id: uuid("campaign ID"), vehicleId: uuid("campaign vehicle ID") }),
});

export const updateCampaignVehicleSchema = z.object({
  params: z.object({ id: uuid("campaign ID"), vehicleId: uuid("campaign vehicle ID") }),
  body: z.object({
    status: z.nativeEnum(CampaignVehicleStatus),
    notes: z.string().trim().max(1000).nullable().optional(),
    jobCardId: uuid("job card ID").nullable().optional(),
  }),
});

export const bulkUpdateCampaignVehiclesSchema = z.object({
  params: z.object({ id: uuid("campaign ID") }),
  body: z.object({
    campaignVehicleIds: z.array(uuid("campaign vehicle ID")).min(1).max(500),
    status: z.nativeEnum(CampaignVehicleStatus),
    notes: z.string().trim().max(1000).nullable().optional(),
  }),
});

export const addContactSchema = z.object({
  params: z.object({ id: uuid("campaign ID"), vehicleId: uuid("campaign vehicle ID") }),
  body: z.object({
    channel: z.nativeEnum(ContactChannel),
    outcome: z.nativeEnum(ContactOutcome),
    notes: z.string().trim().max(500).nullable().optional(),
    nextFollowUpAt: z.coerce.date().nullable().optional(),
  }),
});

export const scheduleSchema = z.object({
  params: z.object({ id: uuid("campaign ID"), vehicleId: uuid("campaign vehicle ID") }),
  body: z.object({
    scheduledAt: z.coerce.date().refine((d) => d.getTime() > Date.now() - 60 * 60 * 1000, "Choose a time in the future"),
    branchId: uuid("branch ID"),
    notes: z.string().trim().max(500).nullable().optional(),
    serviceId: uuid("service ID").nullable().optional(),
  }),
});

export const campaignAttendanceSchema = z.object({
  params: z.object({ id: uuid("job card ID"), campaignId: uuid("campaign ID") }),
  body: z
    .object({
      attended: z.boolean(),
      reason: z.enum(Object.keys(NOT_ATTENDED_REASONS) as [NotAttendedReason, ...NotAttendedReason[]]).nullable().optional(),
      note: z.string().trim().max(200).nullable().optional(),
    })
    .strict()
    .refine((b) => b.attended || !!b.reason, { message: "Give the reason the campaign work was not done", path: ["reason"] })
    .refine((b) => b.attended || b.reason !== "OTHER" || !!b.note, { message: "Describe the other reason", path: ["note"] }),
});
