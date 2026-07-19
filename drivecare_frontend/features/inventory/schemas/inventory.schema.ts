import { z } from "zod";

export const createInventoryItemSchema = z.object({
  partNumber: z.string().min(1, "Part number is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  quantity: z.coerce.number().int().nonnegative("Quantity must be 0 or more"),
  unitCost: z.coerce.number().nonnegative("Unit cost must be 0 or more"),
  reorderLevel: z.coerce
    .number()
    .int()
    .nonnegative("Reorder level must be 0 or more"),
  supplierId: z.string().optional(),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial();

export type CreateInventoryItemFormValues = z.infer<
  typeof createInventoryItemSchema
>;
export type UpdateInventoryItemFormValues = z.infer<
  typeof updateInventoryItemSchema
>;
