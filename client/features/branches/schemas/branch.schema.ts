import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().min(1, "Branch name is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().email("Enter a valid email").optional(),
  code: z.string().trim().max(10, "Code must be 10 characters or less").optional(),
  parentBranchId: z.string().optional(),
});

export const updateBranchSchema = z.object({
  name: z.string().min(1, "Branch name is required").optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().email("Enter a valid email").optional(),
  code: z.string().trim().max(10, "Code must be 10 characters or less").optional(),
  parentBranchId: z.string().optional(),
});

export type CreateBranchFormValues = z.infer<typeof createBranchSchema>;
export type UpdateBranchFormValues = z.infer<typeof updateBranchSchema>;
