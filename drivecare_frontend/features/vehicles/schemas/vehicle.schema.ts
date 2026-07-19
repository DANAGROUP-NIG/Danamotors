import { z } from "zod";

export const createVehicleSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.coerce
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 1, "Enter a valid year"),
  licensePlate: z.string().min(1, "License plate is required"),
  vin: z.string().optional(),
  color: z.string().optional(),
  mileage: z.coerce.number().nonnegative().optional(),
});

export const updateVehicleSchema = createVehicleSchema
  .omit({ customerId: true })
  .partial();

export type CreateVehicleFormValues = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleFormValues = z.infer<typeof updateVehicleSchema>;
