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

// Number inputs register with setValueAs(blankToUndefined), so an empty box is "not given", not 0.
const optionalNumber = (schema: z.ZodNumber) => schema.optional();

export function blankToUndefined(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isNaN(number) ? undefined : number;
}

/** A booking request (legacy booking request grid): complaint code, description and estimates. */
export const bookingRequestSchema = z.object({
  complaintCodeId: z.string().optional(),
  description: z.string().trim().min(1, "Describe the request").max(500),
  estimatedParts: optionalNumber(z.number().min(0, "Cannot be negative")),
  estimatedLabour: optionalNumber(z.number().min(0, "Cannot be negative")),
  estimatedOil: optionalNumber(z.number().min(0, "Cannot be negative")),
});
export type BookingRequestValue = z.infer<typeof bookingRequestSchema>;

export const createAppointmentSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  vehicleId: z.string().min(1, "Vehicle is required"),
  branchName: z.string().min(1, "Branch is required"),
  serviceId: z.string().min(1, "Service is required"),
  scheduledAt: z.string().min(1, "Scheduled date is required"),
  durationMins: z.coerce.number().int().positive().optional(),
  notes: z.string().optional(),
  serviceTypeId: z.string().optional(),
  mileage: optionalNumber(z.number().int("Whole kilometres only").min(0, "Cannot be negative").max(10_000_000)),
  requests: z.array(bookingRequestSchema).max(30).optional(),
});

export const updateAppointmentSchema = z.object({
  scheduledAt: z.string().optional(),
  durationMins: z.coerce.number().int().positive().optional(),
  notes: z.string().optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  serviceTypeId: z.string().optional(),
  requests: z.array(bookingRequestSchema).max(30).optional(),
});

export type CreateAppointmentFormValues = z.infer<
  typeof createAppointmentSchema
>;
export type UpdateAppointmentFormValues = z.infer<
  typeof updateAppointmentSchema
>;
