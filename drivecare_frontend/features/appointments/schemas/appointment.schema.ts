import { z } from "zod";

export const createAppointmentSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  vehicleId: z.string().min(1, "Vehicle is required"),
  serviceType: z.string().min(1, "Service type is required"),
  scheduledAt: z.string().min(1, "Scheduled date is required"),
  notes: z.string().optional(),
});

export const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: z
    .enum([
      "booked",
      "checked_in",
      "inspection",
      "awaiting_approval",
      "in_repair",
      "quality_check",
      "ready",
      "completed",
      "cancelled",
    ])
    .optional(),
});

export type CreateAppointmentFormValues = z.infer<
  typeof createAppointmentSchema
>;
export type UpdateAppointmentFormValues = z.infer<
  typeof updateAppointmentSchema
>;
