import { z } from "zod";

export const createCustomerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email"),
  phoneNumber: z.string().optional(),
  address: z.string().optional(),
  branchId: z.string().min(1, "Branch is required"),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export type CreateCustomerFormValues = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerFormValues = z.infer<typeof updateCustomerSchema>;
