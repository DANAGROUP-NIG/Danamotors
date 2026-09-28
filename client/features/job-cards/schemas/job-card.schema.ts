import { z } from "zod";

export const createJobCardSchema = z.object({
  branchName: z.string().min(1, "Branch is required"),
  jobNumber: z.string().trim().min(1, "Job number is required"),
  description: z.string().trim().min(1, "Description is required"),
  appointmentId: z.union([z.string().uuid(), z.literal("")]).optional(),
  customerId: z.union([z.string().uuid(), z.literal("")]).optional(),
  vehicleId: z.union([z.string().uuid(), z.literal("")]).optional(),
  status: z.string().optional(),
  estimatedHours: z.coerce.number().nonnegative().optional(),
  estimatedCost: z.coerce.number().nonnegative().optional(),
  assignedTo: z.string().optional(),
});

export type CreateJobCardFormValues = z.infer<typeof createJobCardSchema>;
