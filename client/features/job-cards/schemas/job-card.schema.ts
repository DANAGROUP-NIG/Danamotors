import { z } from "zod";

export const createJobCardSchema = z.object({
  branchName: z.string().min(1, "Branch is required"),
  appointmentId: z.union([z.string().uuid(), z.literal("")]).optional(),
  customerId: z.string().uuid("Select a customer"),
  vehicleId: z.string().uuid("Select a vehicle"),
  serviceTypeId: z.string().uuid("Select a service type"),
  bayId: z.string().uuid("Select a bay"),
  serviceAdvisorId: z.string().uuid("Select a service advisor"),
  technicianId: z.union([z.string().uuid(), z.literal("")]).optional(),
  teamId: z.union([z.string().uuid(), z.literal("")]).optional(),
  mileage: z.number({ invalid_type_error: "Enter the current odometer reading" }).int().nonnegative("Enter a valid odometer reading"),
  promisedDate: z.string().date("Select a valid promised date"),
  promisedTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Select a promised time"),
  complaints: z.array(z.object({
    description: z.string().trim().min(1, "Enter the customer request").max(2000),
    complaintCodeId: z.string().optional(),
    defectCode: z.string().trim().min(1, "Select or enter a defect code").max(50),
    spare: z.number().min(0).max(1e12).multipleOf(0.01),
    oil: z.number().min(0).max(1e12).multipleOf(0.01),
    labour: z.number().min(0).max(1e12).multipleOf(0.01),
  })).min(1, "Add at least one customer request").max(100),
  acFitted: z.boolean().optional(),
  inHouse: z.boolean().optional(),
  isRepeat: z.boolean().optional(),
  previousJobId: z.string().optional(),
  repeatReason: z.string().optional(),
  remarks: z.string().max(500, "Keep remarks to 500 characters").optional(),
  tyres: z.array(z.object({ makeId: z.string().optional(), number: z.string().trim().max(100).optional() })).length(5),
  batteryMakeId: z.string().optional(),
  batteryNumber: z.string().trim().max(100).optional(),
  customField1: z.string().max(500).optional(),
  acType: z.enum(["FACTORY", "DEALER", "NONE"]).optional(),
  checklist: z.string().max(5000).optional(),
  estimatedParts: z.coerce.number().min(0).max(1e12).multipleOf(0.01).optional(),
  estimatedOil: z.coerce.number().min(0).max(1e12).multipleOf(0.01).optional(),
  estimatedLabour: z.coerce.number().min(0).max(1e12).multipleOf(0.01).optional(),
  serviceCharge: z.coerce.number().min(0).max(1e12).multipleOf(0.01).optional(),
  estimatedHours: z.coerce.number().nonnegative().optional(),
  estimatedCost: z.coerce.number().nonnegative().optional(),
}).superRefine((v, ctx) => {
  const promised = new Date(`${v.promisedDate}T${v.promisedTime}`);
  if (!Number.isFinite(promised.getTime()) || promised <= new Date()) ctx.addIssue({ code: "custom", path: ["promisedTime"], message: "Promised delivery must be in the future" });
  if (!v.technicianId && !v.teamId) ctx.addIssue({
    code: "custom",
    path: ["technicianId"],
    message: "Select a mechanic or team",
  });

  if (v.isRepeat && (!v.previousJobId || !v.repeatReason?.trim())) ctx.addIssue({
    code: "custom",
    path: ["repeatReason"],
    message: "Choose a previous job and enter the repeat reason",
  });
});

export type CreateJobCardFormValues = z.infer<typeof createJobCardSchema>;
