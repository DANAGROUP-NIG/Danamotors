export type InventoryItem = {
  id: string;
  partNumber: string;
  name: string;
  description?: string;
  category: string;
  quantity: number;
  unitCost: number;
  reorderLevel: number;
  supplierId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateInventoryItemPayload = {
  partNumber: string;
  name: string;
  description?: string;
  category: string;
  quantity: number;
  unitCost: number;
  reorderLevel: number;
  supplierId?: string;
};

export type UpdateInventoryItemPayload = Partial<CreateInventoryItemPayload>;

export type InventoryListResponse = {
  items: InventoryItem[];
  total: number;
  page: number;
  pageSize: number;
};
