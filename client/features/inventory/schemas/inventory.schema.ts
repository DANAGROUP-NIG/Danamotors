import { z } from "zod";

export const branchStockEntrySchema = z.object({
  branchId: z.string().uuid("Invalid branch"),
  quantity: z.coerce.number().int("Quantity must be a whole number").nonnegative("Quantity must be 0 or more"),
  minimumStock: z.coerce.number().int().nonnegative().optional(),
  rackLocation: z.string().trim().max(100, "Max 100 characters").optional(),
});

export const createInventoryItemSchema = z.object({
  partNumber: z.string().min(1, "Part number is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  unitPrice: z.coerce.number().nonnegative("Unit price must be 0 or more"),
  branchStock: z.array(branchStockEntrySchema).optional(),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial();

export type CreateInventoryItemFormValues = z.infer<
  typeof createInventoryItemSchema
>;
export type UpdateInventoryItemFormValues = z.infer<
  typeof updateInventoryItemSchema
>;
