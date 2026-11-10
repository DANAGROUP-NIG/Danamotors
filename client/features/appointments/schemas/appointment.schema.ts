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
  "No Show",
] as const;

const optionalDurationMins = z.union([
  z.literal("").transform(() => undefined),
  z.coerce.number().int().positive(),
]).optional();

export const createAppointmentSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  vehicleId: z.string().min(1, "Vehicle is required"),
  branchName: z.string().min(1, "Branch is required"),
  serviceTypeId: z.string().uuid().optional().or(z.literal("")),
  serviceId: z.string().optional(),
  scheduledAt: z.string().min(1, "Scheduled date is required"),
  durationMins: optionalDurationMins,
  notes: z.string().optional(),
});

export const updateAppointmentSchema = z.object({
  scheduledAt: z.string().optional(),
  durationMins: optionalDurationMins,
  notes: z.string().optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
});

export type CreateAppointmentFormValues = z.infer<
  typeof createAppointmentSchema
>;
export type CreateAppointmentFormInput = z.input<typeof createAppointmentSchema>;
export type UpdateAppointmentFormValues = z.infer<
  typeof updateAppointmentSchema
>;
export type UpdateAppointmentFormInput = z.input<typeof updateAppointmentSchema>;
