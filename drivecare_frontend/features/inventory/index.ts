// Public API for the inventory feature
export { InventoryPage } from "./components/inventory-page";
export { InventoryCreateForm } from "./components/InventoryCreateForm";
export { InventoryEditForm } from "./components/InventoryEditForm";
export { InventoryDeleteButton } from "./components/InventoryDeleteButton";
export { InventoryTable } from "./components/InventoryTable";
export { useInventory } from "./hooks/use-inventory";
export { useCreateInventoryItem } from "./hooks/use-create-inventory-item";
export { useUpdateInventoryItem } from "./hooks/use-update-inventory-item";
export { useDeleteInventoryItem } from "./hooks/use-delete-inventory-item";
export { inventoryKeys } from "./api/inventory.keys";
export {
  getInventoryRequest,
  getInventoryItemRequest,
  createInventoryItemRequest,
  updateInventoryItemRequest,
  deleteInventoryItemRequest,
} from "./api/inventory.api";
export {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  type CreateInventoryItemFormValues,
  type UpdateInventoryItemFormValues,
} from "./schemas/inventory.schema";
export type {
  InventoryItem,
  CreateInventoryItemPayload,
  UpdateInventoryItemPayload,
  InventoryListResponse,
} from "./types/inventory.types";
