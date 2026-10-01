import { z } from "zod";

const optionalNumber = (label: string) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? undefined : Number(v)),
    z.number({ invalid_type_error: `${label} must be a number` }).nonnegative(`${label} cannot be negative`).optional(),
  );

/** Mirrors server createJobCardSchema; mileage is required because the job is for a vehicle. */
export const createJobCardSchema = z
  .object({
    vehicleId: z.string().min(1, "Select the vehicle"),
    appointmentId: z.string().optional(),
    mileage: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : Number(String(v).replace(/,/g, ""))),
      z
        .number({ required_error: "Enter the current mileage", invalid_type_error: "Mileage must be a number" })
        .int("Whole kilometres only")
        .min(0, "Mileage cannot be negative")
        .max(2_000_000, "Check the mileage"),
    ),
    odometerReplaced: z.boolean(),
    odometerReplacedReason: z.string().trim().max(300).optional(),
    jobNumber: z.string().trim().min(1, "Job number is required").max(40),
    branchName: z.string().min(1, "Branch is required"),
    description: z.string().trim().min(1, "Describe the customer complaint").max(2000),
    estimatedHours: optionalNumber("Estimated hours"),
    estimatedCost: optionalNumber("Estimated cost"),
  })
  .refine((v) => !v.odometerReplaced || Boolean(v.odometerReplacedReason?.trim()), {
    message: "Give a reason for the odometer replacement",
    path: ["odometerReplacedReason"],
  });

export type CreateJobCardFormValues = z.infer<typeof createJobCardSchema>;
export type CreateJobCardFormInput = z.input<typeof createJobCardSchema>;
