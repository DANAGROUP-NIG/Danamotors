import { z } from "zod";

export const createVehicleSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  vin: z.string().min(1, "VIN is required"),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.coerce.number().int().optional(),
  trim: z.string().optional(),
  color: z.string().optional(),
  warrantyProvider: z.string().optional(),
  warrantyStatus: z.string().optional(),
  warrantyExpiresAt: z.string().optional(),
  ownershipStatus: z.string().optional(),
});

export const updateVehicleSchema = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.coerce.number().int().optional(),
  trim: z.string().optional(),
  color: z.string().optional(),
  warrantyProvider: z.string().optional(),
  warrantyStatus: z.string().optional(),
  warrantyExpiresAt: z.string().optional(),
  ownershipStatus: z.string().optional(),
});

export type CreateVehicleFormValues = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleFormValues = z.infer<typeof updateVehicleSchema>;
