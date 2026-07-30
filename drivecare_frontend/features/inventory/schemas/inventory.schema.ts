import { z } from "zod";

export const createInventoryItemSchema = z.object({
  partNumber: z.string().min(1, "Part number is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  unitPrice: z.coerce.number().nonnegative("Unit price must be 0 or more"),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial();

export type CreateInventoryItemFormValues = z.infer<
  typeof createInventoryItemSchema
>;
export type UpdateInventoryItemFormValues = z.infer<
  typeof updateInventoryItemSchema
>;
