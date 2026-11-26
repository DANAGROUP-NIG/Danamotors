import { z } from "zod";
import { lagosDateTime, mileageProblem } from "../lib/check-in.logic";

/** Check-in Details. Messages match the opening form and the server, naming the field and the fix. */
export const checkInDetailsSchema = z
  .object({
    vehicleId: z.string().optional(),
    customerId: z.string().uuid("Choose who pays the bill"),
    mileage: z
      .number({ invalid_type_error: "Enter the current mileage", required_error: "Enter the current mileage" })
      .int("Enter the mileage as a whole number of kilometres")
      .nonnegative("Mileage cannot be negative")
      .max(2_000_000, "Check the mileage. It is higher than 2,000,000 km"),
    odometerReplaced: z.boolean().optional(),
    odometerReplacedReason: z.string().trim().max(300, "Keep the reason to 300 characters").optional(),
    serviceTypeId: z.string().uuid("Choose the service type"),
    promisedDate: z.string().date("Choose the promised delivery date"),
    promisedTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose the promised delivery time"),
    complaints: z
      .array(
        z.object({
          description: z.string().trim().min(1, "Enter the customer request").max(2000, "Keep each request to 2,000 characters"),
          complaintCodeId: z.string().optional(),
          spare: z.number().min(0).max(1e12).multipleOf(0.01),
          oil: z.number().min(0).max(1e12).multipleOf(0.01),
          labour: z.number().min(0).max(1e12).multipleOf(0.01),
        }),
      )
      .min(1, "Add at least one customer request")
      .max(100, "A job can have up to 100 customer requests"),
    instructionsToTechnician: z.string().max(2000, "Keep the instructions to 2,000 characters").optional(),
    /** The reading before this visit; not sent. */
    previousMileage: z.number().nullable().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.odometerReplaced && !values.odometerReplacedReason?.trim())
      ctx.addIssue({ code: "custom", path: ["odometerReplacedReason"], message: "Give a reason for the odometer replacement" });
    const mileage = mileageProblem(values.mileage, values.previousMileage, values.odometerReplaced);
    if (mileage) ctx.addIssue({ code: "custom", path: ["mileage"], message: mileage });
    const promised = new Date(lagosDateTime(values.promisedDate, values.promisedTime));
    if (Number.isFinite(promised.getTime()) && promised <= new Date())
      ctx.addIssue({ code: "custom", path: ["promisedTime"], message: "Promised delivery must be in the future" });
  });

export type CheckInDetailsValues = z.infer<typeof checkInDetailsSchema>;
