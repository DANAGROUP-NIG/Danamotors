import { z } from "zod";

const APPOINTMENT_STATUSES = [
  "Pending",
  "Checked In",
  "Inspection",
  "Awaiting Approval",
  "In Repair",
  "Quality Check",
  "Ready",
  "Completed",
  "Cancelled",
] as const;

export const createAppointmentSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  vehicleId: z.string().min(1, "Vehicle is required"),
  branchName: z.string().min(1, "Branch is required"),
  serviceId: z.string().min(1, "Service is required"),
  scheduledAt: z.string().min(1, "Scheduled date is required"),
  durationMins: z.coerce.number().int().positive().optional(),
  notes: z.string().optional(),
});

export const updateAppointmentSchema = z.object({
  scheduledAt: z.string().optional(),
  durationMins: z.coerce.number().int().positive().optional(),
  notes: z.string().optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
});

export type CreateAppointmentFormValues = z.infer<
  typeof createAppointmentSchema
>;
export type UpdateAppointmentFormValues = z.infer<
  typeof updateAppointmentSchema
>;
