import { z } from "zod";

const optionalPositiveInt = z
  .string()
  .optional()
  .refine(
    (v) => !v || (Number.isInteger(Number(v)) && Number(v) > 0),
    "Enter a positive number",
  );

const optionalNonNegativeNumber = z
  .string()
  .optional()
  .refine(
    (v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0),
    "Enter a valid amount",
  );

export const createServiceSchema = z.object({
  name: z.string().min(1, "Service name is required"),
  description: z.string().optional().or(z.literal("")),
  category: z.string().optional().or(z.literal("")),
  durationMins: optionalPositiveInt.or(z.literal("")),
  price: optionalNonNegativeNumber.or(z.literal("")),
  isActive: z.boolean().optional(),
});

export const updateServiceSchema = z.object({
  name: z.string().min(1, "Service name is required").optional(),
  description: z.string().optional().or(z.literal("")),
  category: z.string().optional().or(z.literal("")),
  durationMins: optionalPositiveInt.or(z.literal("")),
  price: optionalNonNegativeNumber.or(z.literal("")),
  isActive: z.boolean().optional(),
});

export type CreateServiceFormValues = z.infer<typeof createServiceSchema>;
export type UpdateServiceFormValues = z.infer<typeof updateServiceSchema>;
