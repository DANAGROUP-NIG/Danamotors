import { z } from "zod";

export const createJobCardSchema = z.object({
  branchName: z.string().min(1, "Branch is required"),
  jobNumber: z.string().min(1, "Job number is required"),
  description: z.string().min(1, "Description is required"),
  appointmentId: z.string().optional(),
  customerId: z.string().optional(),
  vehicleId: z.string().optional(),
  status: z.string().optional(),
  estimatedHours: z.coerce.number().optional(),
  estimatedCost: z.coerce.number().optional(),
  assignedTo: z.string().optional(),
});

export type CreateJobCardFormValues = z.infer<typeof createJobCardSchema>;
