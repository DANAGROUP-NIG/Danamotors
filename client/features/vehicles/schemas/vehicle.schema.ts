import { z } from "zod";

const vehicleFields = z.object({
  customerId: z.string().optional(),
  vin: z.string().trim().toUpperCase().min(1, "VIN is required"),
  registrationNumber: z
    .string()
    .trim()
    .max(50, "Max 50 characters")
    .transform((v) => v.toUpperCase())
    .optional(),
  catalogueId: z.string().uuid().nullable().optional(),
  colourId: z.string().uuid().nullable().optional(),
  modelId: z.string().uuid().nullable().optional(),
  generationId: z.string().uuid().nullable().optional(),
  engineId: z.string().uuid().nullable().optional(),
  customModel: z.string().trim().max(80).nullable().optional(),
  customMake: z.string().trim().max(80).nullable().optional(),
  engineNumber: z.string().optional(), keyNumber: z.string().optional(),
  pdiDone: z.boolean().optional(), pdiDate: z.string().optional(), saleDate: z.string().optional(), sellingDealer: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().min(1900).max(2200).optional(),
  trim: z.string().optional(),
  color: z.string().optional(),
  warrantyProvider: z.string().optional(),
  warrantyStatus: z.string().optional(),
  warrantyExpiresAt: z.string().optional(),
  ownershipStatus: z.string().optional(),
});

export const vehicleProfileSchema = vehicleFields.superRefine((values, ctx) => {
  if (!values.modelId && !values.customModel?.trim() && !values.catalogueId) ctx.addIssue({ code: "custom", path: ["customModel"], message: "Select a model or add a custom model" });
});
// Existing stock vehicles remain editable; every new frontend vehicle requires a customer.
export const createVehicleSchema = vehicleProfileSchema.superRefine((values, ctx) => {
  if (!z.string().uuid().safeParse(values.customerId).success) {
    ctx.addIssue({ code: "custom", path: ["customerId"], message: "Select a customer to link this vehicle" });
  }
});
export const updateVehicleSchema = vehicleFields.omit({ vin: true, customerId: true }).partial();

export type CreateVehicleFormValues = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleFormValues = z.infer<typeof updateVehicleSchema>;
