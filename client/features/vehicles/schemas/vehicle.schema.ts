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
  // Warranty policy model; the warranty starts on the sale date.
  vehicleModelId: z.string().optional(),
  ownershipStatus: z.string().optional(),
  // Legacy vehiclemaster sale, stock and fitment details. Blank inputs are sent as null to clear the value.
  colourType: z.string().nullable().optional(),
  parkedAt: z.enum(["SHOWROOM", "STOCKYARD", "SOLD"]).nullable().optional(),
  purchaseAmount: z.number().min(0).optional(),
  saleInvoiceNumber: z.string().max(50).optional(),
  saleInvoiceDate: z.string().nullable().optional(),
  saleAmount: z.number().min(0).optional(),
  wcoNumber: z.string().max(50).optional(),
  wcoDate: z.string().nullable().optional(),
  principalInvoiceNumber: z.string().max(50).optional(),
  principalInvoiceDate: z.string().nullable().optional(),
  theft: z.boolean().optional(),
  manufactureMonth: z.number().int().min(1).max(12).optional(),
  manufactureYear: z.number().int().min(1900).max(2200).optional(),
  tyres: z.array(z.object({ makeId: z.string().optional(), make: z.string().optional(), number: z.string().max(100).optional() })).optional(),
  batteryMakeId: z.string().optional(),
  batteryNumber: z.string().max(100).optional(),
});

export const vehicleProfileSchema = vehicleFields.superRefine((values, ctx) => {
  if (values.catalogueId && !values.colourId) ctx.addIssue({ code: "custom", path: ["colourId"], message: "Select a catalogue colour" });
  if (!values.modelId && !values.customModel?.trim() && !values.catalogueId) ctx.addIssue({ code: "custom", path: ["modelId"], message: "Select a model or enter a custom model" });
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
