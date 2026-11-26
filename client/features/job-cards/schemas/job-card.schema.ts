import { z } from "zod";

/**
 * Opening a job card: only what is needed to create it. Bay and technician are set by the
 * workshop supervisor in Diagnosis; the walk-around and the customer's signature are taken at check-in.
 */
export const createJobCardSchema = z
  .object({
    openingConsent: z.object({ accepted: z.literal(true), termsHash: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
    branchName: z.string().min(1, "Branch is required"),
    appointmentId: z.union([z.string().uuid(), z.literal("")]).optional(),
    customerId: z.string().uuid("Select a customer"),
    vehicleId: z.string().uuid("Select a vehicle"),
    serviceId: z.union([z.string().uuid(), z.literal("")]).optional(),
    serviceTypeId: z.string().uuid("Select a service type"),
    serviceAdvisorId: z.string().uuid("Select the service advisor receiving the vehicle"),
    mileage: z
      .number({ invalid_type_error: "Enter the current odometer reading" })
      .int()
      .nonnegative("Enter a valid odometer reading")
      .max(2_000_000, "Check the mileage"),
    // A reading below the last recorded one needs an audited odometer replacement.
    odometerReplaced: z.boolean().optional(),
    odometerReplacedReason: z.string().trim().max(300).optional(),
    promisedDate: z.string().date("Select a valid promised date"),
    promisedTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Select a promised time"),
    complaints: z
      .array(
        z.object({
          description: z
            .string()
            .trim()
            .min(1, "Enter the customer request")
            .max(2000),
          complaintCodeId: z.string().optional(),
          // Legacy text code; set by the server from the defect code when one is picked.
          defectCode: z.string().trim().max(50).optional(),
          spare: z.number().min(0).max(1e12).multipleOf(0.01),
          oil: z.number().min(0).max(1e12).multipleOf(0.01),
          labour: z.number().min(0).max(1e12).multipleOf(0.01),
        }),
      )
      .min(1, "Add at least one customer request")
      .max(100),
    // From a booking; the server copies the booking's own value.
    acFitted: z.boolean().optional(),
    isRepeat: z.boolean().optional(),
    previousJobId: z.string().optional(),
    repeatReason: z.string().trim().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.appointmentId && !v.openingConsent) ctx.addIssue({ code: 'custom', path: ['openingConsent'], message: 'Review and accept the job opening terms first' });
    const promised = new Date(`${v.promisedDate}T${v.promisedTime}`);
    if (!Number.isFinite(promised.getTime()) || promised <= new Date())
      ctx.addIssue({
        code: "custom",
        path: ["promisedTime"],
        message: "Promised delivery must be in the future",
      });
    // The reason is recorded at review; the opening note (repeatReason) is optional.
    if (v.isRepeat && !v.previousJobId)
      ctx.addIssue({ code: "custom", path: ["previousJobId"], message: "Choose the job this visit repeats" });
    if (v.odometerReplaced && !v.odometerReplacedReason?.trim())
      ctx.addIssue({
        code: "custom",
        path: ["odometerReplacedReason"],
        message: "Give a reason for the odometer replacement",
      });
  });

export type CreateJobCardFormValues = z.infer<typeof createJobCardSchema>;
export type CreateJobCardFormInput = z.input<typeof createJobCardSchema>;
