import { z } from "zod";

/** Empty inputs become undefined so optional numbers are simply left out. */
const optionalNumber = (label: string) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z
      .number({ invalid_type_error: `${label} must be a number` })
      .nonnegative(`${label} must be 0 or more`)
      .optional(),
  );

const optionalText = (max: number) => z.string().trim().max(max, `Max ${max} characters`).optional();

/** Mirrors the backend Part Master validation (createPartMasterSchema). */
export const partMasterSchema = z
  .object({
    partCode: z.string().trim().min(1, "Part code is required").max(50, "Part code must be 50 characters or less"),
    partNumber: z.string().trim().min(1, "Part number is required").max(40, "Max 40 characters"),
    name: z.string().trim().min(1, "Name is required").max(200, "Max 200 characters"),
    category: z.string().trim().min(1, "Category is required").max(100, "Max 100 characters"),
    uom: z.string().trim().min(1, "Unit of measure is required").max(20, "Max 20 characters"),
    taxCategory: optionalText(50),
    taxForm: optionalText(10),
    minLevel: optionalNumber("Minimum level"),
    maxLevel: optionalNumber("Maximum level"),
    reorderQty: optionalNumber("Reorder quantity"),
    unitRate: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
      z
        .number({ required_error: "Unit rate is required", invalid_type_error: "Unit rate must be a number" })
        .positive("Unit rate must be greater than zero"),
    ),
    retailRate: optionalNumber("Retail rate"),
    taxable: z.boolean(),
    partFlag: z.string().trim().min(1, "Part flag is required").max(2, "Part flag must be 1 or 2 characters"),
    priceCategoryCode: z.string().optional(),
    binLocation: optionalText(40),
    storeLocation: optionalText(40),
    partStatus: z.enum(["ACTIVE", "BLOCKED"]),
    warrantyApplicable: z.boolean(),
    warrantyRate: optionalNumber("Warranty rate"),
  })
  .refine((d) => d.minLevel == null || d.maxLevel == null || d.maxLevel >= d.minLevel, {
    message: "Maximum level must be greater than or equal to minimum level",
    path: ["maxLevel"],
  });

/** Parsed values (numbers) and raw input values (number inputs give strings). */
export type PartMasterFormValues = z.infer<typeof partMasterSchema>;
export type PartMasterFormInput = z.input<typeof partMasterSchema>;

export const alternatePartSchema = z.object({
  partNumber: z.string().trim().min(1, "Part number is required").max(40, "Max 40 characters"),
  name: z.string().trim().min(1, "Name is required").max(200, "Max 200 characters"),
  description: optionalText(500),
});

export type AlternatePartFormValues = z.infer<typeof alternatePartSchema>;
