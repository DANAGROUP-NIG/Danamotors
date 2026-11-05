import { z } from "zod";

export const createUserSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phoneNumber: z.string().optional(),
  roleId: z.string().optional(),
  /** Copy role and overrides from this user instead of choosing a role. */
  copyFromUserId: z.string().optional(),
  branchName: z.string().min(1, "Branch is required"),
}).refine((v) => !!v.roleId || !!v.copyFromUserId, { message: "Choose a role or a user to copy access from", path: ["roleId"] });

export const updateUserSchema = z.object({
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  email: z.string().email("Enter a valid email").optional(),
  phoneNumber: z.string().optional(),
  roleId: z.string().optional(),
  branchId: z.string().optional(),
  isActive: z.boolean().optional(),
  copyFromUserId: z.string().optional(),
});

export type CreateUserFormValues = z.infer<typeof createUserSchema>;
export type UpdateUserFormValues = z.infer<typeof updateUserSchema>;
